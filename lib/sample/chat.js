import { Ukvdb } from "../ukvdb";

class SortedLimitedArray {
  constructor(comparer, maxSize, init = []) {
    this.comparer = comparer;
    this.values = init;
    this.maxSize = maxSize;
  }
  add(node) {
    let rNode = undefined;
    if (this.size() == this.maxSize && this.comparer(node, this.values[0])) {
      return node;
    }
    if (this.size() + 1 > this.maxSize) {
      rNode = this.removeBack();
    }
    for (let i = this.values.length - 1; 0 <= i; i--) {
      if (this.comparer(this.values[i], node)) {
        this.values.splice(i + 1, 0, node);
        return rNode;
      }
    }
    this.values.unshift(node);
    return rNode;
  }
  size() {
    return this.values.length;
  }
  removeBack() {
    return this.values.shift();
  }
  get() {
    return this.values;
  }
}

export class Chat {
  /**
   *
   * @param {Ukvdb} ukvdb
   */
  constructor(ukvdb, init = []) {
    this.ukvdb = ukvdb;
    this.cnt = 0;
    this.maxSize = 50;
    this.data = new SortedLimitedArray(
      (a, b) => {
        if (a.time == b.time) {
          return a.cnt < b.cnt;
        }
        return a.time < b.time;
      },
      this.maxSize,
      init
    );
    this.settingHandler();
  }
  chat(s) {
    this.cnt++;
    this.ukvdb.set(`chat_${this.ukvdb.myUserUUID}${this.cnt}`, { text: s });
  }
  settingHandler() {
    this.ukvdb.storage.on("chat_.*", (key, record) => {
      if (record.data == null) return;
      let p = this.data.add({
        text: record.data.text,
        time: record.getDate().getTime(),
        cnt: record.cnt,
        id: key,
        user: record.user,
      });
      if (p != undefined) {
        this.ukvdb.set(p.id, null);
      }
    });
  }
  get() {
    return this.data.get();
  }
}
