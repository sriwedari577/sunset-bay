// Sunset Bay — every DOM surface: the HUD readouts, the round minimap,
// banners, toasts, dialog, and the menu screens (title, pause, jobs,
// busted, wasted). The game logic never touches the DOM directly.
import { fmtCash } from './util.js';

function el(id) { return document.getElementById(id); }

export class HUD {
  constructor(town) {
    this.town = town;
    this.starsEl = el('stars');
    this.cashEl = el('cash');
    this.healthBar = el('healthBar');
    this.healthFill = this.healthBar.querySelector('i');
    this.map = el('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.objectiveEl = el('objective');
    this.hintEl = el('hint');
    this.dialogEl = el('dialog');
    this.dialogWho = this.dialogEl.querySelector('.who');
    this.dialogLine = this.dialogEl.querySelector('.line');
    this.speedEl = el('speed');
    this.weaponEl = el('weapon');
    this.crossEl = el('crosshair');
    this.bannerEl = el('banner');
    this.bannerBig = this.bannerEl.querySelector('.big');
    this.bannerSub = this.bannerEl.querySelector('.sub');
    this.vignetteEl = el('vignette');
    this.toastEl = el('toast');
    this.menuEl = el('menu');
    this.panelEl = el('panel');
    this.srEl = el('sr');
    this.bannerUntil = 0;
    this.toastUntil = 0;
    this.menuOpen = false;
  }

  showBanner(main, sub, seconds = 3) {
    this.bannerBig.textContent = main;
    this.bannerSub.textContent = sub || '';
    this.bannerEl.style.display = 'block';
    this.bannerUntil = performance.now() / 1000 + seconds;
  }

  showToast(text, seconds = 2.5) {
    this.toastEl.textContent = text;
    this.toastEl.style.display = 'block';
    this.toastUntil = performance.now() / 1000 + seconds;
  }

  setDialog(who, text) {
    if (!who) { this.dialogEl.style.display = 'none'; return; }
    this.dialogWho.textContent = who;
    this.dialogLine.textContent = text;
    this.dialogEl.style.display = 'block';
  }

  drawMap(state) {
    const ctx = this.mapCtx;
    const S = this.map.width;
    const scale = S / 480;
    const toX = (x) => (x + 240) * scale;
    const toY = (z) => (z + 240) * scale;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#274d33';
    ctx.fillRect(0, 0, S, S);
    // Sea along the bottom edge (south is +z on the map? world -z is sea:
    // the map draws world -z at the top, so the sea is the top strip).
    ctx.fillStyle = '#2e7f9e';
    ctx.fillRect(0, 0, S, (240 + this.town.seaZ) * scale * -1 + S - S);
    ctx.fillRect(0, 0, S, Math.max(0, (-240 - this.town.seaZ) * scale));
    ctx.fillStyle = '#e8d49a';
    ctx.fillRect(0, Math.max(0, (-240 - this.town.seaZ) * scale), S, Math.max(0, (this.town.seaZ - this.town.beachZ) * scale));
    // Roads.
    ctx.strokeStyle = '#565c64';
    ctx.lineWidth = 4;
    for (const line of this.town.roadLines) {
      ctx.beginPath(); ctx.moveTo(toX(line), 0); ctx.lineTo(toX(line), S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, toY(line)); ctx.lineTo(S, toY(line)); ctx.stroke();
    }
    const dot = (x, z, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(toX(x), toY(z), r, 0, Math.PI * 2); ctx.fill();
    };
    // Mara's bar and the police station as fixed landmarks.
    dot(this.town.landmarks.mara.x, this.town.landmarks.mara.z, '#ffd75e', 4);
    dot(this.town.landmarks.station.x, this.town.landmarks.station.z, '#6aa8e0', 4);
    if (state.marker) {
      const mx = toX(state.marker.x), my = toY(state.marker.z);
      const pulse = 5 + Math.sin(performance.now() / 200) * 1.5;
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath();
      ctx.moveTo(mx, my - pulse - 2); ctx.lineTo(mx + pulse, my); ctx.lineTo(mx, my + pulse + 2); ctx.lineTo(mx - pulse, my);
      ctx.closePath(); ctx.fill();
    }
    for (const e of state.enemies || []) {
      if (!e.dead) dot(e.x, e.z, '#ff5040', 3);
    }
    const flash = Math.floor(performance.now() / 300) % 2 === 0;
    for (const p of state.police || []) {
      dot(p.x, p.z, flash ? '#ff2a20' : '#2060ff', 3.5);
    }
    // The player: a white arrow pointing where they face.
    ctx.save();
    ctx.translate(toX(state.playerX), toY(state.playerZ));
    ctx.rotate(Math.atan2(Math.sin(state.playerYaw), Math.cos(state.playerYaw)) + Math.PI);
    // Map north is -z (up); the arrow is drawn pointing up then rotated.
    ctx.rotate(Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#101623';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-5, 5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  update(state) {
    const now = performance.now() / 1000;
    const filled = '★'.repeat(state.stars);
    const empty = '☆'.repeat(Math.max(0, 5 - state.stars));
    this.starsEl.textContent = filled + empty;
    this.starsEl.classList.toggle('hot', state.stars > 0);
    this.cashEl.textContent = fmtCash(state.cash);
    const hp = Math.max(0, Math.round(state.health));
    this.healthFill.style.width = `${hp}%`;
    this.healthBar.classList.toggle('low', hp <= 30);
    this.objectiveEl.textContent = state.objective || '';
    this.objectiveEl.style.display = state.objective ? 'block' : 'none';
    this.hintEl.textContent = state.hint || '';
    this.hintEl.style.display = state.hint ? 'block' : 'none';
    this.speedEl.innerHTML = `${Math.round(state.speed)}<small> MPH</small>`;
    this.weaponEl.textContent = state.weaponLabel || '';
    this.crossEl.style.display = state.aiming ? 'block' : 'none';
    this.vignetteEl.style.opacity = String(Math.min(0.85, state.hurt + (state.health < 30 ? 0.25 : 0)));
    if (state.dialog) this.setDialog(state.dialog.who, state.dialog.text);
    else this.setDialog(null);
    if (this.bannerUntil && now > this.bannerUntil) { this.bannerEl.style.display = 'none'; this.bannerUntil = 0; }
    if (this.toastUntil && now > this.toastUntil) { this.toastEl.style.display = 'none'; this.toastUntil = 0; }
    if (state.announce) this.srEl.textContent = state.announce;
    this.drawMap(state);
  }

  // ---- Menus ----
  open(html) {
    this.panelEl.innerHTML = html;
    this.menuEl.classList.remove('hidden');
    this.menuOpen = true;
  }

  close() {
    this.menuEl.classList.add('hidden');
    this.menuOpen = false;
  }

  titleScreen(hasSave, onStart, onJobs, onMute, muted) {
    this.open(`
      <div class="kicker">WELCOME TO</div>
      <h1 class="logo">SUNSET <span>BAY</span></h1>
      <p class="tagline">Rook is new in town. Mara runs the bar, Kroll runs the
      streets, and the whole Bay is up for grabs. Take jobs, steal cars,
      dodge the police — and take the town for yourself.</p>
      <div class="controls">
        <div><b>W A S D</b> — walk / drive</div>
        <div><b>Mouse</b> — look around</div>
        <div><b>E</b> — steal / leave car</div>
        <div><b>Space</b> — jump / handbrake</div>
        <div><b>F / Click</b> — punch / shoot</div>
        <div><b>Q</b> — swap fists / pistol</div>
        <div><b>R</b> — reload &nbsp; <b>M</b> — jobs</div>
        <div><b>P</b> — pause &nbsp; <b>N</b> — mute</div>
      </div>
      <button class="btn" id="mStart">${hasSave ? 'CONTINUE' : 'START'}</button>
      <button class="btn ghost" id="mJobs">JOBS</button>
      <button class="btn ghost" id="mMute">${muted ? 'UNMUTE' : 'MUTE'}</button>
      <div id="menuFoot">An original game. No real city, no real people, no borrowed assets.</div>`);
    el('mStart').addEventListener('click', onStart);
    el('mJobs').addEventListener('click', onJobs);
    el('mMute').addEventListener('click', onMute);
  }

  pauseScreen(onResume, onJobs, onTitle, onMute, muted) {
    this.open(`
      <div class="kicker">TAKING FIVE</div>
      <h1 class="logo" style="font-size:44px">PAUSED</h1>
      <p class="tagline">The Bay waits for no one. Well — just this once.</p>
      <button class="btn" id="mResume">RESUME</button>
      <button class="btn ghost" id="mJobs">JOBS</button>
      <button class="btn ghost" id="mMute">${muted ? 'UNMUTE' : 'MUTE'}</button>
      <button class="btn ghost" id="mTitle">SAVE &amp; TITLE</button>`);
    el('mResume').addEventListener('click', onResume);
    el('mJobs').addEventListener('click', onJobs);
    el('mMute').addEventListener('click', onMute);
    el('mTitle').addEventListener('click', onTitle);
  }

  jobsScreen(jobs, onStartJob, onBack) {
    const rows = jobs.map((j) => `
      <div class="job ${j.done ? 'done' : ''}" data-i="${j.index}">
        <div class="jt">${j.done ? '✓ ' : ''}${j.title} — ${fmtCash(j.reward)}</div>
        <div class="jd">${j.desc}${j.done ? ' — done' : j.active ? ' — in progress' : ''}</div>
      </div>`).join('');
    this.open(`
      <div class="kicker">MARA'S JOBS</div>
      <h1 class="logo" style="font-size:40px">JOB BOARD</h1>
      <p class="tagline">Jobs run in order. Finish one to unlock the next.</p>
      <div id="menuList" style="display:block">${rows}</div>
      <button class="btn" id="mBack">BACK</button>`);
    this.panelEl.querySelectorAll('.job').forEach((row) => {
      row.addEventListener('click', () => onStartJob(Number(row.dataset.i)));
    });
    el('mBack').addEventListener('click', onBack);
  }

  endScreen(kind, fine, onRespawn) {
    const busted = kind === 'busted';
    this.open(`
      <div class="kicker">${busted ? 'THE POLICE GOT YOU' : 'YOU GOT FLATTENED'}</div>
      <h1 class="logo" style="font-size:48px">${busted ? 'BUSTED' : 'WASTED'}</h1>
      <p class="tagline">${busted
        ? `The officers walk you to the station, keep ${fmtCash(fine)} as a fine, and let you go at Mara's bar. The job you were on is over.`
        : `You wake up outside Mara's bar, ${fmtCash(fine)} lighter, with the job you were on called off.`}</p>
      <button class="btn" id="mRespawn">BACK ON THE STREET</button>`);
    el('mRespawn').addEventListener('click', onRespawn);
  }
}
