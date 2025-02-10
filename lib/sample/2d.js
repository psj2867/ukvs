import Two from "two.js";
import { Ukvs } from "../ukvs";

class Character {
  /**
   * @param {Sample2D} two
   */
  constructor(two, id, color = null) {
    this.id = id;
    this.base = two;
    this.img = two.two.makeCircle(0, 0, 10);

    // this.img.fill = "#000";
    if (color == null)
      this.img.fill = "#" + ((Math.random() * 0xffffff) << 0).toString(16);
    else this.img.fill = color;
    let Q = 1000;
    this.setPosition(0, 0);
  }
  destroy() {
    this.img.remove();
  }
  _moveTo = false;
  _moveTo_pos = { x: 0, y: 0 };

  delta(s, d) {
    const limit = 0.5;
    let sub = { x: d.x - s.x, y: d.y - s.y };
    let size = Math.sqrt(sub.x * sub.x + sub.y * sub.y);
    if (size < limit) {
      return sub;
    }
    let unit = { x: sub.x / size, y: sub.y / size };
    let a = size / 5;
    return {
      x: unit.x * a,
      y: unit.y * a,
    };
  }
  moveTo(x, y) {
    this._moveTo_pos = { x, y };

    const animate = () => {
      let v = this.delta(this.getPosition(), this._moveTo_pos);
      this.img.position.add(v.x, v.y);
      if (
        this.getPosition().x == this._moveTo_pos.x &&
        this.getPosition().y == this._moveTo_pos.y
      ) {
        this._moveTo = false;
      }
      if (this._moveTo) {
        requestAnimationFrame(() => {
          animate();
        });
      }
    };
    if (!this._moveTo) {
      this._moveTo = true;
      requestAnimationFrame(() => {
        animate();
      });
    }
  }
  setPosition(x, y) {
    if (isNaN(x) || isNaN(y)) throw "isNan";
    this.img.position.set(x, y);
  }
  getPosition() {
    return { x: this.img.position.x, y: this.img.position.y };
  }
  getColor() {
    return this.img.fill;
  }
}

class CharacterController {
  /**
   * @param {Character} character
   * @param {Ukvs} ukvs
   * @param {Two} two
   */
  constructor(character, ukvs, two) {
    this.character = character;
    this.ukvs = ukvs;
    this.two = two;
    this.settingKeybaord();
    this.settingClick();
    this.settingTouch();
  }
  settingKeybaord() {
    document.addEventListener("keydown", (event) => {
      const callback = {
        ArrowLeft: () => {
          this.set(-1, 0);
        },
        ArrowRight: () => {
          this.set(+1, 0);
        },
        ArrowUp: () => {
          this.set(0, -1);
        },
        ArrowDown: () => {
          this.set(0, +1);
        },
      }[event.key];
      callback?.();
    });
  }
  getRootElem() {
    return this.two.renderer.domElement;
  }
  getMousePos(event) {
    var rect = event.currentTarget.getBoundingClientRect();
    let x = event.pageX - rect.left;
    let y = event.clientY - rect.top;
    return { x, y };
  }
  settingClick() {
    let clicked = false;
    this.getRootElem().addEventListener(
      "mousedown",
      (event) => {
        clicked = true;
        this.set(this.getMousePos(event));
      },
      { passive: true }
    );
    this.getRootElem().addEventListener(
      "mousemove",
      (event) => {
        if (clicked == true && event.buttons & 1) {
          this.set(this.getMousePos(event));
        }
      },
      { passive: true }
    );
    this.getRootElem().addEventListener(
      "mouseup",
      (event) => {
        clicked = false;
      },
      { passive: true }
    );
  }
  getTouchPos(event) {
    var rect = event.currentTarget.getBoundingClientRect();
    let x = event.touches[0].clientX - rect.left;
    let y = event.touches[0].clientY - rect.top;
    return { x, y };
  }
  settingTouch() {
    document.body.style["overscroll-behavior-y"] = "contain";
    let clicked = false;
    this.getRootElem().addEventListener(
      "touchstart",
      (event) => {
        clicked = true;
        this.set(this.getTouchPos(event));
      },
      { passive: true }
    );
    this.getRootElem().addEventListener(
      "touchmove",
      (event) => {
        if (clicked == true) {
          this.set(this.getTouchPos(event));
        }
      },
      { passive: true }
    );
    this.getRootElem().addEventListener(
      "touchend",
      (event) => {
        clicked = false;
      },
      { passive: true }
    );
  }
  set(x, y = null) {
    if (y == null) return this.set(x.x, x.y);
    this.ukvs.set(`pos_${this.ukvs.myUserUUID}`, {
      x,
      y,
      color: this.character.getColor(),
    });
  }
}

class Sample2D {
  /**
   * @param {Ukvs} ukvs
   */
  constructor(rootEle, ukvs) {
    this.two = new Two({
      type: Two.Types.svg,
      autostart: true,
      fitted: true,
    });
    this.two.appendTo(rootEle);
    this.ukvs = ukvs;

    this.me = new Character(this, ukvs.myUserUUID);
    this.characters = new Map();
    this.characters.set(this.me.id, this.me);

    this.controller = new CharacterController(this.me, ukvs, this.two);
    this.settingHandler();
    this.controller.set(Math.random() * 200, Math.random() * 200);
  }
  settingHandler() {
    this.ukvs.storage.on("pos_.*", (key, record) => {
      let id = key.slice("pos_".length);
      if (record.data == null) {
        this.characters.get(id)?.destroy();
        this.characters.delete(id);
        return;
      }
      if (!this.characters.has(id)) {
        this.characters.set(id, new Character(this, id, record.data.color));
      }
      let userChar = this.characters.get(id);
      userChar.moveTo(record.data.x, record.data.y);
    });
    this.ukvs.members.onConnMember((type, id, member) => {
      if (type == "clean") {
        this.ukvs.set(`pos_${id}`, null);
      }
      if (type == "quit") {
        this.ukvs.set(`pos_${id}`, null);
      }
    });
  }
}
export function SetTwo(rootEle, ukvs) {
  let sample = new Sample2D(rootEle, ukvs);
  return sample;
}
