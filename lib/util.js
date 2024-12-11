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

class SimpleLogger {
  static LOG_LEVEL = {
    TRACE: 0,
    DEBUG: 10,
    INFO: 20,
    WARN: 30,
    ERROR: 40,
    SILENT: 50,
  };
  static DEFAULT_LOG_LEVEL = "info";
  constructor(name, level = SimpleLogger.DEFAULT_LOG_LEVEL) {
    this.level = level;
    this.name = name;
  }
  get level() {
    return this._level_name;
  }
  set level(s) {
    this._level_name = s;
    this._level = this.toNum(s);
  }
  toNum(name) {
    for (const [k, v] of Object.entries(SimpleLogger.LOG_LEVEL)) {
      if (k.toLowerCase().trim() == name.toLowerCase().trim()) {
        return v;
      }
    }
    return SimpleLogger.LOG_LEVEL[SimpleLogger.DEFAULT_LOG_LEVEL];
  }
  makeConsole(levelValue, f) {
    if (this._level <= levelValue) {
      return f.bind(null, `${this.name}: %s`);
    }
    return () => {};
  }
  get trace() {
    return this.makeConsole(SimpleLogger.LOG_LEVEL.TRACE, console.debug);
  }
  get debug() {
    return this.makeConsole(SimpleLogger.LOG_LEVEL.DEBUG, console.debug);
  }
  get info() {
    return this.makeConsole(SimpleLogger.LOG_LEVEL.INFO, console.info);
  }
}
const _loggers = new Map();
export function getLogger(name) {
  if (_loggers.has(name)) {
    return _loggers.get(name);
  }
  let logger = new SimpleLogger(name);
  _loggers.set(name, logger);
  return logger;
}
export function getLoggers() {
  return _loggers;
}
export function splitArr(arr, condition) {
  let g = Object.groupBy(arr, (e) => condition(e));
  return [g[true] ? g[true] : [], g[false] ? g[false] : []];
}
export function timeoutPromise(promise, ms, defErr = "timeoutPromise") {
  return new Promise(async (r, rej) => {
    let t = setTimeout(() => {
      rej(new UkvdbError(defErr));
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

export class UkvdbError {
  constructor(msg) {
    this.msg = msg;
  }
}

export function getRtcType(rTCPeerConnection) {
  return rTCPeerConnection?.sctp?.transport?.iceTransport?.getSelectedCandidatePair()
    ?.remote?.type;
}
