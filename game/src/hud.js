// All DOM: HUD readouts, the round minimap, dialogs, menus and the
// busted / wasted overlays. Gameplay code calls these; nothing here
// reaches into the 3D scene except through the state object passed in.
import { T } from './tuning.js';
import { ROAD_LINES } from './town.js';
import { money } from './util.js';

export class HUD {
  constructor() {
    this.el = {};
    for (const id of [
      'hud', 'stars', 'cash', 'health-fill', 'health-text', 'speed', 'weapon',
      'objective', 'prompt', 'messages', 'dialog', 'dialog-who', 'dialog-text',
      'minimap', 'title', 'jobs', 'jobs-list', 'busted', 'wasted', 'vignette',
      'center-label', 'toast',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.msgTimers = [];
    this.dialogQueue = [];
    this.dialogTimer = null;
    this.mapCtx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.mapTimer = 0;
  }

  setStats({ heat, cash, health, maxHealth, speed, weapon, ammo }) {
    if (this.el.stars) {
      this.el.stars.textContent = '★'.repeat(heat) + '☆'.repeat(Math.max(0, T.wantedMax - heat));
      this.el.stars.className = heat > 0 ? 'hot' : '';
    }
    if (this.el.cash) this.el.cash.textContent = money(cash);
    if (this.el['health-fill']) {
      this.el['health-fill'].style.width = `${Math.max(0, (health / maxHealth) * 100)}%`;
    }
    if (this.el['health-text']) this.el['health-text'].textContent = `${Math.ceil(health)}`;
    if (this.el.speed) this.el.speed.textContent = `${Math.abs(Math.round(speed * 2.4))} MPH`;
    if (this.el.weapon) {
      this.el.weapon.textContent = weapon === 'pistol' ? `PISTOL ${ammo}` : weapon.toUpperCase();
    }
  }

  setObjective(text) {
    if (this.el.objective) {
      this.el.objective.textContent = text;
      this.el.objective.style.display = text ? 'block' : 'none';
    }
  }

  setPrompt(text) {
    if (this.el.prompt) {
      this.el.prompt.textContent = text;
      this.el.prompt.style.display = text ? 'block' : 'none';
    }
  }

  message(text, kind = 'info') {
    if (!this.el.messages) return;
    const div = document.createElement('div');
    div.className = `msg ${kind}`;
    div.textContent = text;
    this.el.messages.appendChild(div);
    while (this.el.messages.children.length > 4) this.el.messages.firstChild.remove();
    setTimeout(() => { div.classList.add('fade'); setTimeout(() => div.remove(), 600); }, 4200);
  }

  showDialog(who, text) {
    this.dialogQueue.push({ who, text });
    if (!this.dialogTimer) this.nextDialog();
  }

  nextDialog() {
    const d = this.dialogQueue.shift();
    if (!d) {
      if (this.el.dialog) this.el.dialog.style.display = 'none';
      this.dialogTimer = null;
      return;
    }
    if (this.el['dialog-who']) this.el['dialog-who'].textContent = d.who;
    if (this.el['dialog-text']) this.el['dialog-text'].textContent = d.text;
    if (this.el.dialog) this.el.dialog.style.display = 'block';
    this.dialogTimer = setTimeout(() => { this.dialogTimer = null; this.nextDialog(); }, 3600);
  }

  advanceDialog() {
    if (this.dialogTimer) {
      clearTimeout(this.dialogTimer);
      this.dialogTimer = null;
      this.nextDialog();
    }
  }

  clearDialogs() {
    if (this.dialogTimer) clearTimeout(this.dialogTimer);
    this.dialogTimer = null;
    this.dialogQueue = [];
    if (this.el.dialog) this.el.dialog.style.display = 'none';
  }

  drawMinimap(state) {
    if (!this.mapCtx || !this.el.minimap) return;
    const ctx = this.mapCtx;
    const S = this.el.minimap.width;
    const half = T.worldHalf;
    const toMap = (v) => ((v + half) / (half * 2)) * S;
    ctx.save();
    ctx.clearRect(0, 0, S, S);
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#20262b';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#4a545e';
    ctx.lineWidth = 3;
    for (const c of ROAD_LINES) {
      ctx.beginPath(); ctx.moveTo(toMap(c), 0); ctx.lineTo(toMap(c), S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, toMap(c)); ctx.lineTo(S, toMap(c)); ctx.stroke();
    }
    ctx.fillStyle = '#3f7fa8';
    ctx.fillRect(toMap(206), 0, S - toMap(206), S);
    const dot = (x, z, color, r = 3) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(toMap(x), toMap(z), r, 0, Math.PI * 2);
      ctx.fill();
    };
    if (state.beacon) dot(state.beacon.x, state.beacon.z, '#ffd23a', 4.5);
    for (const s of state.stashes || []) if (!s.taken) dot(s.x, s.z, '#51d45a', 2.5);
    for (const c of state.cops || []) dot(c.x, c.z, '#5a8ae2', 3.5);
    for (const g of state.goons || []) dot(g.x, g.z, '#e24a3a', 3);
    if (state.player) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(toMap(state.player.x), toMap(state.player.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  }

  showTitle(show) { if (this.el.title) this.el.title.style.display = show ? 'flex' : 'none'; }
  showJobs(show, missions, completed) {
    if (!this.el.jobs) return;
    this.el.jobs.style.display = show ? 'block' : 'none';
    if (show && this.el['jobs-list']) {
      this.el['jobs-list'].innerHTML = missions.map((m, i) =>
        `<div class="job${completed.has(m.id) ? ' done' : ''}"><b>${i + 1}. ${m.name}</b> — ${m.desc} <span class="reward">$${m.reward}</span>${completed.has(m.id) ? ' ✓' : ''}</div>`
      ).join('');
    }
  }
  showBusted(show) { if (this.el.busted) this.el.busted.style.display = show ? 'flex' : 'none'; }
  showWasted(show) { if (this.el.wasted) this.el.wasted.style.display = show ? 'flex' : 'none'; }
  setVignette(amount) {
    if (this.el.vignette) this.el.vignette.style.opacity = String(Math.max(0, Math.min(0.7, amount)));
  }
  setCenterLabel(text) {
    if (this.el['center-label']) {
      this.el['center-label'].textContent = text;
      this.el['center-label'].style.display = text ? 'block' : 'none';
    }
  }
  toast(text) {
    if (!this.el.toast) return;
    this.el.toast.textContent = text;
    this.el.toast.style.display = 'block';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.el.toast.style.display = 'none'; }, 2600);
  }
}
