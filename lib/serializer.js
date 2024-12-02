export class JsonSerialize {
  serialize(s) {
    return JSON.stringify(s);
  }
  unSerialize(obj) {
    return JSON.parse(obj);
  }
}
