import { getNodeDistance } from "./graph";
import { MemberManager } from "./members";
import { Storage } from "./storage";
import { getLogger } from "./util";

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
    const notInConList = (e) =>
      this.memberManager.isNotInConn(e.userUUID, false, false);
    allMemebers = allMemebers.filter(notInConList);
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
    let connCount = this.memberManager.getConnMembers().length;
    if (connCount >= target) {
      return;
    }
    let reconnectOrder = this.sortConnectOrder(membersInfo);
    logger.debug(
      `reconnect by MinMember ${connCount}->${target} order `,
      reconnectOrder
    );
    let n = target - connCount;
    for (let index = 0; n > 0 && index < reconnectOrder.length; index++) {
      let userUUID = reconnectOrder[index].userUUID;
      if (await this.tryJoin(userUUID)) {
        n--;
      }
    }
  }

  async reconnectForInfiniteDistance() {
    let membersInfo = this.getMembersInfo();
    let connCount = this.memberManager.getConnMembers(false, false).length;
    let unconnectedInfMembers = membersInfo
      .filter((e) => this.memberManager.isNotInConn(e.userUUID, false, false))
      .filter((e) => !isFinite(e.distance));
    let n = this.memberManager.config.members_maxMember - connCount;
    n = Math.min(n, 1);
    let index = 0;
    while (n > 0 && index < unconnectedInfMembers.length) {
      let member = unconnectedInfMembers[index];
      index++;
      if (this.memberManager.isNotInConn(member.userUUID, false, false))
        continue;
      logger.debug(`reconnect with ${member.userUUID} by infinite`);
      if (await this.tryJoin(member.userUUID)) {
        n--;
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
    connList = connList
      .sort((a, b) => a.extra.connectedTime - b.extra.connectedTime)
      .reverse();
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
      .sort((a, b) => b.extra.connectedTime - a.extra.connectedTime)
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

  async tryJoin(userUUID) {
    try {
      logger.debug(`reconnect: join with ${userUUID}`);
      let newMember = await this.memberManager.members.join(userUUID);
      return true;
    } catch (error) {
      if (error !== "timeoutPromise") {
        throw error;
      }
      logger.debug(`reconnect: fail join with ${userUUID}`);
      this.memberManager.cleanMemberData(userUUID, "try_join");
      return false;
    }
  }
}
