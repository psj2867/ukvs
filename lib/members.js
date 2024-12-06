import { v4 as uuidv4 } from "uuid";
import { Record, Storage } from "./storage";
import setDynterval from "dynamic-interval";
import {
  getLogger,
  HandlerList,
  nowMs,
  splitArr,
  timeoutPromise,
  UkvdbError,
} from "./util";
import { MessageBuffer } from "./buffer";

import { Connection, MemberConnections } from "./connection/connection";
import { DisconnectRequestHandler, HeartbeatHandler } from "./handlers";
import { Reconnector } from "./reconnector";

const logger = getLogger("members");
const message_logger = getLogger("message");

export class TransactionData {
  constructor(type = "", data = {}, ttl = 0) {
    this.type = type;
    this.data = data;
    this.ttl = ttl;
  }
}

export class MemberManager {
  /**
   * learner -> node # copy or copied or be alone
   * @param {Members} members
   */
  constructor(userUUID = null, members, config = {}) {
    this.state = "learner";
    this.storage = null;
    this.members = members;
    this.receiver = {};
    this.config = {
      debug: -1,
      init_timeout: 1000 * 30,
      setMe_interval: 1000 * 10,
      reconnect_interval: 1000 * 60 * 5,
      heartbeat_Interval: 1000 * 3,
      heartbeat_RandomDiff: 1000 * 0.5,
      heartbeat_ResponseTimeout: 1000 * 2,
      heartbeat_rety: 1, //3;
      members_minMember: 2,
      members_maxMember: 4,
      join_timeout: 1000 * 60,
      buffer_timeout: 0,
      buffer_maxsize: 50,
      disCacheTime: 500,
    };
    this.config = { ...this.config, ...config };

    this.myUserUUID = uuidv4().slice(0, 4);
    if (userUUID) {
      this.myUserUUID = userUUID;
    }
    this.connectionManager = new MemberConnections(
      this.myUserUUID,
      this.config
    );
    this.connectionManager._connectionConfigSetter = (c) => {
      c.extra.open = false;
      this.setReceiver(c);
    };
    this.connectionManager._onConnectionAfter = async (c) => {
      if (c.type == "join") {
        this._onMemberHandlers.handle("connect", c.userUUID, c);
      } else {
        this._onMemberHandlers.handle("connected", c.userUUID, c);
      }
      try {
        await timeoutPromise(c.waitOpen(), this.config.join_timeout);
        c.extra.connectedTime = nowMs();
        c.extra.open = true;
        this._onMemberHandlers.handle("open", c.userUUID, c);
      } catch (error) {
        this.connectionManager.remove(c);
        throw error;
      }
    };
    this._onMemberHandlers = new HandlerList();

    MessageBuffer.bufTime = this.config.buffer_timeout;
    MessageBuffer.maxSize = this.config.buffer_maxsize;
  }
  /**
   * @param {Storage} storage
   */
  setStorage(storage) {
    this.storage = storage;
  }

  async init() {
    if (this.storage == null) {
      throw new UkvdbError("init after call setStorage");
    }
    await timeoutPromise(
      this.connectionManager.init(),
      this.config.init_timeout,
      "peerjs server connect error"
    );
    this.heartbeatHandler = new HeartbeatHandler(
      this,
      this.storage.manager,
      this.config.heartbeat_rety,
      this._onMemberHandlers
    ).init();
    this.disconnectRequestHandler = new DisconnectRequestHandler(
      this,
      this.storage.manager
    ).init();
    this.reconnector = new Reconnector(this, this.storage);
    this.setOnMemberConnInfo();
    this.startInterval();
    this.members.onConnMember((type, id, member) => {
      if (
        this.state == "quit" ||
        type == "quit" ||
        type == "clean" ||
        type == "join_fail"
      ) {
        logger.debug(`onConn: ${type} with ${id}`);
        return;
      }
      logger.debug(
        `onConn: ${type} with ${id}:${member.connId} alive=${member.extra.alive}, open=${member.extra.open}`
      );
      if (type == "disconnect") {
        this.reconnector.reconnect();
      }
      if (type == "open" || type == "stateChange") {
        this.reconnector.disconnectDup();
        this.reconnector.disconnectForMaxMember();
      }

      if (this.getConnMembers(false, false).length == 0) {
        this.setState("learner");
      }
      if (type == "open" && this.state != "node") {
        this.syncInit(member);
      }

      if (type == "open") {
        this.storage.manager.syncHandler.syncIfInf(member);
      }
      if (type != "connect") {
        this.setMe();
      }
    });
  }
  setOnMemberConnInfo() {
    this.cancel_on_memberme = this.storage.onSpecial(
      `member_${this.myUserUUID}`,
      (k, d, old) => {
        if (d.data == null) {
          this.setMe();
          return;
        }
        if (old == null || d.data.connCount != old.data.connCount)
          this.storage.set(
            this.makeConnKey(this.myUserUUID),
            this.getConnMembers(true).map((c) => c.userUUID)
          );
      }
    );
    this.cancel_on_member = this.storage.onSpecial(`member_.*`, (k, d, old) => {
      if (d.data == null || old == null || d.data?.state == old.data?.state)
        return;
      k = k.slice("member_".length);
      let inConn = (i) =>
        this.getConnMembers(false, false)
          .map((c) => c.userUUID)
          .indexOf(k) >= 0;
      if (inConn(k)) {
        this._onMemberHandlers.handle(
          "stateChange",
          k,
          this.connectionManager.get(k)
        );
      }
    });
    this.storage.onSpecial("conn_.*", (k, d) => {
      this.storage.manager.setHandler.calculateMaxDistance();
    });
  }

  /**
   * @param {Connection} conn
   */
  setReceiver(conn) {
    conn.extra.disconnect = (comment = "user") => {
      this.disconnectRequestHandler.requestDisconnect(conn, comment);
    };
    conn.extra.alive = false;
    conn.extra.retry = this.config.heartbeat_rety;
    conn.extra._waitNexts = new Map();
    conn.extra.waitNext = (type) => {
      let hInfo = {
        handler: null,
        next: false,
      };
      let data = new Promise((r, rej) => {
        if (!conn.extra._waitNexts.has(type)) {
          conn.extra._waitNexts.set(type, []);
        }
        hInfo.handler = (transactionData) => {
          r(transactionData.data);
        };
        conn.extra._waitNexts.get(type).push(hInfo);
      });

      return {
        async get() {
          return await data;
        },
        cancel(next = true) {
          hInfo.next = next;
          hInfo.handler = () => {};
        },
      };
    };
    conn.onData((datas) => {
      message_logger.debug(`receive message len=${datas.length}`);
      let [setDatas, others] = splitArr(datas, (e) => e.type == "set");
      let [heartbeatDatas, others_others] = splitArr(
        others,
        (e) => e.type == "heartbeat"
      );
      setDatas.reverse();
      for (const d of heartbeatDatas) {
        this.handle(conn, d);
      }
      for (const d of setDatas) {
        this.handle(conn, d);
      }
      for (const d of others_others) {
        this.handle(conn, d);
      }
    });
  }

  handle(conn, transactionData) {
    message_logger.trace(
      `receive from ${conn.userUUID}, ${transactionData.type}, ${transactionData.ttl}`,
      transactionData.data
    );
    if (conn.extra._waitNexts.has(transactionData.type)) {
      let hss = conn.extra._waitNexts.get(transactionData.type);
      for (let h = hss.shift(); h !== undefined; h = hss.shift()) {
        h.handler(transactionData);
        if (h.next == false) {
          break;
        }
      }
    }
    if (transactionData.type in this.receiver) {
      this.receiver[transactionData.type](transactionData, conn);
    }
  }

  //  interval
  startInterval() {
    this.startHeartbeat();
    setInterval(() => {
      this.setMe();
    }, this.config.setMe_interval);
    setInterval(() => {
      if (this.state !== "quit") this.reconnector.reconnect();
    }, this.config.reconnect_interval);
  }

  startHeartbeat() {
    let interval = this.config.heartbeat_Interval;
    let diff = this.config.heartbeat_RandomDiff;
    setDynterval(
      () => {
        for (const member of this.getConnMembers()) {
          this.heartbeatHandler.heartbeat(
            member,
            this.config.heartbeat_ResponseTimeout
          );
        }
        return { wait: interval + Math.random() * diff * 2 - diff };
      },
      { wait: 1000 }
    );
  }

  disconnect(member, comment) {
    logger.debug(
      `disconnect with ${member.userUUID}:${
        member.connId
      } by ${comment} state=${
        this.getMemberRecord(member.userUUID)?.data?.state
      }`
    );
    this.connectionManager.disconnect(member);
    this._onMemberHandlers.handle("disconnect", member.userUUID, member);
  }

  getMemberRecord(userUUID) {
    return this.storage.get(this.makeMemberKey(userUUID));
  }
  /**
   * @param {'node'|'learner'} state
   */
  getConnMembers(onlyAlive = false, open = true, state = null) {
    let conns = this.connectionManager.getConnetions();
    if (onlyAlive) {
      conns = conns.filter((m) => m.extra.alive == true);
    }
    if (open) {
      conns = conns.filter((m) => m.extra.open == true);
    }
    if (state != null) {
      conns = conns.filter(
        (m) => this.getMemberRecord(m.userUUID)?.data?.state == state
      );
    }
    return conns;
  }

  isInConn(
    userUUID,
    onlyAlive = false,
    open = true,
    state = null,
    includeMe = true
  ) {
    let conns = this.getConnMembers(onlyAlive, open, state);
    return (
      conns.filter((e) => {
        if (includeMe && e.userUUID == this.myUserUUID) return true;
        return e.userUUID == userUUID;
      }).length > 0
    );
  }
  isNotInConn(
    userUUID,
    onlyAlive = false,
    open = true,
    state = null,
    includeMe = true
  ) {
    return !this.isInConn(userUUID, onlyAlive, open, state, includeMe);
  }

  makeMemberKey(id) {
    return "$member_" + id;
  }
  makeConnKey(id) {
    return "$conn_" + id;
  }

  cleanMemberData(userUUID, comment = "clean") {
    logger.debug(`clean member ${userUUID}`);
    this.storage.set(this.makeMemberKey(userUUID), null);
    this.storage.set(this.makeConnKey(userUUID), null);
    this.connectionManager
      .getConnetions()
      .filter((m) => m.userUUID == userUUID)
      .forEach((m) => {
        this.disconnect(m, comment);
      });
    this._onMemberHandlers.handle("clean", userUUID, { userUUID });
  }

  /**
   * @param {TransactionData} data
   */
  send(conn, data, flush = false) {
    MessageBuffer.add(conn, data, flush);
  }

  /**
   * @param {TransactionData} data
   */
  sendAll(data) {
    this.sendAllExcept(data, null);
  }
  /**
   * @param {TransactionData} data
   */
  sendAllExcept(data, except) {
    for (const conn of this.getConnMembers(false, true)) {
      if (conn == except) continue;
      this.send(conn, data);
    }
  }

  setMe() {
    this.storage.set(this.makeMemberKey(this.myUserUUID), {
      connCount: this.getConnMembers(true).length,
      last: nowMs(),
      state: this.state,
      uuid: this.myUserUUID,
    });
  }
  /**
   * @param {'learner'|'node'} state
   */
  setState(state) {
    if (this.state === state) {
      this.state = state;
    } else {
      this.state = state;
      this.setMe();
    }
  }
  async syncInit(member) {
    await this.storage.manager.copyHandler.requestCopySpecialData(member);
    await this.members.manager.reconnector.reconnect();
    this.setState("node");
  }
  quit() {
    this.state = "quit";
    this._onMemberHandlers.handle("quit", this.myUserUUID, null);
    this.cancel_on_member();
    this.cancel_on_memberme();
    this.storage.set(`$member_${this.myUserUUID}`, null);
    this.storage.set(`$conn_${this.myUserUUID}`, null);
    for (const member of this.connectionManager.getConnetions()) {
      this.disconnectRequestHandler.requestDisconnect(member, "quit");
    }
  }
}

export class Members {
  Member_keyword = "member_";
  constructor(userUUID = null, config = {}) {
    this.manager = new MemberManager(userUUID, this, config);
    this.myUserUUID = this.manager.myUserUUID;
  }

  async _join(remoteId) {
    try {
      let member = await this.manager.connectionManager.join(remoteId);
      return member;
    } catch (error) {
      this.manager._onMemberHandlers.handle("join_fail", remoteId, null);
      throw new UkvdbError(error);
    }
  }
  async join(remoteId) {
    logger.debug(`try join with ${remoteId}`);
    if (remoteId == this.myUserUUID)
      throw new UkvdbError("reject: join with myself");
    if (this.manager.isInConn(remoteId))
      throw new UkvdbError("reject: join with dup");
    let member = await this._join(remoteId);
    return member;
  }
  async joinAndClean(remoteId) {
    try {
      await this.join(remoteId);
    } catch (error) {
      this.manager.cleanMemberData(remoteId, "join");
      throw error;
    }
  }
  quit() {
    this.manager.quit();
  }
  getConnMembers(onlyAlive = false, open = true) {
    return this.manager.getConnMembers(onlyAlive, open);
  }
  getAllMembers() {
    let members = this.getAllMemberList();
    return Object.fromEntries(members);
  }

  getAllMemberList() {
    let members = this.manager.storage
      .findSpecial(this.Member_keyword)
      .map((d) => [d.key.slice(this.Member_keyword.length), d.data]);
    return members;
  }
  disconnectById(userUUID) {
    this.getConnMembers(false, false)
      .filter((e) => e.userUUID == userUUID)
      .forEach((e) => this.manager.disconnect(e, "disconnectById"));
  }
  /**
   * @param {(type:'newRecord'|'changeCount'|'removeMember', id:string, memeberRecord:Record)=>void} h
   */
  onMember(h) {
    return this.manager.storage.onSpecial(
      this.Member_keyword + ".*",
      (k, d, old) => {
        let id = k.slice(this.Member_keyword.length);
        if (old == null) {
          h("newRecord", id, d);
          return;
        }
        if (d.data == null) {
          h("removeMember", id, d);
          return;
        }
        if (old.data.connCount != d.data.connCount) {
          h("changeCount", id, d);
          return;
        }
      }
    );
  }
  /**
   * connect -> open -> changeAlive , stateChange -> disconnect
   * member is null, when type = 'clean' | 'quit'
   * @param {(type:'connect'|'open'|'stateChange'|'disconnect'|'changeAlive'|'clean'|'quit'|'join_fail', id:string, memeber:Connection, )=>void} h
   */
  onConnMember(h) {
    return this.manager._onMemberHandlers.add((type, id, member) => {
      h(type, id, member);
    });
  }
}
