import { TransactionData } from "./members";
import { getLogger, nowMs } from "./util";

const logger = getLogger("message");

class Counter {
  constructor(interval = 1000 * 2) {
    this.total = 0;
    this.cnt = 0;
    this.interval = interval;
    this.start = nowMs();
    this.startInterval();
  }
  delta(d) {
    this.cnt += d;
  }
  startInterval() {
    this._interval = setInterval(() => {
      this.start = nowMs();
      this.cnt = 0;
    }, this.interval);
  }
  getMeanMessageCount() {
    let end = nowMs();
    let mmc = this.cnt / (end - this.start);
    return mmc * 1000;
  }
}

class _MessageBuffer {
  constructor(excepTypes) {
    this.buf = new Map();
    this.maxSize = 0;
    this.bufTime = 0; //ms
    this._buffed = false;
    this.excepTypes = excepTypes;
    this.counter = new Counter();
    this.bulkCounter = new Counter();
  }
  /**
   * @param {TransactionData} transactionData
   */
  add(conn, transactionData, flush = false) {
    let type = transactionData.type;
    this.counter.delta(1);
    if (this.buf.has(conn)) {
      this.buf.get(conn).push(transactionData);
    } else {
      this.buf.set(conn, [transactionData]);
    }

    if (flush) {
      this.flushOne(conn, "flush");
      return;
    }
    this.check();
  }
  check() {
    for (const [conn, messages] of this.buf.entries()) {
      let size = messages.length;
      if (size >= this.maxSize) {
        this.flushOne(conn, "size");
      }
    }
    if (!this._buffed) {
      this._buffed = true;
      setTimeout(async () => {
        await this.flush("time");
        this._buffed = false;
      }, this.bufTime);
    }
  }
  async flushOne(conn, comment = "size") {
    if (!this.buf.has(conn)) return;
    let datas = this.buf.get(conn);
    logger.debug(
      `flush data by ${comment} conn=${conn.userUUID} len=${datas.length}`
    );
    this.logSendDatas(datas, conn);
    conn.send(datas);
    this.bulkCounter.delta(1);
    this.buf.delete(conn);
  }
  async flush(comment = "time") {
    for (const [conn, datas] of this.buf) {
      logger.debug(
        `flush data by ${comment} conn=${conn.userUUID} len=${datas.length}`
      );
      this.logSendDatas(datas, conn);
      conn.send(datas);
      this.bulkCounter.delta(1);
    }
    this.buf.clear();
  }
  logSendDatas(datas, conn) {
    for (const d of datas) {
      logger.trace(`send data ${d.type} conn=${conn.userUUID}`, d);
    }
  }
}
export const MessageBuffer = new _MessageBuffer();
