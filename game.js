'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const C = {
  WIDTH:  360,
  HEIGHT: 540,
  LANES:  3,
  LANE_W: 120,
  CAR_W:  70,
  CAR_H:  108,
  DISH_W: 58,
  DISH_H: 58,
  ISLAND_H: 50,
  ROAD_SPEED_INIT:      3,
  SPEED_INCREMENT:      0.0005,
  SPAWN_INTERVAL_DISH:  90,
  SPAWN_INTERVAL_ISLE:  130,
  POINTS_PER_DISH:      10,
  TILT_MAX:       1.0,
  TILT_DECAY:     0.80,
  TILT_THRESHOLD: 0.01,
  TILT_SKEW:      0.22,
  ROAD_COLOR:  '#2a2a2a',
  LANE_COLOR:  '#FFFFFF',
  HS_KEY:      'bmwRacer_hs',
  MUSIC_BPM:   180,
  KMH_MAX:     300,
  KMH_FRAMES:  10800,   // 60 fps × 180 s = 3 minutes
};

function laneX(lane) { return lane * C.LANE_W + C.LANE_W / 2; }

// ─── Traffic island type definitions ─────────────────────────────────────────
//   lanes  : which lanes are blocked (player collides if in these lanes)
//   x      : horizontal center of the island
//   w      : pixel width
//   arrow  : direction shown on the blue sign ('left' | 'right' | 'both')
const ISLAND_DEFS = [
  // 1. Central island — blocks centre lane, pass either side
  { key: 'CENTER',       lanes: [1],    x: laneX(1),                       w: 90,  arrow: 'both'  },
  // 2. Single right — blocks right lane, pass left
  { key: 'SINGLE_RIGHT', lanes: [2],    x: laneX(2),                       w: 90,  arrow: 'left'  },
  // 3. Single left — blocks left lane, pass right
  { key: 'SINGLE_LEFT',  lanes: [0],    x: laneX(0),                       w: 90,  arrow: 'right' },
  // 4. Double right — blocks centre+right, pass far left
  { key: 'DOUBLE_RIGHT', lanes: [1, 2], x: (laneX(1) + laneX(2)) / 2,     w: 218, arrow: 'left'  },
  // 5. Double left — blocks left+centre, pass far right
  { key: 'DOUBLE_LEFT',  lanes: [0, 1], x: (laneX(0) + laneX(1)) / 2,     w: 218, arrow: 'right' },
];
// Spawn weight per definition (single islands more common)
const ISLAND_WEIGHTS = [2, 2, 2, 1, 1];

// ─── 8-bit melody (freq Hz, duration in beats at MUSIC_BPM) ──────────────────
const MUSIC_NOTES = [
  [523,0.5],[587,0.5],[659,0.5],[698,0.5], // C D E F
  [784,1.0],[0,  0.5],[784,0.5],           // G   G
  [698,0.5],[659,0.5],[587,0.5],[523,0.5], // F E D C
  [659,1.5],[0,  0.5],                     // E
  [659,0.5],[784,0.5],[880,0.5],[784,0.5], // E G A G
  [698,0.5],[659,0.5],[0,  0.5],[523,0.5], // F E   C
  [587,0.5],[659,0.5],[698,0.5],[659,0.5], // D E F E
  [523,2.0],                               // C (hold)
];

// ─── Dish art (start-screen canvas) ──────────────────────────────────────────
function drawDishArt(ctx, cw, ch) {
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = '#0f0f1e';
  ctx.fillRect(0, 0, cw, ch);

  function plate(cx, cy, rx, ry) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(cx+4, cy+5, rx, ry*0.88, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#4a6e58';
    ctx.beginPath(); ctx.ellipse(cx, cy+3, rx, ry, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#8aae96';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(200,235,215,0.42)';
    ctx.beginPath(); ctx.ellipse(cx-rx*0.2, cy-ry*0.32, rx*0.52, ry*0.4, -0.3, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#6b9478'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx*0.63, ry*0.63, 0, 0, Math.PI*2); ctx.stroke();
    const n = Math.max(14, Math.round(rx * 1.1));
    for (let i = 0; i < n; i++) {
      const a = (i/n)*Math.PI*2;
      const bx = cx + Math.cos(a)*rx*0.84, by = cy + Math.sin(a)*ry*0.84;
      ctx.fillStyle = '#3e5e4a'; ctx.fillRect(bx-1, by,   2, 2);
      ctx.fillStyle = '#c0dac8'; ctx.fillRect(bx-1, by-1, 2, 2);
    }
    ctx.fillStyle = '#e53935'; ctx.fillRect(cx-5, cy-3, 4, 4);
    ctx.fillStyle = '#43a047'; ctx.fillRect(cx+2, cy-3, 4, 4);
    ctx.fillStyle = '#ff8f00'; ctx.fillRect(cx-1, cy+1, 3, 3);
    ctx.fillStyle = '#f5f5dc'; ctx.fillRect(cx-4, cy+1, 3, 3);
  }

  function bowl(cx, cy, rx, ry) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(cx+4, cy+6, rx, ry*0.7, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#3e6050';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#8aae96';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx*0.84, ry*0.84, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#5a8870';
    ctx.beginPath(); ctx.ellipse(cx, cy+ry*0.08, rx*0.55, ry*0.5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(200,235,215,0.42)';
    ctx.beginPath(); ctx.ellipse(cx-rx*0.25, cy-ry*0.35, rx*0.38, ry*0.28, -0.3, 0, Math.PI*2); ctx.fill();
    const n = Math.max(16, Math.round(rx*1.25));
    for (let i = 0; i < n; i++) {
      const a = (i/n)*Math.PI*2;
      const bx = cx + Math.cos(a)*rx*0.92, by = cy + Math.sin(a)*ry*0.92;
      ctx.fillStyle = '#3e5e4a'; ctx.fillRect(bx-1, by,   2, 2);
      ctx.fillStyle = '#c0dac8'; ctx.fillRect(bx-1, by-1, 2, 2);
    }
    ctx.fillStyle = '#e53935'; ctx.fillRect(cx-4, cy-2, 3, 3);
    ctx.fillStyle = '#ff8f00'; ctx.fillRect(cx+1, cy-1, 3, 3);
    ctx.fillStyle = '#f5f5dc'; ctx.fillRect(cx-1, cy+2, 3, 2);
  }

  plate(75, 60, 58, 22);
  plate(175, 52, 44, 17);
  bowl(122, 82, 46, 30);

  ctx.fillStyle = '#8aae96';
  ctx.font = '7px monospace'; ctx.textAlign = 'center';
  ctx.fillText('COLLEZIONE PIATTI CERAMICA', cw/2, ch-5);
}

// ─── AudioEngine ──────────────────────────────────────────────────────────────
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this._engineNode  = null;
    this._engineGain  = null;
    this._musicActive = false;
    this._musicTimer  = null;
  }

  _ensureCtx() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  beep(freq, dur, type = 'square', vol = 0.15) {
    if (!this.enabled) return;
    this._ensureCtx(); if (!this.ctx) return;
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.type = type; osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    osc.start(this.ctx.currentTime); osc.stop(this.ctx.currentTime + dur);
  }

  collectSound() { this.beep(880, 0.08); setTimeout(() => this.beep(1320, 0.12), 60); }
  crashSound()   { this.beep(140, 0.3, 'sawtooth', 0.32); setTimeout(() => this.beep(90, 0.55, 'sawtooth', 0.22), 80); }
  tirePop(delay = 0) {
    setTimeout(() => {
      this.beep(220, 0.04, 'sawtooth', 0.45);
      setTimeout(() => this.beep(75, 0.38, 'sawtooth', 0.18), 35);
    }, delay);
  }

  startEngine() {
    if (!this.enabled) return;
    this._ensureCtx(); if (!this.ctx || this._engineNode) return;
    this._engineGain = this.ctx.createGain();
    this._engineGain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    this._engineGain.connect(this.ctx.destination);
    this._engineNode = this.ctx.createOscillator();
    this._engineNode.type = 'sawtooth';
    this._engineNode.frequency.setValueAtTime(80, this.ctx.currentTime);
    this._engineNode.connect(this._engineGain);
    this._engineNode.start();
  }

  stopEngine() {
    if (this._engineNode) {
      try { this._engineNode.stop(); } catch(e) {}
      this._engineNode = null; this._engineGain = null;
    }
  }

  setEngineSpeed(speed) {
    if (this._engineNode && this.ctx)
      this._engineNode.frequency.setValueAtTime(60 + speed * 20, this.ctx.currentTime);
  }

  // ── Background music ───────────────────────────────────────────────────────
  startMusic() {
    if (!this.enabled || this._musicActive) return;
    this._ensureCtx(); if (!this.ctx) return;
    this._musicActive = true;
    this._scheduleLoop(this.ctx.currentTime + 0.05);
  }

  stopMusic() {
    this._musicActive = false;
    if (this._musicTimer) { clearTimeout(this._musicTimer); this._musicTimer = null; }
  }

  _scheduleLoop(startAt) {
    if (!this._musicActive || !this.enabled || !this.ctx) return;
    const beatDur = 60 / C.MUSIC_BPM;
    let t = startAt, totalBeats = 0;
    for (const [freq, beats] of MUSIC_NOTES) {
      if (freq > 0) this._scheduleNote(freq, t, beats * beatDur * 0.82);
      t += beats * beatDur;
      totalBeats += beats;
    }
    const loopMs = totalBeats * beatDur * 1000;
    this._musicTimer = setTimeout(
      () => this._scheduleLoop(startAt + totalBeats * beatDur),
      loopMs - 120
    );
  }

  _scheduleNote(freq, when, dur) {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.type = 'square'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.07, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + Math.max(0.01, dur));
      osc.start(when); osc.stop(when + dur + 0.05);
    } catch(e) {}
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) { this.stopEngine(); this.stopMusic(); }
    return this.enabled;
  }
}

// ─── Renderer ─────────────────────────────────────────────────────────────────
class Renderer {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); }

  clear() { this.ctx.clearRect(0, 0, C.WIDTH, C.HEIGHT); }

  drawRoad(offset) {
    const ctx = this.ctx;
    ctx.fillStyle = C.ROAD_COLOR; ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);
    ctx.setLineDash([30, 20]); ctx.strokeStyle = C.LANE_COLOR; ctx.lineWidth = 3;
    for (let l = 1; l < C.LANES; l++) {
      const x = l * C.LANE_W, startY = (offset % 50) - 50;
      ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, C.HEIGHT + 50); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 5;
    ctx.strokeRect(2, 0, C.WIDTH - 4, C.HEIGHT);
  }

  _rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
    ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
    ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
    ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
    ctx.closePath();
  }

  // tilt ∈ [-1,+1]; front of car faces UP
  drawCar(lane, y, tilt) {
    const ctx = this.ctx, w = C.CAR_W, h = C.CAR_H, cx = laneX(lane);
    ctx.save();
    ctx.translate(cx, y + h/2);
    ctx.scale(1, -1);
    ctx.transform(1, 0, tilt * C.TILT_SKEW, 1, 0, 0);
    const lx = -w/2, ty = -h/2;

    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    this._rr(ctx, lx+7+tilt*6, ty+7, w-2, h-2, 8); ctx.fill();

    ctx.fillStyle = '#3a3a3a'; this._rr(ctx, lx, ty, w, h, 9); ctx.fill();
    ctx.fillStyle = '#9e9e9e'; this._rr(ctx, lx+3, ty+3, w-6, h-6, 7); ctx.fill();
    ctx.fillStyle = 'rgba(230,230,230,0.44)'; ctx.fillRect(lx+9, ty+10, 9, h-20);

    ctx.fillStyle = '#14203a'; this._rr(ctx, lx+14, ty+22, w-28, h-50, 4); ctx.fill();
    ctx.fillStyle = 'rgba(120,170,255,0.18)'; ctx.fillRect(lx+16, ty+24, 11, 10);

    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(lx+10, ty+24, 3, h-52); ctx.fillRect(lx+w-13, ty+24, 3, h-52);
    ctx.fillStyle = '#808080';
    [ty+23, ty+h-30].forEach(ey => {
      ctx.fillRect(lx+10, ey, 3, 3); ctx.fillRect(lx+w-13, ey, 3, 3);
    });

    // BMW roundel
    const rx0 = 0, ry0 = ty+22+(h-50)/2;
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(rx0, ry0, 9, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = '#0d0d0d'; ctx.beginPath(); ctx.arc(rx0, ry0, 8, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#0e66b0';
    ctx.beginPath(); ctx.moveTo(rx0,ry0); ctx.arc(rx0,ry0,7,Math.PI,Math.PI*1.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(rx0,ry0); ctx.arc(rx0,ry0,7,0,Math.PI*0.5);       ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f5f5f5';
    ctx.beginPath(); ctx.moveTo(rx0,ry0); ctx.arc(rx0,ry0,7,Math.PI*1.5,Math.PI*2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(rx0,ry0); ctx.arc(rx0,ry0,7,Math.PI*0.5,Math.PI);   ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(rx0-7,ry0); ctx.lineTo(rx0+7,ry0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx0,ry0-7); ctx.lineTo(rx0,ry0+7); ctx.stroke();

    // Rear (local top → screen bottom)
    ctx.fillStyle = '#6e6e6e'; ctx.fillRect(lx+5, ty+4, w-10, 16);
    ctx.fillStyle = '#b71c1c';
    ctx.fillRect(lx+4, ty+4, 18, 11); ctx.fillRect(lx+w-22, ty+4, 18, 11);
    ctx.fillStyle = '#ff5252';
    ctx.fillRect(lx+4, ty+5, 18, 2); ctx.fillRect(lx+w-22, ty+5, 18, 2);
    ctx.fillStyle = '#eee'; ctx.fillRect(lx+w/2-7, ty+6, 14, 6);
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(lx+6, ty+2, w-12, 3);

    // Front (local bottom → screen top)
    ctx.fillStyle = '#888'; ctx.fillRect(lx+5, ty+h-22, w-10, 16);
    ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(lx+w/2-2, ty+h-22, 4, 16);
    const gw=13,gh=10,gl=lx+w/2-gw-2,gr=lx+w/2+2,gy=ty+h-14;
    ctx.fillStyle = '#c0c0c0'; ctx.fillRect(gl-1,gy-1,gw+2,gh+2); ctx.fillRect(gr-1,gy-1,gw+2,gh+2);
    ctx.fillStyle = '#0d0d0d'; ctx.fillRect(gl,gy,gw,gh); ctx.fillRect(gr,gy,gw,gh);
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1;
    for (let s=1;s<=3;s++){
      ctx.beginPath(); ctx.moveTo(gl+s*(gw/4),gy); ctx.lineTo(gl+s*(gw/4),gy+gh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gr+s*(gw/4),gy); ctx.lineTo(gr+s*(gw/4),gy+gh); ctx.stroke();
    }
    ctx.fillStyle = '#c0c0c0'; ctx.fillRect(lx+w/2-2,gy,4,gh);
    ctx.fillStyle = '#fff9c4'; ctx.fillRect(lx+4,ty+h-20,13,8); ctx.fillRect(lx+w-17,ty+h-20,13,8);
    ctx.fillStyle = '#ffe082'; ctx.fillRect(lx+4,ty+h-13,13,2); ctx.fillRect(lx+w-17,ty+h-13,13,2);
    ctx.fillStyle = '#bbdefb'; ctx.fillRect(lx+6,ty+h-19,9,5);  ctx.fillRect(lx+w-15,ty+h-19,9,5);

    // Wheels
    const steer=tilt*5, ww=13, wh=20;
    const drawWheel = (wx,wy) => {
      ctx.fillStyle='#111';      ctx.fillRect(wx,    wy,    ww, wh);
      ctx.fillStyle='#9e9e9e';   ctx.fillRect(wx+3,  wy+3,  6,  14);
      ctx.fillStyle='#444';      ctx.fillRect(wx+5,  wy+7,  2,  6);
    };
    drawWheel(lx-4,          ty+10);
    drawWheel(lx+w-ww+4,     ty+10);
    drawWheel(lx-4+steer,    ty+h-30);
    drawWheel(lx+w-ww+4+steer, ty+h-30);

    ctx.restore();
  }

  // ── Traffic island (replaces sidewalk) ─────────────────────────────────────
  drawIsland(island) {
    const ctx = this.ctx;
    const cx = island.x, cy = island.y;
    const iw = island.w, ih = C.ISLAND_H;
    const x  = cx - iw/2, y = cy - ih/2;
    const border = 10;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(x+5, y+5, iw, ih);

    // Black base
    ctx.fillStyle = '#111'; ctx.fillRect(x, y, iw, ih);

    // Yellow diagonal stripes (hazard pattern)
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, iw, ih); ctx.clip();
    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 6;
    for (let i = -(ih*2); i < iw + ih; i += 14) {
      ctx.beginPath(); ctx.moveTo(x+i, y); ctx.lineTo(x+i+ih+border*2, y+ih+border*2); ctx.stroke();
    }
    ctx.restore();

    // Green inner surface
    ctx.fillStyle = '#2d7a2d'; ctx.fillRect(x+border, y+border, iw-border*2, ih-border*2);
    // Grass texture stripes
    ctx.fillStyle = '#267326';
    for (let gx = x+border+3; gx < x+iw-border; gx += 6)
      ctx.fillRect(gx, y+border+2, 2, ih-border*2-4);

    // Pole (golden yellow)
    ctx.fillStyle = '#ccaa00';
    ctx.fillRect(cx-2, cy-2, 4, ih/2 + 2);

    // Blue mandatory-direction sign
    const sr = 13, sx = cx, sy = cy - 4 - sr;
    ctx.fillStyle = '#0d47a1';
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI*2); ctx.stroke();

    // White arrow(s) on sign
    ctx.fillStyle = '#fff';
    const arrow = (dir, ox) => {
      const ax = sx+ox, ay = sy;
      ctx.beginPath();
      if (dir === 'left') { ctx.moveTo(ax-7,ay); ctx.lineTo(ax+5,ay-5); ctx.lineTo(ax+5,ay+5); }
      else                { ctx.moveTo(ax+7,ay); ctx.lineTo(ax-5,ay-5); ctx.lineTo(ax-5,ay+5); }
      ctx.closePath(); ctx.fill();
    };
    if (island.arrow === 'both') { arrow('left', -5); arrow('right', +5); }
    else arrow(island.arrow, 0);
  }

  drawDish(dish) {
    if (dish.collected) return;
    const ctx = this.ctx, cx = dish.x, cy = dish.y, rx = C.DISH_W/2, ry = rx*0.36;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(cx+3,cy+5,rx-2,ry-1,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#5a7a68';
    ctx.beginPath(); ctx.ellipse(cx,cy+3,rx,ry,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#8aae96';
    ctx.beginPath(); ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(200,230,210,0.35)';
    ctx.beginPath(); ctx.ellipse(cx-rx*0.18,cy-ry*0.3,rx*0.55,ry*0.45,-0.3,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#6b9478'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx,cy,rx*0.62,ry*0.62,0,0,Math.PI*2); ctx.stroke();
    for (let i=0;i<22;i++){
      const a=(i/22)*Math.PI*2;
      const bx=cx+Math.cos(a)*rx*0.84, by=cy+Math.sin(a)*ry*0.84;
      ctx.fillStyle='#4e6e5a'; ctx.fillRect(bx-1,by,  3,3);
      ctx.fillStyle='#b5d4bc'; ctx.fillRect(bx-1,by-1,3,3);
    }
    ctx.fillStyle='#e53935'; ctx.fillRect(cx-7,cy-3,4,4);
    ctx.fillStyle='#43a047'; ctx.fillRect(cx+3,cy-4,4,4);
    ctx.fillStyle='#ff8f00'; ctx.fillRect(cx-2,cy+1,4,3);
    ctx.fillStyle='#f5f5dc'; ctx.fillRect(cx-5,cy+1,3,3);
    ctx.fillStyle='#fffde7'; ctx.fillRect(cx+rx-7,cy-ry+1,3,3);
    ctx.fillStyle='#FFD700'; ctx.fillRect(cx+rx-5,cy-ry-1,2,2);
  }

  drawExplosion(particles) {
    const ctx = this.ctx;
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color;
      ctx.fillRect(p.x-p.size/2, p.y-p.size/2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  drawFlash(alpha) {
    if (alpha <= 0) return;
    this.ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
    this.ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);
  }

  drawPauseScreen() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(0,0,C.WIDTH,C.HEIGHT);
    ctx.fillStyle = '#FFD700'; ctx.font = '18px monospace'; ctx.textAlign = 'center';
    ctx.fillText('IN PAUSA', C.WIDTH/2, C.HEIGHT/2-10);
    ctx.fillStyle = '#aaa'; ctx.font = '9px monospace';
    ctx.fillText('premi P per continuare', C.WIDTH/2, C.HEIGHT/2+16);
  }
}

// ─── Game ─────────────────────────────────────────────────────────────────────
class Game {
  constructor(canvasId) {
    this.canvas   = document.getElementById(canvasId);
    this.renderer = new Renderer(this.canvas);
    this.audio    = new AudioEngine();
    this._musicOn = true;
    this._reset();
  }

  _reset() {
    this.lane        = 1;
    this.carY        = C.HEIGHT - C.CAR_H - 20;
    this.carTilt     = 0;
    this.score       = 0;
    this.speed       = C.ROAD_SPEED_INIT;
    this.roadOffset  = 0;
    this.frame       = 0;
    this.kmh         = 0;
    this.paused      = false;
    this.gameOver    = false;
    this.dishes      = [];
    this.islands     = [];
    this.particles   = [];
    this._nextDish   = C.SPAWN_INTERVAL_DISH;
    this._nextIsle   = C.SPAWN_INTERVAL_ISLE;
    this._raf        = null;
    this._crashPhase = 0;
    this._crashFlash = 0;
    this._shake      = 0;
    this._shakeDir   = 1;
  }

  init() {
    this._reset();
    this.audio.enabled = this._musicOn;
    this._updateMusicBtn();
    this._updateHUD();
    this.audio.startMusic();
    this._loop();
  }

  reset() {
    this.audio.stopEngine();
    this.audio.stopMusic();
    if (this._raf) cancelAnimationFrame(this._raf);
    this._hideOverlay();
    this._reset();
    this.audio.enabled = this._musicOn;
    this._updateMusicBtn();
    this._updateHUD();
    this._setStatus('PRONTI... VIA!');
    this.audio.startMusic();
    this._loop();
  }

  moveLeft() {
    if (!this.paused && !this.gameOver && this.lane > 0)
      { this.lane--; this.carTilt = -C.TILT_MAX; }
  }
  moveRight() {
    if (!this.paused && !this.gameOver && this.lane < C.LANES-1)
      { this.lane++; this.carTilt = +C.TILT_MAX; }
  }

  togglePause() {
    if (this.gameOver) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.audio.stopEngine(); this.audio.stopMusic();
      this._setStatus('IN PAUSA');
    } else {
      this._setStatus('IN GARA!');
      this.audio.startMusic();
      this._loop();
    }
    const btn = document.getElementById('btn-pause');
    if (btn) btn.textContent = this.paused ? '▶ RIPRENDI' : '⏸';
  }

  toggleMusic() {
    this._musicOn = this.audio.toggle();
    this._updateMusicBtn();
    if (!this._musicOn) { this.audio.stopEngine(); this.audio.stopMusic(); }
    else if (!this.paused && !this.gameOver) { this.audio.startEngine(); this.audio.startMusic(); }
  }

  _loop() {
    if (this.paused || this.gameOver) return;
    this._update(); this._draw();
    this._raf = requestAnimationFrame(() => this._loop());
  }

  _update() {
    this.frame++;
    this.speed += C.SPEED_INCREMENT;
    this.kmh = Math.min(C.KMH_MAX, Math.round(this.frame * C.KMH_MAX / C.KMH_FRAMES));
    this.roadOffset = (this.roadOffset + this.speed) % C.HEIGHT;

    if (this.frame >= this._nextDish) {
      this._spawnDish();
      this._nextDish = this.frame + C.SPAWN_INTERVAL_DISH + Math.floor(Math.random()*40);
    }
    if (this.frame >= this._nextIsle) {
      this._spawnIsland();
      this._nextIsle = this.frame + C.SPAWN_INTERVAL_ISLE + Math.floor(Math.random()*60);
    }

    for (const d of this.dishes) {
      d.y += this.speed;
      if (!d.collected && this._hitCar(d.x, d.y, C.DISH_W*0.8, C.DISH_H*0.5)) {
        d.collected = true; this.score += C.POINTS_PER_DISH;
        this.audio.collectSound(); this._updateHUD();
      }
    }
    this.dishes = this.dishes.filter(d => !d.collected && d.y < C.HEIGHT+40);

    for (const isle of this.islands) {
      isle.y += this.speed;
      if (!isle.hit && this._islandHitsCar(isle)) {
        isle.hit = true; this._triggerCrash(); return;
      }
    }
    this.islands = this.islands.filter(s => s.y < C.HEIGHT + C.ISLAND_H);

    this.carTilt *= C.TILT_DECAY;
    if (Math.abs(this.carTilt) < C.TILT_THRESHOLD) this.carTilt = 0;

    for (const p of this.particles) { p.x += p.vx; p.y += p.vy; p.life -= 0.02; }
    this.particles = this.particles.filter(p => p.life > 0);

    this._updateHUD();
    this.audio.setEngineSpeed(this.speed);
    if (this.frame === 30) this.audio.startEngine();
  }

  _draw() {
    const ctx = this.renderer.ctx, sh = this._shake;
    if (sh) { ctx.save(); ctx.translate(sh, 0); }
    this.renderer.drawRoad(this.roadOffset);
    for (const d of this.dishes)   this.renderer.drawDish(d);
    for (const s of this.islands)  this.renderer.drawIsland(s);
    this.renderer.drawCar(this.lane, this.carY, this.carTilt);
    if (this.particles.length) this.renderer.drawExplosion(this.particles);
    if (this._crashFlash > 0)  this.renderer.drawFlash(this._crashFlash);
    if (sh) ctx.restore();
    if (this.paused) this.renderer.drawPauseScreen();
  }

  _spawnDish() {
    const lane = Math.floor(Math.random()*C.LANES);
    this.dishes.push({ x: laneX(lane), y: -C.DISH_H, collected: false });
  }

  // Weighted random island spawn
  _spawnIsland() {
    const total = ISLAND_WEIGHTS.reduce((a,b)=>a+b,0);
    let r = Math.random()*total;
    let def = ISLAND_DEFS[0];
    for (let i=0;i<ISLAND_DEFS.length;i++) { r -= ISLAND_WEIGHTS[i]; if (r<=0){ def=ISLAND_DEFS[i]; break; } }
    this.islands.push({ ...def, y: -C.ISLAND_H/2, hit: false });
  }

  // Lane-based collision: blocked if car is in one of the island's lanes AND y overlaps
  _islandHitsCar(isle) {
    if (!isle.lanes.includes(this.lane)) return false;
    const carCY = this.carY + C.CAR_H/2;
    return Math.abs(isle.y - carCY) < (C.ISLAND_H/2 + C.CAR_H*0.42);
  }

  _hitCar(ox, oy, ow, oh) {
    const carCX = laneX(this.lane), carCY = this.carY+C.CAR_H/2;
    const hw = C.CAR_W*0.45, hh = C.CAR_H*0.45;
    return Math.abs(ox-carCX)<(ow/2+hw) && Math.abs(oy-carCY)<(oh/2+hh);
  }

  // ── Crash sequence ──────────────────────────────────────────────────────────
  _triggerCrash() {
    this.gameOver = true;
    this.audio.stopEngine(); this.audio.stopMusic();
    this._setStatus('💥 BOTTO!');
    this._crashPhase = 0; this._crashAnim();
  }

  _crashAnim() {
    this._crashPhase++;
    const ph = this._crashPhase;
    if (ph <= 8)  this.carY -= 4;
    if (ph === 9) { this._crashFlash = 1; this.audio.crashSound(); this._createExplosion(laneX(this.lane), this.carY+C.CAR_H/2); }
    if (ph >  9)  this._crashFlash = Math.max(0, this._crashFlash - 0.07);
    if (ph >= 9 && ph <= 26) { this._shake = (27-ph)*1.8*this._shakeDir; this._shakeDir *= -1; }
    else this._shake = 0;
    if (ph ===  9) { this.audio.tirePop(0);  this._popTire(0); }
    if (ph === 14) { this.audio.tirePop(0);  this._popTire(1); }
    if (ph === 19) { this.audio.tirePop(0);  this._popTire(2); }
    if (ph === 24) { this.audio.tirePop(0);  this._popTire(3); }
    for (const p of this.particles) { p.x+=p.vx; p.y+=p.vy; p.vy+=0.12; p.life-=0.013; }
    this.particles = this.particles.filter(p=>p.life>0);
    this._draw();
    if (ph < 72) { requestAnimationFrame(()=>this._crashAnim()); }
    else {
      this._shake=0; this._crashFlash=0;
      this._setStatus('GAME OVER!');
      const prev = this._getHighScore();
      if (this.score > prev) this._setHighScore(this.score);
      this._showOverlay();
    }
  }

  _popTire(idx) {
    const sideX = (idx%2===0) ? -(C.CAR_W/2) : (C.CAR_W/2);
    const sideY = idx<2 ? C.CAR_H*0.15 : C.CAR_H*0.82;
    const cx=laneX(this.lane)+sideX, cy=this.carY+sideY;
    for (let i=0;i<10;i++){
      const a=Math.random()*Math.PI*2, spd=1.5+Math.random()*3;
      this.particles.push({ x:cx,y:cy, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd,
        size:3+Math.random()*5, color:['#212121','#424242','#FF8C00','#777'][Math.floor(Math.random()*4)], life:0.9 });
    }
  }

  _createExplosion(cx, cy) {
    const colors=['#FF4444','#FF8800','#FFD700','#FFFFFF','#FF6600'];
    for (let i=0;i<45;i++){
      const a=Math.random()*Math.PI*2, spd=2+Math.random()*6;
      this.particles.push({ x:cx,y:cy, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd,
        size:4+Math.random()*9, color:colors[Math.floor(Math.random()*colors.length)], life:1 });
    }
  }

  _getHighScore() { try { return parseInt(localStorage.getItem(C.HS_KEY)||'0',10); } catch(e){ return 0; } }
  _setHighScore(s) { try { localStorage.setItem(C.HS_KEY,String(s)); } catch(e){} }

  _updateHUD() {
    const s=document.getElementById('score'), kmhEl=document.getElementById('kmh-display');
    if(s)     s.textContent   = this.score;
    if(kmhEl) kmhEl.textContent = this.kmh;
  }
  _setStatus(text) { const el=document.getElementById('status-display'); if(el) el.textContent=text; }
  _updateMusicBtn() {
    const btn=document.getElementById('btn-music');
    if(btn) btn.textContent = this._musicOn ? '♫ MUSICA ON' : '♪ MUSICA OFF';
  }

  _showOverlay() {
    const ov=document.getElementById('overlay'), t=document.getElementById('overlay-title'),
          sc=document.getElementById('overlay-score'), rec=document.getElementById('overlay-record');
    if(ov)  ov.classList.remove('hidden');
    if(t)   t.textContent  = '💥 GOMME ESPLOSE! 💥';
    if(sc)  sc.textContent = 'PUNTEGGIO: ' + this.score;
    const hs = this._getHighScore();
    if(rec) rec.textContent = '🏆 RECORD: ' + hs;
    const hsDsp=document.getElementById('hs-display'); if(hsDsp) hsDsp.textContent=hs;
  }
  _hideOverlay() { const ov=document.getElementById('overlay'); if(ov) ov.classList.add('hidden'); }
}

// Export for unit tests (Node/Jest)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Game, AudioEngine, Renderer, laneX, drawDishArt, C, ISLAND_DEFS, ISLAND_WEIGHTS, MUSIC_NOTES };
}
