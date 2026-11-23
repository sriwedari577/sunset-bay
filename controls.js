// Sunset Bay — keyboard and mouse input. Keys are tracked by code; the
// game reads edges (just pressed) once per frame, then calls endFrame().
import { KEYS } from './tuning.js';

export class Input {
  constructor(canvas, onFirstGesture) {
    this.canvas = canvas;
    this.onFirstGesture = onFirstGesture || (() => {});
    this.down = new Set();
    this.fresh = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseFresh = false;
    this.locked = false;
    this.gestureDone = false;
    this.onLockLost = null;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.fresh.add(e.code);
      this.gesture();
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => { this.down.clear(); this.mouseDown = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked && this.onLockLost) this.onLockLost();
    });
    canvas.addEventListener('mousedown', (e) => {
      this.gesture();
      if (e.button === 0) { this.mouseDown = true; this.mouseFresh = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('click', () => this.lock());
  }

  gesture() {
    if (this.gestureDone) return;
    this.gestureDone = true;
    this.onFirstGesture();
  }

  lock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch { /* pointer lock unavailable: mouse still steers relatively */ }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  is(code) { return this.down.has(code); }
  hit(code) { return this.fresh.has(code); }

  // -1..1 strafe and forward from WASD/arrows.
  axes() {
    let x = 0, z = 0;
    if (this.is(KEYS.left)) x -= 1;
    if (this.is(KEYS.right)) x += 1;
    if (this.is(KEYS.forward)) z += 1;
    if (this.is(KEYS.back)) z -= 1;
    if (this.is('ArrowLeft')) x -= 1;
    if (this.is('ArrowRight')) x += 1;
    if (this.is('ArrowUp')) z += 1;
    if (this.is('ArrowDown')) z -= 1;
    return { x, z };
  }

  takeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx, dy };
  }

  takeClick() {
    const c = this.mouseFresh;
    this.mouseFresh = false;
    return c;
  }

  endFrame() { this.fresh.clear(); }
}
