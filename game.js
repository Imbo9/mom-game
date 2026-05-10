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
  SIDE_W: 80,
  SIDE_H: 40,
  ROAD_SPEED_INIT: 3,
  SPEED_INCREMENT: 0.0005,
  SPAWN_INTERVAL_DISH: 90,
  SPAWN_INTERVAL_SIDE: 120,
  POINTS_PER_DISH: 10,
  TILT_MAX:       1.0,
  TILT_DECAY:     0.80,
  TILT_THRESHOLD: 0.01,
  TILT_SKEW:      0.22,
  ROAD_COLOR:     '#2a2a2a',
  LANE_COLOR:     '#FFFFFF',
  HS_KEY:         'bmwRacer_hs',
};

function laneX(lane) { return lane * C.LANE_W + C.LANE_W / 2; }

// ─── Dish art (used on start-screen canvas) ──────────────────────────────────
function drawDishArt(ctx, cw, ch) {
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = '#0f0f1e';
  ctx.fillRect(0, 0, cw, ch);

  function plate(cx, cy, rx, ry) {
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(cx+4, cy+5, rx, ry*0.88, 0, 0, Math.PI*2); ctx.fill();
    // thickness edge
    ctx.fillStyle = '#4a6e58';
    ctx.beginPath(); ctx.ellipse(cx, cy+3, rx, ry, 0, 0, Math.PI*2); ctx.fill();
    // surface
    ctx.fillStyle = '#8aae96';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2); ctx.fill();
    // highlight
    ctx.fillStyle = 'rgba(200,235,215,0.42)';
    ctx.beginPath(); ctx.ellipse(cx - rx*0.2, cy - ry*0.32, rx*0.52, ry*0.4, -0.3, 0, Math.PI*2); ctx.fill();
    // inner well ring
    ctx.strokeStyle = '#6b9478'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx*0.63, ry*0.63, 0, 0, Math.PI*2); ctx.stroke();
    // beaded rim
    const n = Math.max(14, Math.round(rx * 1.1));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const bx = cx + Math.cos(a) * rx * 0.84;
      const by = cy + Math.sin(a) * ry * 0.84;
      ctx.fillStyle = '#3e5e4a'; ctx.fillRect(bx-1, by,   2, 2);
      ctx.fillStyle = '#c0dac8'; ctx.fillRect(bx-1, by-1, 2, 2);
    }
    // food pixels
    ctx.fillStyle = '#e53935'; ctx.fillRect(cx-5, cy-3, 4, 4);
    ctx.fillStyle = '#43a047'; ctx.fillRect(cx+2, cy-3, 4, 4);
    ctx.fillStyle = '#ff8f00'; ctx.fillRect(cx-1, cy+1, 3, 3);
    ctx.fillStyle = '#f5f5dc'; ctx.fillRect(cx-4, cy+1, 3, 3);
  }

  function bowl(cx, cy, rx, ry) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(cx+4, cy+6, rx, ry*0.7, 0, 0, Math.PI*2); ctx.fill();
    // outer wall (seen from top)
    ctx.fillStyle = '#3e6050';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2); ctx.fill();
    // rim surface
    ctx.fillStyle = '#8aae96';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx*0.84, ry*0.84, 0, 0, Math.PI*2); ctx.fill();
    // inner deep well
    ctx.fillStyle = '#5a8870';
    ctx.beginPath(); ctx.ellipse(cx, cy + ry*0.08, rx*0.55, ry*0.5, 0, 0, Math.PI*2); ctx.fill();
    // highlight on rim
    ctx.fillStyle = 'rgba(200,235,215,0.42)';
    ctx.beginPath(); ctx.ellipse(cx - rx*0.25, cy - ry*0.35, rx*0.38, ry*0.28, -0.3, 0, Math.PI*2); ctx.fill();
    // beaded rim
    const n = Math.max(16, Math.round(rx * 1.25));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const bx = cx + Math.cos(a) * rx * 0.92;
      const by = cy + Math.sin(a) * ry * 0.92;
      ctx.fillStyle = '#3e5e4a'; ctx.fillRect(bx-1, by,   2, 2);
      ctx.fillStyle = '#c0dac8'; ctx.fillRect(bx-1, by-1, 2, 2);
    }
    // food in well
    ctx.fillStyle = '#e53935'; ctx.fillRect(cx-4, cy-2, 3, 3);
    ctx.fillStyle = '#ff8f00'; ctx.fillRect(cx+1, cy-1, 3, 3);
    ctx.fillStyle = '#f5f5dc'; ctx.fillRect(cx-1, cy+2, 3, 2);
  }

  // Large dinner plate (back-left)
  plate(75, 60, 58, 22);
  // Side plate (back-right, partially behind bowl)
  plate(175, 52, 44, 17);
  // Bowl (front-center, overlaps both)
  bowl(122, 82, 46, 30);

  // Label
  ctx.fillStyle = '#8aae96';
  ctx.font = '7px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('COLLEZIONE PIATTI CERAMICA', cw / 2, ch - 5);
}

// ─── AudioEngine ──────────────────────────────────────────────────────────────
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this._engineNode = null;
    this._engineGain = null;
  }

  _ensureCtx() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  beep(freq, dur, type = 'square', vol = 0.15) {
    if (!this.enabled) return;
    this._ensureCtx();
    if (!this.ctx) return;
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + dur);
  }

  collectSound() {
    this.beep(880, 0.08);
    setTimeout(() => this.beep(1320, 0.12), 60);
  }

  crashSound() {
    this.beep(140, 0.3, 'sawtooth', 0.32);
    setTimeout(() => this.beep(90, 0.55, 'sawtooth', 0.22), 80);
  }

  // Sharp bang + low hiss — one tire pop
  tirePop(delay = 0) {
    setTimeout(() => {
      this.beep(220, 0.04, 'sawtooth', 0.45);
      setTimeout(() => this.beep(75, 0.38, 'sawtooth', 0.18), 35);
    }, delay);
  }

  startEngine() {
    if (!this.enabled) return;
    this._ensureCtx();
    if (!this.ctx || this._engineNode) return;
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
      this._engineNode = null;
      this._engineGain = null;
    }
  }

  setEngineSpeed(speed) {
    if (this._engineNode && this.ctx) {
      this._engineNode.frequency.setValueAtTime(60 + speed * 20, this.ctx.currentTime);
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.stopEngine();
    return this.enabled;
  }
}

// ─── Renderer ─────────────────────────────────────────────────────────────────
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
  }

  clear() { this.ctx.clearRect(0, 0, C.WIDTH, C.HEIGHT); }

  drawRoad(offset) {
    const ctx = this.ctx;
    ctx.fillStyle = C.ROAD_COLOR;
    ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);

    // White dashed lane dividers
    ctx.setLineDash([30, 20]);
    ctx.strokeStyle = C.LANE_COLOR;
    ctx.lineWidth = 3;
    for (let l = 1; l < C.LANES; l++) {
      const x = l * C.LANE_W;
      const startY = (offset % 50) - 50;
      ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, C.HEIGHT + 50); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Gold border
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 5;
    ctx.strokeRect(2, 0, C.WIDTH - 4, C.HEIGHT);
  }

  // Rounded-rect path helper
  _rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);      ctx.arcTo(x+w, y,   x+w, y+r,   r);
    ctx.lineTo(x + w, y + h - r);  ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
    ctx.lineTo(x + r, y + h);      ctx.arcTo(x,   y+h, x,   y+h-r, r);
    ctx.lineTo(x, y + r);           ctx.arcTo(x,   y,   x+r, y,     r);
    ctx.closePath();
  }

  // tilt ∈ [-1, +1]; car front faces UP (direction of travel)
  drawCar(lane, y, tilt) {
    const ctx = this.ctx;
    const cx  = laneX(lane);
    const w   = C.CAR_W;
    const h   = C.CAR_H;

    ctx.save();
    ctx.translate(cx, y + h / 2);
    ctx.scale(1, -1);                                      // flip: front (headlights) now at TOP
    ctx.transform(1, 0, tilt * C.TILT_SKEW, 1, 0, 0);    // lean into turn

    const lx = -w / 2;   // left edge in local space
    const ty = -h / 2;   // top edge in local space (= BOTTOM of screen after flip)

    // ── Shadow ──
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    this._rr(ctx, lx + 7 + tilt * 6, ty + 7, w - 2, h - 2, 8); ctx.fill();

    // ── Body outline ──
    ctx.fillStyle = '#3a3a3a';
    this._rr(ctx, lx, ty, w, h, 9); ctx.fill();

    // ── Silver-grey body ──
    ctx.fillStyle = '#9e9e9e';
    this._rr(ctx, lx + 3, ty + 3, w - 6, h - 6, 7); ctx.fill();

    // ── Metallic sheen strip ──
    ctx.fillStyle = 'rgba(230,230,230,0.44)';
    ctx.fillRect(lx + 9, ty + 10, 9, h - 20);

    // ── Panoramic sunroof ──
    ctx.fillStyle = '#14203a';
    this._rr(ctx, lx + 14, ty + 22, w - 28, h - 50, 4); ctx.fill();
    ctx.fillStyle = 'rgba(120,170,255,0.18)';
    ctx.fillRect(lx + 16, ty + 24, 11, 10);

    // ── Roof rails ──
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(lx + 10, ty + 24, 3, h - 52);
    ctx.fillRect(lx + w - 13, ty + 24, 3, h - 52);
    ctx.fillStyle = '#808080';
    [ty + 23, ty + h - 30].forEach(ey => {
      ctx.fillRect(lx + 10, ey, 3, 3);
      ctx.fillRect(lx + w - 13, ey, 3, 3);
    });

    // ── BMW Roundel ──
    const rx0 = 0, ry0 = ty + 22 + (h - 50) / 2;
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(rx0, ry0, 9, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = '#0d0d0d';
    ctx.beginPath(); ctx.arc(rx0, ry0, 8, 0, Math.PI*2); ctx.fill();
    // blue quadrants
    ctx.fillStyle = '#0e66b0';
    ctx.beginPath(); ctx.moveTo(rx0, ry0); ctx.arc(rx0, ry0, 7, Math.PI,      Math.PI*1.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(rx0, ry0); ctx.arc(rx0, ry0, 7, 0,            Math.PI*0.5); ctx.closePath(); ctx.fill();
    // white quadrants
    ctx.fillStyle = '#f5f5f5';
    ctx.beginPath(); ctx.moveTo(rx0, ry0); ctx.arc(rx0, ry0, 7, Math.PI*1.5, Math.PI*2);   ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(rx0, ry0); ctx.arc(rx0, ry0, 7, Math.PI*0.5, Math.PI);     ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(rx0-7, ry0); ctx.lineTo(rx0+7, ry0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx0, ry0-7); ctx.lineTo(rx0, ry0+7); ctx.stroke();

    // ─── REAR — local TOP (= screen BOTTOM after flip) ───
    ctx.fillStyle = '#6e6e6e';
    ctx.fillRect(lx + 5, ty + 4, w - 10, 16);
    // Tail lights — wide horizontal clusters
    ctx.fillStyle = '#b71c1c';
    ctx.fillRect(lx + 4,      ty + 4, 18, 11);
    ctx.fillRect(lx + w - 22, ty + 4, 18, 11);
    // LED accent lines
    ctx.fillStyle = '#ff5252';
    ctx.fillRect(lx + 4,      ty + 5, 18, 2);
    ctx.fillRect(lx + w - 22, ty + 5, 18, 2);
    // Central reverse light
    ctx.fillStyle = '#eeeeee';
    ctx.fillRect(lx + w/2 - 7, ty + 6, 14, 6);
    // Rear spoiler lip
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(lx + 6, ty + 2, w - 12, 3);

    // ─── FRONT — local BOTTOM (= screen TOP after flip) ──
    ctx.fillStyle = '#888';
    ctx.fillRect(lx + 5, ty + h - 22, w - 10, 16);
    // Hood crease
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(lx + w/2 - 2, ty + h - 22, 4, 16);

    // Kidney grille — twin openings with vertical slats
    const gw = 13, gh = 10;
    const gl = lx + w/2 - gw - 2;
    const gr = lx + w/2 + 2;
    const gy = ty + h - 14;
    ctx.fillStyle = '#c0c0c0';                         // chrome surround
    ctx.fillRect(gl - 1, gy - 1, gw + 2, gh + 2);
    ctx.fillRect(gr - 1, gy - 1, gw + 2, gh + 2);
    ctx.fillStyle = '#0d0d0d';                         // dark opening
    ctx.fillRect(gl, gy, gw, gh);
    ctx.fillRect(gr, gy, gw, gh);
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1;   // slats
    for (let s = 1; s <= 3; s++) {
      ctx.beginPath(); ctx.moveTo(gl + s*(gw/4), gy); ctx.lineTo(gl + s*(gw/4), gy+gh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gr + s*(gw/4), gy); ctx.lineTo(gr + s*(gw/4), gy+gh); ctx.stroke();
    }
    ctx.fillStyle = '#c0c0c0'; ctx.fillRect(lx + w/2 - 2, gy, 4, gh); // bridge

    // Headlights (angular, L-shaped DRL)
    ctx.fillStyle = '#fff9c4';
    ctx.fillRect(lx + 4,      ty + h - 20, 13, 8);
    ctx.fillRect(lx + w - 17, ty + h - 20, 13, 8);
    ctx.fillStyle = '#ffe082';                         // DRL strip
    ctx.fillRect(lx + 4,      ty + h - 13, 13, 2);
    ctx.fillRect(lx + w - 17, ty + h - 13, 13, 2);
    ctx.fillStyle = '#bbdefb';                         // projector tint
    ctx.fillRect(lx + 6,      ty + h - 19, 9, 5);
    ctx.fillRect(lx + w - 15, ty + h - 19, 9, 5);

    // ─── Wheels ──────────────────────────────────────────
    const steer = tilt * 5;       // front wheels steer in x
    const ww = 13, wh = 20;

    // Rear-left (local top → appears at BOTTOM of screen)
    ctx.fillStyle = '#111';   ctx.fillRect(lx - 4,          ty + 10,      ww, wh);
    ctx.fillStyle = '#9e9e9e'; ctx.fillRect(lx - 1,          ty + 13,      6,  14);
    ctx.fillStyle = '#444';   ctx.fillRect(lx + 1,           ty + 17,      2,  6);

    // Rear-right
    ctx.fillStyle = '#111';   ctx.fillRect(lx + w - ww + 4, ty + 10,      ww, wh);
    ctx.fillStyle = '#9e9e9e'; ctx.fillRect(lx + w - 5,      ty + 13,      6,  14);
    ctx.fillStyle = '#444';   ctx.fillRect(lx + w - 3,       ty + 17,      2,  6);

    // Front-left (local bottom → appears at TOP of screen; steered)
    ctx.fillStyle = '#111';   ctx.fillRect(lx - 4 + steer,          ty + h - 30, ww, wh);
    ctx.fillStyle = '#9e9e9e'; ctx.fillRect(lx - 1 + steer,          ty + h - 27, 6,  14);
    ctx.fillStyle = '#444';   ctx.fillRect(lx + 1 + steer,           ty + h - 23, 2,  6);

    // Front-right (steered)
    ctx.fillStyle = '#111';   ctx.fillRect(lx + w - ww + 4 + steer, ty + h - 30, ww, wh);
    ctx.fillStyle = '#9e9e9e'; ctx.fillRect(lx + w - 5 + steer,      ty + h - 27, 6,  14);
    ctx.fillStyle = '#444';   ctx.fillRect(lx + w - 3 + steer,       ty + h - 23, 2,  6);

    ctx.restore();
  }

  drawDish(dish) {
    if (dish.collected) return;
    const ctx = this.ctx;
    const cx  = dish.x, cy = dish.y;
    const rx  = C.DISH_W / 2;
    const ry  = rx * 0.36;

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(cx+3, cy+5, rx-2, ry-1, 0, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = '#5a7a68';
    ctx.beginPath(); ctx.ellipse(cx, cy+3, rx, ry, 0, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = '#8aae96';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = 'rgba(200,230,210,0.35)';
    ctx.beginPath(); ctx.ellipse(cx - rx*0.18, cy - ry*0.3, rx*0.55, ry*0.45, -0.3, 0, Math.PI*2); ctx.fill();

    ctx.strokeStyle = '#6b9478'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx*0.62, ry*0.62, 0, 0, Math.PI*2); ctx.stroke();

    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const bx = cx + Math.cos(a) * rx * 0.84;
      const by = cy + Math.sin(a) * ry * 0.84;
      ctx.fillStyle = '#4e6e5a'; ctx.fillRect(bx-1, by,   3, 3);
      ctx.fillStyle = '#b5d4bc'; ctx.fillRect(bx-1, by-1, 3, 3);
    }

    ctx.fillStyle = '#e53935'; ctx.fillRect(cx-7, cy-3, 4, 4);
    ctx.fillStyle = '#43a047'; ctx.fillRect(cx+3, cy-4, 4, 4);
    ctx.fillStyle = '#ff8f00'; ctx.fillRect(cx-2, cy+1, 4, 3);
    ctx.fillStyle = '#f5f5dc'; ctx.fillRect(cx-5, cy+1, 3, 3);
    ctx.fillStyle = '#fffde7'; ctx.fillRect(cx + rx - 7, cy - ry + 1, 3, 3);
    ctx.fillStyle = '#FFD700'; ctx.fillRect(cx + rx - 5, cy - ry - 1, 2, 2);
  }

  drawSidewalk(obs) {
    const ctx = this.ctx;
    const x   = obs.x - C.SIDE_W / 2;
    const y   = obs.y - C.SIDE_H / 2;

    ctx.fillStyle = '#B0B0B0';
    ctx.fillRect(x, y, C.SIDE_W, C.SIDE_H);

    ctx.strokeStyle = '#888'; ctx.lineWidth = 1;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const bx = x + col*(C.SIDE_W/4) + (row%2===0 ? 0 : C.SIDE_W/8);
        const by = y + row*(C.SIDE_H/3);
        ctx.strokeRect(bx, by, C.SIDE_W/4, C.SIDE_H/3);
      }
    }
    ctx.fillStyle = '#FF1744';
    ctx.fillRect(x, y, C.SIDE_W, 4);
    ctx.fillRect(x, y + C.SIDE_H - 4, C.SIDE_W, 4);
    ctx.fillStyle = '#FFD700';
    ctx.font = '7px monospace'; ctx.textAlign = 'center';
    ctx.fillText('MARCIAPIEDE!', obs.x, obs.y + 3);
  }

  drawExplosion(particles) {
    const ctx = this.ctx;
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
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
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);
    ctx.fillStyle = '#FFD700'; ctx.font = '18px monospace'; ctx.textAlign = 'center';
    ctx.fillText('IN PAUSA', C.WIDTH/2, C.HEIGHT/2 - 10);
    ctx.fillStyle = '#aaa'; ctx.font = '9px monospace';
    ctx.fillText('premi P per continuare', C.WIDTH/2, C.HEIGHT/2 + 16);
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
    this.lane         = 1;
    this.carY         = C.HEIGHT - C.CAR_H - 20;
    this.carTilt      = 0;
    this.score        = 0;
    this.speed        = C.ROAD_SPEED_INIT;
    this.roadOffset   = 0;
    this.frame        = 0;
    this.paused       = false;
    this.gameOver     = false;
    this.dishes       = [];
    this.sidewalks    = [];
    this.particles    = [];
    this._nextDish    = C.SPAWN_INTERVAL_DISH;
    this._nextSide    = C.SPAWN_INTERVAL_SIDE;
    this._raf         = null;
    this._crashPhase  = 0;
    this._crashFlash  = 0;
    this._shake       = 0;
    this._shakeDir    = 1;
  }

  init() {
    this._reset();
    this.audio.enabled = this._musicOn;
    this._updateMusicBtn();
    this._updateHUD();
    this._loop();
  }

  reset() {
    this.audio.stopEngine();
    if (this._raf) cancelAnimationFrame(this._raf);
    this._hideOverlay();
    this._reset();
    this.audio.enabled = this._musicOn;
    this._updateMusicBtn();
    this._updateHUD();
    this._setStatus('PRONTI... VIA!');
    this._loop();
  }

  moveLeft() {
    if (!this.paused && !this.gameOver && this.lane > 0) {
      this.lane--;
      this.carTilt = -C.TILT_MAX;
    }
  }
  moveRight() {
    if (!this.paused && !this.gameOver && this.lane < C.LANES - 1) {
      this.lane++;
      this.carTilt = +C.TILT_MAX;
    }
  }

  togglePause() {
    if (this.gameOver) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.audio.stopEngine();
      this._setStatus('IN PAUSA');
    } else {
      this._setStatus('IN GARA!');
      this._loop();
    }
    const btn = document.getElementById('btn-pause');
    if (btn) btn.textContent = this.paused ? '▶ RIPRENDI' : '⏸ PAUSA';
  }

  toggleMusic() {
    this._musicOn = this.audio.toggle();
    this._updateMusicBtn();
    if (!this._musicOn) this.audio.stopEngine();
    else if (!this.paused && !this.gameOver) this.audio.startEngine();
  }

  _loop() {
    if (this.paused || this.gameOver) return;
    this._update();
    this._draw();
    this._raf = requestAnimationFrame(() => this._loop());
  }

  _update() {
    this.frame++;
    this.speed += C.SPEED_INCREMENT;
    this.roadOffset = (this.roadOffset + this.speed) % C.HEIGHT;

    if (this.frame >= this._nextDish) {
      this._spawnDish();
      this._nextDish = this.frame + C.SPAWN_INTERVAL_DISH + Math.floor(Math.random() * 40);
    }
    if (this.frame >= this._nextSide) {
      this._spawnSidewalk();
      this._nextSide = this.frame + C.SPAWN_INTERVAL_SIDE + Math.floor(Math.random() * 60);
    }

    for (const d of this.dishes) {
      d.y += this.speed;
      if (!d.collected && this._hitCar(d.x, d.y, C.DISH_W * 0.8, C.DISH_H * 0.5)) {
        d.collected = true;
        this.score += C.POINTS_PER_DISH;
        this.audio.collectSound();
        this._updateHUD();
      }
    }
    this.dishes = this.dishes.filter(d => !d.collected && d.y < C.HEIGHT + 40);

    for (const s of this.sidewalks) {
      s.y += this.speed;
      if (!s.hit && this._hitCar(s.x, s.y, C.SIDE_W * 0.85, C.SIDE_H * 0.75)) {
        s.hit = true;
        this._triggerCrash();
        return;
      }
    }
    this.sidewalks = this.sidewalks.filter(s => s.y < C.HEIGHT + 50);

    this.carTilt *= C.TILT_DECAY;
    if (Math.abs(this.carTilt) < C.TILT_THRESHOLD) this.carTilt = 0;

    for (const p of this.particles) { p.x += p.vx; p.y += p.vy; p.life -= 0.02; }
    this.particles = this.particles.filter(p => p.life > 0);

    this._updateHUD();
    this.audio.setEngineSpeed(this.speed);
    if (this.frame === 30) this.audio.startEngine();
  }

  _draw() {
    const ctx = this.renderer.ctx;
    const sh  = this._shake;
    if (sh) { ctx.save(); ctx.translate(sh, 0); }
    this.renderer.drawRoad(this.roadOffset);
    for (const d of this.dishes)    this.renderer.drawDish(d);
    for (const s of this.sidewalks) this.renderer.drawSidewalk(s);
    this.renderer.drawCar(this.lane, this.carY, this.carTilt);
    if (this.particles.length)  this.renderer.drawExplosion(this.particles);
    if (this._crashFlash > 0)   this.renderer.drawFlash(this._crashFlash);
    if (sh) ctx.restore();
    if (this.paused) this.renderer.drawPauseScreen();
  }

  _spawnDish() {
    const lane = Math.floor(Math.random() * C.LANES);
    this.dishes.push({ x: laneX(lane), y: -C.DISH_H, collected: false });
  }
  _spawnSidewalk() {
    const lane = Math.floor(Math.random() * C.LANES);
    this.sidewalks.push({ x: laneX(lane), y: -C.SIDE_H, hit: false });
  }

  _hitCar(ox, oy, ow, oh) {
    const carCX = laneX(this.lane);
    const carCY = this.carY + C.CAR_H / 2;
    const hw = C.CAR_W * 0.45, hh = C.CAR_H * 0.45;
    return Math.abs(ox - carCX) < (ow/2 + hw) && Math.abs(oy - carCY) < (oh/2 + hh);
  }

  // ── Crash sequence ──────────────────────────────────────────────────────────
  _triggerCrash() {
    this.gameOver = true;
    this.audio.stopEngine();
    this._setStatus('💥 BOTTO!');
    this._crashPhase = 0;
    this._crashAnim();
  }

  _crashAnim() {
    this._crashPhase++;
    const ph = this._crashPhase;

    // Car lurches forward (upward) into the obstacle
    if (ph <= 8) {
      this.carY -= 4;
    }

    // Impact at phase 9: flash + bang + explosion burst
    if (ph === 9) {
      this._crashFlash = 1;
      this.audio.crashSound();
      this._createExplosion(laneX(this.lane), this.carY + C.CAR_H / 2);
    }

    // Flash fades over ~14 frames
    if (ph > 9) {
      this._crashFlash = Math.max(0, this._crashFlash - 0.07);
    }

    // Screen shake (phases 9–26)
    if (ph >= 9 && ph <= 26) {
      this._shake = (27 - ph) * 1.8 * this._shakeDir;
      this._shakeDir *= -1;
    } else {
      this._shake = 0;
    }

    // Tire pops, staggered every 5 frames starting at impact
    if (ph ===  9) { this.audio.tirePop(0);  this._popTire(0); }
    if (ph === 14) { this.audio.tirePop(0);  this._popTire(1); }
    if (ph === 19) { this.audio.tirePop(0);  this._popTire(2); }
    if (ph === 24) { this.audio.tirePop(0);  this._popTire(3); }

    // Particle physics
    for (const p of this.particles) {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.12;
      p.life -= 0.013;
    }
    this.particles = this.particles.filter(p => p.life > 0);

    this._draw();

    if (ph < 72) {
      requestAnimationFrame(() => this._crashAnim());
    } else {
      this._shake = 0;
      this._crashFlash = 0;
      this._setStatus('GAME OVER!');
      const prev = this._getHighScore();
      if (this.score > prev) this._setHighScore(this.score);
      this._showOverlay();
    }
  }

  // Spawn rubber-chunk particles at one tire corner
  _popTire(tireIndex) {
    const sideX = (tireIndex % 2 === 0) ? -(C.CAR_W / 2) : (C.CAR_W / 2);
    const sideY = tireIndex < 2 ? C.CAR_H * 0.15 : C.CAR_H * 0.82;
    const cx = laneX(this.lane) + sideX;
    const cy = this.carY + sideY;
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 1.5 + Math.random() * 3;
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        size:  3 + Math.random() * 5,
        color: ['#212121', '#424242', '#FF8C00', '#777'][Math.floor(Math.random() * 4)],
        life:  0.9,
      });
    }
  }

  _createExplosion(cx, cy) {
    const colors = ['#FF4444', '#FF8800', '#FFD700', '#FFFFFF', '#FF6600'];
    for (let i = 0; i < 45; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 2 + Math.random() * 6;
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        size:  4 + Math.random() * 9,
        color: colors[Math.floor(Math.random() * colors.length)],
        life:  1,
      });
    }
  }

  // ── High score ──────────────────────────────────────────────────────────────
  _getHighScore() {
    try { return parseInt(localStorage.getItem(C.HS_KEY) || '0', 10); } catch(e) { return 0; }
  }
  _setHighScore(s) {
    try { localStorage.setItem(C.HS_KEY, String(s)); } catch(e) {}
  }

  // ── HUD helpers ─────────────────────────────────────────────────────────────
  _updateHUD() {
    const s   = document.getElementById('score');
    const sp  = document.getElementById('speed');
    const hsh = document.getElementById('hs-hud');
    if (s)   s.textContent   = this.score;
    if (sp)  sp.textContent  = this.speed.toFixed(1);
    if (hsh) hsh.textContent = this._getHighScore();
  }

  _setStatus(text) {
    const el = document.getElementById('status-display');
    if (el) el.textContent = text;
  }

  _updateMusicBtn() {
    const btn = document.getElementById('btn-music');
    if (btn) btn.textContent = this._musicOn ? '♫ MUSICA ON' : '♪ MUSICA OFF';
  }

  _showOverlay() {
    const ov  = document.getElementById('overlay');
    const t   = document.getElementById('overlay-title');
    const sc  = document.getElementById('overlay-score');
    const rec = document.getElementById('overlay-record');
    if (ov)  ov.classList.remove('hidden');
    if (t)   t.textContent  = '💥 GOMME ESPLOSE! 💥';
    if (sc)  sc.textContent = 'PUNTEGGIO: ' + this.score;
    const hs = this._getHighScore();
    if (rec) rec.textContent = '🏆 RECORD: ' + hs;
    const hsDsp = document.getElementById('hs-display');
    if (hsDsp) hsDsp.textContent = hs;
  }

  _hideOverlay() {
    const ov = document.getElementById('overlay');
    if (ov) ov.classList.add('hidden');
  }
}

// Export for unit tests (Node/Jest)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Game, AudioEngine, Renderer, laneX, drawDishArt, C };
}
