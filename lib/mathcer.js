export class EqualMatcher {
  constructor() {
    this.handles = [];
  }
  add(key, handler) {
    this.handles.push({
      key: key,
      handler,
    });
  }
  delete(key, handler) {
    this.handle = this.handles.filter(
      (h) => h.key != key || h.handler != handler
    );
  }
  handle(key, ...data) {
    let hs = this.findHandlers(key);
    for (const h of hs) {
      h(key, ...data);
    }
  }
  findHandlers(key) {
    let res = [];
    if (!this.handles) {
      return res;
    }
    for (const h of this.handles) {
      if (key == h.key) {
        res.push(h.handler);
      }
    }
    return res;
  }
}

class PatternMatcher {
  constructor() {
    this.handles = [];
  }
  add(pattern, handler) {
    this.handles.push({
      pattern,
      handler,
    });
  }
  delete(pattern, handler) {
    this.handles = this.handles.filter(
      (h) => h.pattern != pattern || h.handler != handler
    );
  }
  handle(key, ...data) {
    let hs = this.findHandlers(key);
    for (const h of hs) {
      h(key, ...data);
    }
  }
  findHandlers(key) {
    let res = [];
    if (!this.handles) {
      return res;
    }
    for (const h of this.handles) {
      if (key.match(h.pattern)) {
        res.push(h.handler);
      }
    }
    return res;
  }
}

export class PatternMatcherWithSpecial {
  constructor(special = "$") {
    this.special = special;
    this.handles = new PatternMatcher();
    this.specialHandles = new PatternMatcher();
  }
  add(pattern, handler) {
    this.handles.add(pattern, handler);
  }
  addSpecial(pattern, handler) {
    this.specialHandles.add(pattern, handler);
  }
  delete(pattern, handler) {
    this.handles.delete(pattern, handler);
  }
  deleteSpecial(pattern, handler) {
    this.specialHandles.delete(pattern, handler);
  }
  handle(key, ...data) {
    if (key.startsWith(this.special)) {
      key = key.slice(this.special.length);
      return this.specialHandles.handle(key, ...data);
    }
    return this.handles.handle(key, ...data);
  }
}
