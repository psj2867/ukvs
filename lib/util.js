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
  LOG_LEVEL = {
    TRACE: 0,
    DEBUG: 10,
    INFO: 20,
    WARN: 30,
    ERROR: 40,
    SILENT: 50,
  };
  constructor(level = "info") {
    this.level = level;
    this.middleware = (levelValue, m, ...args) => {
      m(...args);
    };
  }
  get level() {
    return this._level_name;
  }
  set level(s) {
    this._level_name = s;
    this._level = this.toNum(s);
  }
  toNum(name) {
    for (const [k, v] of Object.entries(this.LOG_LEVEL)) {
      if (k.toLowerCase().trim() == name.toLowerCase().trim()) {
        return v;
      }
    }
    return this.LOG_LEVEL.INFO;
  }
  checkLevel(level) {
    return this._level <= level;
  }
  trace(...args) {
    this.apply(this.LOG_LEVEL.TRACE, console.trace, ...args);
  }
  debug(...args) {
    this.apply(this.LOG_LEVEL.DEBUG, console.debug, ...args);
  }
  info(...args) {
    this.apply(this.LOG_LEVEL.INFO, console.info, ...args);
  }
  apply(levelValue, m, ...args) {
    if (this.checkLevel(levelValue)) {
      this.middleware(levelValue, m, ...args);
    }
  }
}
const _loggers = new Map();
export function getLogger(name) {
  if (_loggers.has(name)) {
    return _loggers.get(name);
  }
  let logger = new SimpleLogger();
  logger.middleware = (_, m, ...args) => {
    m(`${name}: ${args[0]}`, ...args.slice(1));
  };
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
      rej(new UkdbError(defErr));
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

export class UkdbError {
  constructor(msg) {
    this.msg = msg;
  }
}
