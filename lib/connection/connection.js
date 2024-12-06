import { Peer } from "peerjs";
import { JsonSerialize } from "../serializer";
import { HandlerList } from "../util";

export class Connection {
  constructor(conn, type = "") {
    this.conn = conn;
    this.type = type;
    this.userUUID = "";
    this.connId = "";
    this.state = "new";
    this.extra = {};
    this._onData = () => {};
    this.onError = new HandlerList();
    this.serializer = new JsonSerialize();
    this._waitOpen = new Promise((r, rej) => {
      this.conn.on("open", () => {
        this.state = "open";
        r();
      });
      this.onError.add((type, err) => {
        rej(type);
      });
    });
    this.conn.on("error", (err) => {
      this.onError.handle(err.type, err);
    });
    this.conn.on("data", (data) => {
      let dataObj = this.serializer.unSerialize(data);
      this._onData(dataObj, this);
      return;
    });
    this.conn.on("close", () => {
      this.onError.handle("close");
    });
  }
  async waitOpen() {
    await this._waitOpen;
    this.userUUID = this.conn.peer;
    this.connId = this.conn.label;
  }
  send(data) {
    this.conn.send(this.serializer.serialize(data));
  }
  disconnect() {
    this.conn.close({ flush: true });
    this.conn.on("data", () => {});
  }
  onData(h) {
    this._onData = h;
  }
}

export class MemberConnections {
  constructor(userInfo, config) {
    this.userInfo = userInfo;
    this.userUUID = userInfo;
    this.type = "";
    this.peer = new Peer(this.userUUID, {
      host: "n1.psj2867.com",
      port: 9000,
      debug: config.debug,
      config: config.rtc_config,
    });
    this.connections = [];
    this._connectionConfigSetter = async () => {};
    this._onConnectionAfter = async () => {};
    this._waitOpen = new Promise((r, rej) => {
      this.peer.on("open", () => {
        r();
      });
    });
    this.peer.on("connection", async (c) => {
      let newConn = new Connection(c, "receive");
      newConn.userUUID = c.peer;
      this._connectionConfigSetter(newConn);
      this.connections.push(newConn);
      await this._onConnectionAfter(newConn);
    });
    this.peer.on("close", (...args) => {
      throw "peer is destroyed";
    });
    this.peer.on("error", (error) => {
      let type = error.type;
      if (type == "peer-unavailable") {
        let id = error.message.slice("Could not connect to peer ".length);
        this.connections
          .filter((e) => e.state == "new")
          .filter((e) => e.userUUID == id)
          .forEach((e) => e.onError.handle(type, error));
      } else {
        throw error.type;
      }
    });
  }
  async init() {
    await this.waitOpen();
  }
  async waitOpen() {
    await this._waitOpen;
  }
  async join(remoteUserInfo) {
    let remoteUserUUID = remoteUserInfo;
    let peerConn = this.peer.connect(remoteUserUUID);
    if (peerConn == null) throw "peer is null";
    let newConn = new Connection(peerConn, "join");
    newConn.userUUID = peerConn.peer;
    this._connectionConfigSetter(newConn);
    this.connections.push(newConn);
    await this._onConnectionAfter(newConn);
    return newConn;
  }
  getConnetions() {
    return this.connections;
  }
  getConnCount() {
    return this.connections.length;
  }
  get(userUUID) {
    let conns = this.connections.filter((e) => e.userUUID == userUUID);
    if (conns.length == 0) return null;
    return conns[0];
  }
  remove(member) {
    this.connections = this.connections.filter((v) => v != member);
  }
  disconnect(member) {
    member.disconnect();
    this.remove(member);
  }
}
