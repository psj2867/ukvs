import { MessageBuffer } from "./buffer.js";
import { Members } from "./members.js";
import { Storage } from "./storage.js";
import { getLogger, getLoggers } from "./util.js";

// getLogger("storage").level = "trace";
getLogger("reconnector").level = "trace";
// getLogger("members").level = "trace";

export class Ukvdb {
  constructor(id = null, config = {}) {
    this.members = new Members(id, config);
    this.storage = new Storage();
    this.members.manager.setStorage(this.storage);
    this.storage.manager.setMembers(this.members);

    this.myUserUUID = this.members.myUserUUID;
  }
  async init() {
    await this.members.manager.init();
    await this.storage.manager.init();

    return this;
  }

  async join(remoteId) {
    return this.members.join(remoteId);
  }

  set(key, value) {
    return this.storage.set(key, value);
  }

  get(key) {
    return this.storage.get(key);
  }

  getStatistics() {
    return {
      mmc: MessageBuffer.counter.getMeanMessageCount(),
      cnt: MessageBuffer.counter.cnt,
      sendMmc: MessageBuffer.bulkCounter.getMeanMessageCount(),
      sendCnt: MessageBuffer.bulkCounter.cnt,
      maxDistance: this.storage?.manager.setHandler.getMaxDistance(),
    };
  }
  getLoggers() {
    return getLoggers();
  }
}
