import pino from "pino";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

var GREGORIAN_OFFSET = 122192928000000000;
export const UUID_to_Date = {
  get_time_int: function (uuid_str) {
    // (string) uuid_str format	=>		'11111111-2222-#333-4444-555555555555'
    var uuid_arr = uuid_str.split("-"),
      time_str = [uuid_arr[2].substring(1), uuid_arr[1], uuid_arr[0]].join("");
    // time_str is convert  '11111111-2222-#333-4444-555555555555'  to  '333222211111111'
    return parseInt(time_str, 16);
  },
  get_date_obj: function (uuid_str) {
    // (string) uuid_str format	=>		'11111111-2222-#333-4444-555555555555'
    var int_time = this.get_time_int(uuid_str) - GREGORIAN_OFFSET,
      int_millisec = Math.floor(int_time / 10000);
    return new Date(int_millisec);
  },
};

export function logDebug(message, ...args) {
  console.debug(Math.floor(window.performance.now()), message, ...args);
}
export let _loggers = new Map();
export function getLogger(name) {
  if (_loggers.has(name)) {
    return _loggers.get(name);
  }
  let logger = pino({
    name,
  });
  _loggers.set(name, logger);
  return logger;
}
export function splitArr(arr, condition) {
  let g = Object.groupBy(arr, (e) => condition(e));
  return [g[true] ? g[true] : [], g[false] ? g[false] : []];
}
export function timeoutPromise(promise, ms, defErr = "timeoutPromise") {
  return new Promise(async (r, rej) => {
    let t = setTimeout(() => {
      rej(defErr);
    }, ms);
    try {
      r(await promise);
    } catch (error) {
      rej(error);
    } finally {
      clearTimeout(t);
    }
  });
}
export function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

export async function f1() {}

export function testData() {
  return "abcdefghijklmnopqrstuvwxyz".split("");
}

export function nowMs() {
  return performance.timing.navigationStart + performance.now();
}

export class HandlerList {
  constructor() {
    this.handlers = [];
  }
  add(f) {
    this.handlers.push(f);
    return () => {
      this.delete(f);
    };
  }
  handle(...args) {
    for (const h of this.handlers) {
      h(...args);
    }
  }
  delete(f) {
    this.handlers = this.handlers.filter((e) => e != f);
  }
}
