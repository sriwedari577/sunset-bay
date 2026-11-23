// Keyboard + mouse, with edge-triggered "just pressed" keys the game
// consumes once per frame. Mouse click fires the pistol.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseClicked = false;
    this.enabled = true;
    this.keyMap = {
      KeyW: 'forward', ArrowUp: 'forward',
      KeyS: 'back', ArrowDown: 'back',
      KeyA: 'left', ArrowLeft: 'left',
      KeyD: 'right', ArrowRight: 'right',
      ShiftLeft: 'run', ShiftRight: 'run',
      KeyE: 'interact', KeyF: 'punch', KeyJ: 'jobs',
      Enter: 'confirm', Escape: 'cancel', Space: 'punch',
    };
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const action = this.keyMap[e.code];
      if (!action) return;
      if (['forward', 'back', 'left', 'right', 'punch'].includes(action)) e.preventDefault();
      if (!e.repeat) this.pressed.add(action);
      this.keys.add(action);
    });
    window.addEventListener('keyup', (e) => {
      const action = this.keyMap[e.code];
      if (action) this.keys.delete(action);
    });
    window.addEventListener('blur', () => { this.keys.clear(); });
    window.addEventListener('mousedown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('button, a, input')) return;
      this.mouseClicked = true;
    });
  }

  get forward() { return this.keys.has('forward'); }
  get back() { return this.keys.has('back'); }
  get left() { return this.keys.has('left'); }
  get right() { return this.keys.has('right'); }
  get run() { return this.keys.has('run'); }

  wasPressed(action) { return this.pressed.has(action); }

  consume(action) {
    const had = this.pressed.has(action);
    if (had) this.pressed.delete(action);
    return had;
  }

  consumeClick() {
    const c = this.mouseClicked;
    this.mouseClicked = false;
    return c;
  }

  endFrame() {
    this.pressed.clear();
    this.mouseClicked = false;
  }

  // Test hooks: pretend a key is held, or tap it once.
  testHold(action, on = true) {
    if (on) this.keys.add(action); else this.keys.delete(action);
  }
  testTap(action) { this.pressed.add(action); }
}
