import moment from "moment";
import { v1 as uudiv1 } from "uuid";
import { CopySpecialDataHandler, SetHandler, SyncHandler } from "./handlers.js";
import { PatternMatcherWithSpecial } from "./mathcer.js";
import { Members } from "./members.js";
import { getLogger, UkvdbError, UUID_to_Date } from "./util.js";
const logger = getLogger("storage");

export class Record {
  constructor(data, key = "", user = "", dataId = "") {
    this.key = key;
    this.data = data;
    this.rawId = dataId;
    this.cnt = 0;
    this.user = user;
    if (this.rawId == "") {
      this.genId();
    }
  }
  genId() {
    this.cnt++;
    if (this.cnt > 9999) {
      this.cnt = 0;
    }
    this.rawId = uudiv1() + "-" + String(this.cnt).padStart(4, "0");
  }
  getDate() {
    return UUID_to_Date.get_date_obj(this.getUuid());
  }
  getUuid() {
    return this.rawId.slice(0, -5);
  }
  gt(rec) {
    return this._gt(rec.rawId);
  }
  _gt(otherRawId) {
    let other = new Record().load({
      rawId: otherRawId,
      data: null,
      user: null,
    });
    let recDate = other.getDate().getTime();
    let myDate = this.getDate().getTime();
    if (myDate == recDate) {
      return this.cnt > other.cnt;
    }
    return myDate > recDate;
  }
  load(s) {
    this.rawId = s.rawId;
    this.cnt = parseInt(this.rawId.slice(-4));
    this.data = s.data;
    this.user = s.user;
    this.key = s.key;
    return this;
  }
  obj() {
    return {
      data: this.data,
      rawId: this.rawId,
      user: this.user,
      key: this.key,
    };
  }
}

export class StorageManager {
  /**
   * @param {Storage} storage
   */
  constructor(storage) {
    this.members = null;
    this.storage = storage;
    this.datamap = {};
    this.matcher = new PatternMatcherWithSpecial();
    this.config = {
      cleanInterval: 1000 * 60,
      cleanExpireTime: 1000 * 60 * 10,
      randomSyncInterval: 1000 * 10,
    };
    this._cleanInterval = null;
    this.startClenaer();
    this.special = "$";
  }
  /**
   * @param {Members} members
   */
  setMembers(members) {
    this.members = members;
  }
  async init() {
    if (this.members == null) {
      throw new UkvdbError("init after call setMembers");
    }
    this.setHandler = new SetHandler(this.members.manager, this).init();
    this.syncHandler = new SyncHandler(
      this.members.manager,
      this,
      this.setHandler
    ).init();
    this.copyHandler = new CopySpecialDataHandler(
      this.members.manager,
      this,
      this.setHandler
    ).init();
    this._randomSyncInterval = setInterval(() => {
      // this.randomSync();
    }, this.config.randomSyncInterval);
  }
  startClenaer() {
    this._cleanInterval = setInterval(() => {
      this.clean(moment().subtract(this.config.cleanExpireTime, "ms"));
    }, this.config.cleanInterval);
  }

  /**
   * @param {Record} record
   */
  setRecord(record) {
    let k = record.key;
    if (k in this.datamap) {
      let org = this.datamap[k];
      if (record.gt(org)) {
        this.datamap[k] = record;
        this.matcher.handle(
          record.key,
          this.datamap[record.key],
          org.data != null ? org : null
        );
        logger.debug(`set data`, record, org);
        return true;
      } else {
        logger.debug(`discard previous data`, record);
      }
    } else {
      this.datamap[k] = record;
      this.matcher.handle(record.key, this.datamap[record.key], null);
      logger.debug(`set data`, record, null);
      return true;
    }
    return false;
  }
  toRecords() {
    return Object.entries(this.datamap).map(([k, v]) => v);
  }
  obj() {
    return this.datamap;
  }
  load(d) {
    this.datamap = d;
    return this;
  }
  clean(beforeDate) {
    for (const [k, v] of Object.entries(this.datamap)) {
      if (v.data != null) continue;
      let date = v.getDate();
      if (date < beforeDate) {
        logger.debug(`delte exipired null data`, k);
        delete this.datamap[k];
      }
    }
  }

  randomSync() {
    let memberlist = this.members.getConnMembers(true);
    let member = memberlist[Math.floor(Math.random() * memberlist.length)];
    if (member) {
      logger.trace(`sync with ${member.userUUID}`);
      this.syncHandler.sync(member);
    }
  }
}

export class Storage {
  constructor() {
    this.manager = new StorageManager(this);
  }

  get(k) {
    return this.manager.datamap[k];
  }
  has(k) {
    return k in this.manager.datamap;
  }

  set(k, v) {
    this.manager.setHandler.set(k, v);
  }

  /**
   * @param {(key:string,newRecord:Record, old:Record)=>void} h
   */
  on(pat, h) {
    this.manager.matcher.add(pat, h);
    return () => {
      this.manager.matcher.delete(pat, h);
    };
  }
  /**
   * @param {(key:string,newRecord:Record, old:Record)=>void} h
   */
  onSpecial(pat, h) {
    this.manager.matcher.addSpecial(pat, h);
    return () => {
      this.manager.matcher.deleteSpecial(pat, h);
    };
  }
  find(pat) {
    return Object.entries(this.manager.datamap)
      .map(([k, v]) => {
        if (k.match(pat))
          return {
            key: k,
            ...v,
          };
      })
      .filter((e) => e) //not null filter
      .filter((e) => e.data != null);
  }
  findData(pat) {
    return Object.entries(this.manager.datamap)
      .map(([k, v]) => {
        if (k.startsWith(this.manager.special)) return;
        if (k.match(pat))
          return {
            ...v,
            key: k,
          };
      })
      .filter((e) => e) //not null filter
      .filter((e) => e.data != null);
  }
  findSpecial(pat, removeSpecial = true) {
    return Object.entries(this.manager.datamap)
      .map(([k, v]) => {
        if (!k.startsWith(this.manager.special)) return;
        if (removeSpecial) {
          k = k.slice(this.manager.special.length);
        }
        if (k.match(pat))
          return {
            ...v,
            key: k,
          };
      })
      .filter((e) => e) //not null filter
      .filter((e) => e.data != null);
  }
}
