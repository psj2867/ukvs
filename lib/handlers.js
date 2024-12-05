import { caculateLongestDistance, getNodeDistance } from "./graph";
import { MemberManager, TransactionData } from "./members";
import { Record, Storage, StorageManager } from "./storage";
import {
  getLogger,
  HandlerList,
  nowMs,
  timeoutPromise,
  UkvdbError,
} from "./util";
import { v4 as uuidv4 } from "uuid";

/**
 * @param {Record[]} datas
 */
function mergeData(storageManager, datas) {
  if (datas)
    for (const v of datas) {
      storageManager.setRecord(new Record().load(v));
    }
}
/**
 * @param {SetHandler} setHandler
 * @param {Record[]} datas
 */
function mergeAndGossipData(setHandler, datas, member = null) {
  if (datas)
    for (const v of datas) {
      let record = new Record().load(v);
      setHandler.setRecord(record, member);
    }
}

const sync_logger = getLogger("handler_sync");
export class SyncHandler {
  /**
   * @param {MemberManager} memberManager
   * @param {StorageManager} storageManager
   * @param {SetHandler} setHandler
   */
  constructor(memberManager, storageManager, setHandler) {
    this.memberManager = memberManager;
    this.storageManager = storageManager;
    this.setHandler = setHandler;
  }

  init() {
    this.memberManager.receiver["sync_req"] = async (
      transactionData,
      member
    ) => {
      let requestData = transactionData.data;
      sync_logger.debug(`responser:recv sync_req with ${member.userUUID}`);
      let gossip = requestData.gossip;
      let syncData = this.syncCmp(requestData.ids);
      sync_logger.debug(
        `responser:send sync_res&req with ${member.userUUID}`,
        syncData
      );
      this.memberManager.send(
        member,
        new TransactionData("sync_res&req", {
          ids: syncData.requestIds,
          data: syncData.returnData,
        })
      );

      let resData = await member.extra.waitNext("sync_res").get();
      sync_logger.debug(
        `responser:recv sync_res with ${member.userUUID}`,
        resData
      );
      if (gossip) {
        mergeAndGossipData(this.setHandler, resData, member);
      } else {
        mergeData(this.storageManager, resData);
      }
    };
    return this;
  }
  async sync(member, gossip = false) {
    sync_logger.debug(`requester:send sync_req with ${member.userUUID}`);
    let v = this.storageManager.toRecords().map((r) => {
      return { key: r.key, rawId: r.rawId };
    });
    this.memberManager.send(
      member,
      new TransactionData("sync_req", {
        ids: v,
      })
    );

    let resReqData = await member.extra.waitNext("sync_res&req").get();
    sync_logger.debug(
      `requester:recv sync_res&req with ${member.userUUID}`,
      resReqData
    );

    let data = resReqData.data;
    let dataIds = resReqData.ids;
    if (gossip) {
      mergeAndGossipData(this.setHandler, data, member);
    } else {
      mergeData(this.storageManager, data);
    }
    let returnData = dataIds
      .map((k) => this.storageManager.storage.get(k))
      .filter((r) => r != null);
    sync_logger.debug(
      `requester:send sync_res with ${member.userUUID}`,
      returnData
    );
    this.memberManager.send(
      member,
      new TransactionData("sync_res", returnData)
    );
  }
  /**
   * @param {{key:string,rawId:string}[]} remoteIds
   */
  syncCmp(remoteIds) {
    // for remote
    let returnData = [];
    // for local
    let requestIds = [];

    let localSet = new Set(
      this.storageManager.storage.find(".*").map((e) => e.key)
    );
    let remoteSet = new Set(remoteIds.map((e) => e.key));
    // local - remote
    for (const onlyLocalId of localSet.difference(remoteSet)) {
      returnData.push(this.storageManager.storage.get(onlyLocalId));
    }
    // local U remote
    for (const commonId of localSet.intersection(remoteSet)) {
      let localRecord = this.storageManager.storage.get(commonId);
      let remoteRawId = remoteIds.filter((e) => e.key == commonId)[0].rawId;
      if (localRecord._gt(remoteRawId)) {
        returnData.push(localRecord);
      } else if (localRecord.rawId == remoteRawId) {
        continue;
      } else {
        requestIds.push(localRecord.key);
      }
    }
    // remote - local
    for (const onlyRemoteId of remoteSet.difference(localSet)) {
      requestIds.push(onlyRemoteId);
    }
    return {
      returnData,
      requestIds,
    };
  }
  async syncIfInf(member) {
    let distances = getNodeDistance(
      this.memberManager.myUserUUID,
      this.memberManager.storage,
      this.memberManager.members
    );
    if (!isFinite(distances[member.userUUID])) {
      this.sync(member, true);
    }
  }
}

const heartbeat_logger = getLogger("handler_heartbeat");
export class HeartbeatHandler {
  /**
   * @param {MemberManager} memberManager
   * @param {StorageManager} storageManager
   * @param {HandlerList} _onMemberHandlers
   */
  constructor(memberManager, storageManager, maxRetry, _onMemberHandlers) {
    this.memberManager = memberManager;
    this.storageManager = storageManager;
    this._onMemberHandlers = _onMemberHandlers;
    this.maxRetry = maxRetry;
  }
  init() {
    this.memberManager.receiver["heartbeat"] = (d, member) => {
      let orgAlive = member.extra.alive;
      let send_time = nowMs();
      this.memberManager.send(
        member,
        new TransactionData("heartbeat_ret", {
          heartbeat_id: d.data.heartbeat_id,
          send_time,
        }),
        true
      );
      let delay = send_time - d.data.send_time;
      heartbeat_logger.debug(
        `receiver: delay with ${member.userUUID} = ${delay}ms`
      );
      member.extra.alive = true;
      if (orgAlive != member.extra.alive)
        this._onMemberHandlers.handle("changeAlive", member.userUUID, member);
    };
    return this;
  }
  async heartbeat(member, timeout) {
    let orgAlive = member.extra.alive;
    try {
      await this.heartbeatOnce(member, timeout);
      member.extra.retry = this.maxRetry;
      member.extra.alive = true;
    } catch (error) {
      if (!(error instanceof UkvdbError)) {
        throw error;
      }
      member.extra.retry--;
      // member.extra.alive = false;
      if (member.extra.retry > 0) {
        return;
      }
      this.memberManager.disconnect(member, "heartbeat");
    } finally {
      if (orgAlive != member.extra.alive)
        this._onMemberHandlers.handle("changeAlive", member.userUUID, member);
    }
  }
  async heartbeatOnce(member, timeout) {
    let send_time = nowMs();
    let heartbeat_id = uuidv4();
    heartbeat_logger.debug(
      `send heartbeat with ${member.userUUID} id=${heartbeat_id}`
    );
    this.memberManager.send(
      member,
      new TransactionData("heartbeat", {
        heartbeat_id,
        send_time,
      }),
      true
    );
    let heartbeat_ret = member.extra.waitNext("heartbeat_ret");
    try {
      let response = await timeoutPromise(heartbeat_ret.get(), timeout);
      if (response.heartbeat_id != heartbeat_id) {
        throw UkvdbError("not matched heartbeat_id");
      }
      let delay = response.send_time - send_time;
      heartbeat_logger.debug(
        `sender: delay with ${member.userUUID} = ${delay}ms id=${heartbeat_id}`
      );
    } catch (error) {
      heartbeat_ret.cancel();
      heartbeat_logger.debug(
        `heartbeat fail with ${member.userUUID} err=${error.msg} id=${heartbeat_id}`
      );
      throw error;
    }
  }
}

export class CopySpecialDataHandler {
  /**
   * @param {MemberManager} memberManager
   * @param {StorageManager} storageManager
   * @param {SetHandler} setHandler
   */
  constructor(memberManager, storageManager, setHandler) {
    this.memberManager = memberManager;
    this.storageManager = storageManager;
    this.setHandler = setHandler;
  }
  init() {
    this.memberManager.receiver["copySpecial"] = (d, conn) => {
      let records = this.storageManager.storage.findSpecial(".*", false);
      this.memberManager.setState("node");
      this.memberManager.send(
        conn,
        new TransactionData("copySpecial_ret", records),
        true
      );
    };
    return this;
  }
  /**
   * @param {Connection} member
   */
  async requestCopySpecialData(member) {
    this.memberManager.send(member, new TransactionData("copySpecial", {}));
    let d = await member.extra.waitNext("copySpecial_ret").get();
    this.memberManager.setState("node");
    mergeData(this.storageManager, d);
  }
}
const data_logger = getLogger("data");
const special_logger = getLogger("special_data");
export class SetHandler {
  /**
   * @param {MemberManager} memberManager
   * @param {StorageManager} storageManager
   */
  constructor(memberManager, storageManager) {
    this.memberManager = memberManager;
    this.storageManager = storageManager;
    this.maxDisCache = {
      value: 0,
      date: Date.now(),
    };
  }
  init() {
    this.memberManager.receiver["set"] = (d, conn) => {
      let record = new Record().load(d.data);
      if (this.storageManager.setRecord(record)) {
        this.gossipData(d, conn);
      }
    };
    return this;
  }
  set(k, v) {
    let record = new Record(v, k, this.memberManager.myUserUUID);
    if (k in this.storageManager.datamap) {
      record.cnt = this.storageManager.datamap[k].cnt;
      record.genId();
    }
    this.setRecord(record);
  }
  setRecord(record, conn = null) {
    if (this.storageManager.setRecord(record)) {
      this.gossipData(new TransactionData("set", record, this.getTTL()), conn);
    }
  }

  gossipData(transactionData, conn = null) {
    this.logData(transactionData, conn);
    if (transactionData.ttl < 1) {
      return;
    }
    transactionData.ttl--;
    if (conn) {
      this.memberManager.sendAllExcept(transactionData, conn);
    } else {
      this.memberManager.sendAll(transactionData);
    }
  }
  calculateMaxDistance() {
    this.maxDisCache.value = caculateLongestDistance(
      this.storageManager.storage,
      this.memberManager.members
    );
    this.maxDisCache.date = Date.now();
    return this.maxDisCache.value;
  }
  getMaxDistance() {
    return this.maxDisCache.value;
  }
  logData(transactionData, conn) {
    if (!transactionData.data.key.startsWith("$"))
      data_logger.debug(
        `gossip data ttl=${transactionData.ttl} by ${conn?.userUUID}`,
        transactionData
      );
    else
      special_logger.debug(
        `gossip data ttl=${transactionData.ttl} by ${conn?.userUUID}`,
        transactionData
      );
  }

  getTTL() {
    const minTTL = 1;
    let maxDis = this.getMaxDistance();
    if (isFinite(maxDis)) {
      return Math.max(maxDis, minTTL);
    }
    return minTTL;
  }
}

export class DisconnectRequestHandler {
  /**
   * @param {MemberManager} memberManager
   * @param {StorageManager} storageManager
   */
  constructor(memberManager, storageManager) {
    this.memberManager = memberManager;
    this.storageManager = storageManager;
  }
  init() {
    this.memberManager.receiver["disconnect"] = (d, conn) => {
      this.memberManager.disconnect(conn, `recv:${d.data.comment}`);
    };
    return this;
  }
  /**
   * @param {Connection} member
   */
  async requestDisconnect(member, comment) {
    this.memberManager.send(
      member,
      new TransactionData("disconnect", { comment }),
      true
    );
    this.memberManager.disconnect(member, `send:${comment}`);
  }
}
