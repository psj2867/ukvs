import { MessageBuffer } from "./buffer.js";
import { Members } from "./members.js";
import { Storage } from "./storage.js";
import { _loggers, getLogger } from "./util.js";

getLogger("members").level = "debug";
getLogger("data_message").level = "debug";
getLogger("reconnector").level = "debug";

export class Ukvdb {
  constructor(id = null) {
    this.members = new Members(id);
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
    let member = await this.members.join(remoteId);
  }

  set(key, value) {
    this.storage.set(key, value);
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
    return _loggers;
  }
}
