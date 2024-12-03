import { Peer } from "peerjs";
import { JsonSerialize } from "../serializer";
import { UkdbError } from "../util";
import { DisconnectRequestHandler } from "../handlers";

export class Connection {
  constructor(conn, type = "") {
    this.conn = conn;
    this.type = type;
    this.userUUID = "";
    this.connId = "";
    this._waitOpen = new Promise((r, rej) => {
      this.conn.on("open", () => {
        r();
      });
    });
    this.extra = {};
    this._onData = () => {};
    this.serializer = new JsonSerialize();
    this.conn.on("data", (data) => {
      let dataObj = this.serializer.unSerialize(data);
      this._onData(dataObj, this);
      return;
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
      config: {
        iceServers: [
          { url: "stun:stun.l.google.com:19302" },
          {
            url: "turn:n2.psj2867.com:3478",
            username: "user1",
            credential: "user1",
          },
        ],
      },
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
      await this._connAfter(newConn);
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
    if (peerConn == null) throw new UkdbError("peer is null");
    let newConn = new Connection(peerConn, "join");
    newConn.userUUID = peerConn.peer;
    await this._connAfter(newConn);
    return newConn;
  }
  async _connAfter(newConn) {
    try {
      this._connectionConfigSetter(newConn);
      this.connections.push(newConn);
      await this._onConnectionAfter(newConn);
    } catch (error) {
      this.disconnect(newConn);
      throw error;
    }
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
  disconnect(member) {
    member.disconnect();
    this.connections = this.connections.filter((v) => v != member);
  }
}
