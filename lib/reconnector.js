import { getNodeDistance } from "./graph";
import { MemberManager } from "./members";
import { Storage } from "./storage";
import { getLogger, UkvdbError } from "./util";

const logger = getLogger("reconnector");

export class Reconnector {
  /**
   * @param {MemberManager} members
   * @param {Storage} storage
   */
  constructor(members, storage) {
    this.memberManager = members;
    this.storage = storage;
  }

  getMembersInfo() {
    let distances = getNodeDistance(
      this.memberManager.myUserUUID,
      this.storage,
      this.memberManager.members
    );

    let allMemebers = this.memberManager.members
      .getAllMemberList()
      .map(([k, v]) => {
        return {
          userUUID: k,
          ...v,
          distance: distances[k].distance,
        };
      })
      .filter((e) => e.userUUID != this.memberManager.myUserUUID);
    return allMemebers;
  }

  sortConnectOrder(allMemebers) {
    let shuffled = allMemebers
      .map((e) => {
        return {
          userUUID: e.userUUID,
          distance: e.distance - Math.random() * 1,
          connCount: e.connCount,
        };
      })
      .sort((a, b) => {
        // distance -> desc
        // connCount -> asc
        if (a.distance == b.distance) {
          return a.connCount - b.connCount;
        }
        return b.distance - a.distance;
      });
    return shuffled;
  }
  async reconnect() {
    await this.disconnectDup();
    await this.disconnectForMaxMember();
    await this.reconnectForInfiniteDistance();
    await this.reconnectForMinMember();
  }
  async reconnectForMinMember() {
    let membersInfo = this.getMembersInfo();
    let memberSize = this.memberManager.members.getAllMemberList().length;
    let target = Math.floor(
      Math.log(memberSize) /
        Math.log(this.memberManager.config.members_maxMember)
    );
    target = Math.min(
      this.memberManager.config.members_maxMember,
      Math.max(this.memberManager.config.members_minMember, target)
    );
    let connCount = this.memberManager.getConnMembers(false, false).length;
    if (connCount >= target) {
      return;
    }
    membersInfo = membersInfo.filter((e) =>
      this.memberManager.isNotInConn(e.userUUID, false, false)
    );
    let reconnectOrder = this.sortConnectOrder(membersInfo);
    if (reconnectOrder.length != 0)
      logger.debug(
        `reconnect by MinMember ${connCount}->${target} order `,
        reconnectOrder
      );
    let n = target - connCount;
    for (let index = 0; n > 0 && index < reconnectOrder.length; index++) {
      let userUUID = reconnectOrder[index].userUUID;
      if (await this.tryJoin(userUUID, "MinMember")) {
        n--;
      }
    }
  }

  async reconnectForInfiniteDistance() {
    let membersInfo = this.getMembersInfo();
    let connCount = this.memberManager.getConnMembers(false, false).length;
    let unconnectedInfMembers = membersInfo
      .filter((e) => this.memberManager.isNotInConn(e.userUUID, false, false))
      .filter((e) => !isFinite(e.distance))
      .sort((a, b) => a.connCount - b.connCount - Math.random());
    let n = this.memberManager.config.members_maxMember - connCount;
    n = Math.min(n, 1);
    let index = 0;
    while (n > 0 && index < unconnectedInfMembers.length) {
      let member = unconnectedInfMembers[index];
      index++;
      if (await this.tryJoin(member.userUUID, "infinite")) {
        n--;
      }
    }
  }
  async reconnectForMismatchInfo() {
    const notInConList = (id) =>
      this.memberManager.isNotInConn(id, false, false);
    let conns = this.storage.findSpecial("conn_.*");
    for (const record of conns) {
      let srcId = record.key.slice("conn_".length);
      for (const destId of record.data) {
        if (
          srcId != this.memberManager.myUserUUID &&
          destId == this.memberManager.myUserUUID &&
          notInConList(srcId)
        ) {
          logger.debug(`reconnect with ${srcId} by mismatch_info`);
          await this.tryJoin(srcId);
        }
      }
    }
  }

  async disconnectForMaxMember() {
    let connCount = this.memberManager.getConnMembers().length;
    if (connCount > this.memberManager.config.members_maxMember) {
      this.disconnectN(connCount - this.memberManager.config.members_maxMember);
      return;
    }
  }
  async randomDisconnect() {
    let connList = this.memberManager.getConnMembers(true);
    let memberForDisconeect = connList[Math.floor(Math.random() * connList)];
    this.memberManager.disconnect(memberForDisconeect, "random");
  }
  async disconnectDup() {
    let connList = this.memberManager.getConnMembers(false, true);
    connList = connList.sort(
      (a, b) => b.extra.connectedTime - a.extra.connectedTime
    );
    let connIds = connList.map((e) => e.userUUID);
    connList.forEach((m, idx) => {
      if (connIds.indexOf(m.userUUID) != idx) {
        this.memberManager.disconnectRequestHandler.requestDisconnect(m, "dup");
      }
    });
  }
  disconnectN(n) {
    if (n < 1) return;
    let shuffled = this.memberManager
      .getConnMembers(true, true, "node")
      .sort((a, b) => a.extra.connectedTime - b.extra.connectedTime)
      .map((e, idx) => {
        e.idx = idx;
        return e;
      })
      .sort((e) => e.idx - Math.random() * 2);
    let selected = shuffled.slice(0, n);

    logger.debug(
      `disconnect n=${n} by limitMaxConnection currentConncount=${this.memberManager.connectionManager.getConnCount()}`
    );
    for (const member of selected) {
      this.memberManager.disconnectRequestHandler.requestDisconnect(
        member,
        "limit"
      );
    }
  }

  async tryJoin(userUUID, comment = "") {
    try {
      logger.debug(`reconnect: join by ${comment} with ${userUUID}`);
      let newMember = await this.memberManager.members.joinAndClean(userUUID);
      return true;
    } catch (error) {
      if (!(error instanceof UkvdbError)) {
        throw error;
      }
      logger.debug(
        `reconnect: fail join by ${comment} with ${userUUID} err=${error.msg}`
      );
      return false;
    }
  }
}
