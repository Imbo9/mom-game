'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const C = {
  WIDTH:  360,
  HEIGHT: 540,
  LANES:  3,
  LANE_W: 120,  // 360 / 3
  CAR_W:  56,
  CAR_H:  90,
  DISH_W: 58,   // enlarged ceramic plate
  DISH_H: 58,
  SIDE_W: 80,   // sidewalk obstacle width
  SIDE_H: 40,
  ROAD_SPEED_INIT: 3,
  SPEED_INCREMENT: 0.0005,
  SPAWN_INTERVAL_DISH: 90,   // frames
  SPAWN_INTERVAL_SIDE: 120,
  POINTS_PER_DISH: 10,
  ROAD_COLOR:   '#2a2a2a',
  LANE_COLOR:   '#FFD700',
  GRASS_COLOR:  '#1a5c1a',
  HUD_SCORE:    document.getElementById ? document.getElementById('score') : null,
  HUD_SPEED:    document.getElementById ? document.getElementById('speed') : null,
  HUD_STATUS:   document.getElementById ? document.getElementById('status-display') : null,
};

// Lane center X positions
function laneX(lane) { return lane * C.LANE_W + C.LANE_W / 2; }

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
    this.beep(120, 0.4, 'sawtooth', 0.3);
    setTimeout(() => this.beep(80, 0.5, 'sawtooth', 0.2), 100);
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
    this._roadOffset = 0;
  }

  clear() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, C.WIDTH, C.HEIGHT);
  }

  drawRoad(offset) {
    this._roadOffset = offset;
    const ctx = this.ctx;
    // Grass sides
    ctx.fillStyle = C.GRASS_COLOR;
    ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);

    // Road body (3 lanes = full width here, grass is decorative border)
    ctx.fillStyle = C.ROAD_COLOR;
    ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);

    // Lane dashes
    ctx.setLineDash([30, 20]);
    ctx.strokeStyle = C.LANE_COLOR;
    ctx.lineWidth = 3;
    for (let l = 1; l < C.LANES; l++) {
      ctx.beginPath();
      const x = l * C.LANE_W;
      // Offset for scrolling
      const startY = (offset % 50) - 50;
      ctx.moveTo(x, startY);
      ctx.lineTo(x, C.HEIGHT + 50);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Road borders
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 0, C.WIDTH - 4, C.HEIGHT);
  }

  // tilt: -1 = leaning left, 0 = straight, +1 = leaning right
  drawCar(lane, y, tilt) {
    const ctx = this.ctx;
    const cx  = laneX(lane);

    ctx.save();
    // Translate to car center, apply horizontal skew for lean effect
    ctx.translate(cx, y + C.CAR_H / 2);
    ctx.transform(1, 0, tilt * 0.13, 1, 0, 0);

    const x = -C.CAR_W / 2;
    const oy = -C.CAR_H / 2; // origin y within transformed space

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + 6 + tilt * 4, oy + 10, C.CAR_W - 4, C.CAR_H - 4);

    // Main body
    ctx.fillStyle = '#9E9E9E';
    ctx.fillRect(x + 4, oy + 14, C.CAR_W - 8, C.CAR_H - 24);

    // Roof
    ctx.fillStyle = '#BDBDBD';
    ctx.fillRect(x + 10, oy + 6, C.CAR_W - 20, 30);

    // Hood
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(x + 8, oy + C.CAR_H - 22, C.CAR_W - 16, 14);

    // Windshield
    ctx.fillStyle = '#B3E5FC';
    ctx.fillRect(x + 12, oy + C.CAR_H - 28, C.CAR_W - 24, 10);

    // Rear window
    ctx.fillStyle = '#B3E5FC';
    ctx.fillRect(x + 12, oy + 10, C.CAR_W - 24, 12);

    // Side windows — compress the side facing into turn
    const winL = tilt < 0 ? 6 : 8;
    const winR = tilt > 0 ? 6 : 8;
    ctx.fillStyle = '#81D4FA';
    ctx.fillRect(x + 5, oy + 16, winL, 18);
    ctx.fillRect(x + C.CAR_W - 5 - winR, oy + 16, winR, 18);

    // BMW kidney grille
    ctx.fillStyle = '#222';
    ctx.fillRect(x + 14, oy + C.CAR_H - 12, 10, 6);
    ctx.fillRect(x + C.CAR_W - 24, oy + C.CAR_H - 12, 10, 6);

    // Headlights
    ctx.fillStyle = '#FFFF99';
    ctx.fillRect(x + 6, oy + C.CAR_H - 14, 8, 5);
    ctx.fillRect(x + C.CAR_W - 14, oy + C.CAR_H - 14, 8, 5);

    // Tail lights
    ctx.fillStyle = '#FF1744';
    ctx.fillRect(x + 6, oy + 14, 7, 5);
    ctx.fillRect(x + C.CAR_W - 13, oy + 14, 7, 5);

    // Wheels — outer wheel lifts slightly during turn (smaller), inner compresses
    const wOuterH = 14 + Math.abs(tilt) * 3;
    const wInnerH = 16 - Math.abs(tilt) * 2;
    ctx.fillStyle = '#111';
    if (tilt < 0) {
      // turning left: right side is outer
      ctx.fillRect(x - 2, oy + C.CAR_H - 22, 10, wInnerH);
      ctx.fillRect(x + C.CAR_W - 8, oy + C.CAR_H - 22, 10, wOuterH);
      ctx.fillRect(x - 2, oy + 10, 10, wInnerH);
      ctx.fillRect(x + C.CAR_W - 8, oy + 10, 10, wOuterH);
    } else {
      // turning right: left side is outer
      ctx.fillRect(x - 2, oy + C.CAR_H - 22, 10, wOuterH);
      ctx.fillRect(x + C.CAR_W - 8, oy + C.CAR_H - 22, 10, wInnerH);
      ctx.fillRect(x - 2, oy + 10, 10, wOuterH);
      ctx.fillRect(x + C.CAR_W - 8, oy + 10, 10, wInnerH);
    }

    // Wheel rims
    ctx.fillStyle = '#888';
    ctx.fillRect(x, oy + C.CAR_H - 20, 6, 12);
    ctx.fillRect(x + C.CAR_W - 6, oy + C.CAR_H - 20, 6, 12);
    ctx.fillRect(x, oy + 12, 6, 12);
    ctx.fillRect(x + C.CAR_W - 6, oy + 12, 6, 12);

    ctx.restore();
  }

  drawDish(dish) {
    if (dish.collected) return;
    const ctx = this.ctx;
    const cx  = dish.x;
    const cy  = dish.y;
    const rx  = C.DISH_W / 2;        // horizontal radius
    const ry  = rx * 0.36;           // vertical (perspective)

    // ── Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx + 3, cy + 5, rx - 2, ry - 1, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Plate thickness edge (dark sage)
    ctx.fillStyle = '#5a7a68';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 3, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Plate surface (sage green, like the photo)
    ctx.fillStyle = '#8aae96';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Slight highlight gradient (lighter top-left arc)
    ctx.fillStyle = 'rgba(200,230,210,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.18, cy - ry * 0.3, rx * 0.55, ry * 0.45, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // ── Inner ring (the well of the plate)
    ctx.strokeStyle = '#6b9478';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.62, ry * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();

    // ── Beaded rim — small dots evenly around the plate edge (like the photo)
    const beadCount = 22;
    for (let i = 0; i < beadCount; i++) {
      const angle = (i / beadCount) * Math.PI * 2;
      const bx = cx + Math.cos(angle) * (rx * 0.84);
      const by = cy + Math.sin(angle) * (ry * 0.84);
      // bead shadow
      ctx.fillStyle = '#4e6e5a';
      ctx.fillRect(bx - 1, by, 3, 3);
      // bead highlight
      ctx.fillStyle = '#b5d4bc';
      ctx.fillRect(bx - 1, by - 1, 3, 3);
    }

    // ── Food in the well (small colourful pixel squares)
    ctx.fillStyle = '#e53935'; ctx.fillRect(cx - 7, cy - 3, 4, 4); // red
    ctx.fillStyle = '#43a047'; ctx.fillRect(cx + 3, cy - 4, 4, 4); // green
    ctx.fillStyle = '#ff8f00'; ctx.fillRect(cx - 2, cy + 1, 4, 3); // orange
    ctx.fillStyle = '#f5f5dc'; ctx.fillRect(cx - 5, cy + 1, 3, 3); // cream

    // ── Sparkle pixel (top-right)
    ctx.fillStyle = '#fffde7';
    ctx.fillRect(cx + rx - 7, cy - ry + 1, 3, 3);
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(cx + rx - 5, cy - ry - 1, 2, 2);
  }

  drawSidewalk(obs) {
    const ctx = this.ctx;
    const x   = obs.x - C.SIDE_W / 2;
    const y   = obs.y - C.SIDE_H / 2;

    // Kerb / sidewalk slab
    ctx.fillStyle = '#B0B0B0';
    ctx.fillRect(x, y, C.SIDE_W, C.SIDE_H);

    // Brick pattern
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const bx = x + col * (C.SIDE_W / 4) + (row % 2 === 0 ? 0 : C.SIDE_W / 8);
        const by = y + row * (C.SIDE_H / 3);
        ctx.strokeRect(bx, by, C.SIDE_W / 4, C.SIDE_H / 3);
      }
    }

    // Danger stripe
    ctx.fillStyle = '#FF1744';
    ctx.fillRect(x, y, C.SIDE_W, 4);
    ctx.fillRect(x, y + C.SIDE_H - 4, C.SIDE_W, 4);

    // Warning text
    ctx.fillStyle = '#FFD700';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MARCIAPIEDE!', obs.x, obs.y + 3);
  }

  drawExplosion(particles) {
    const ctx = this.ctx;
    for (const p of particles) {
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  drawOverlay(text, subtext) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);
    ctx.fillStyle = '#FF4444';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, C.WIDTH / 2, C.HEIGHT / 2 - 20);
    ctx.fillStyle = '#0f0';
    ctx.font = '12px monospace';
    ctx.fillText(subtext, C.WIDTH / 2, C.HEIGHT / 2 + 12);
  }

  drawPauseScreen() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);
    ctx.fillStyle = '#FFD700';
    ctx.font = '18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('IN PAUSA', C.WIDTH / 2, C.HEIGHT / 2 - 10);
    ctx.fillStyle = '#aaa';
    ctx.font = '9px monospace';
    ctx.fillText('premi P per continuare', C.WIDTH / 2, C.HEIGHT / 2 + 16);
  }
}

// ─── Game ─────────────────────────────────────────────────────────────────────
class Game {
  constructor(canvasId) {
    this.canvas    = document.getElementById(canvasId);
    this.renderer  = new Renderer(this.canvas);
    this.audio     = new AudioEngine();
    this._reset();
  }

  _reset() {
    this.lane        = 1;          // 0=left, 1=center, 2=right
    this.carY        = C.HEIGHT - C.CAR_H - 20;
    this.carTilt     = 0;          // -1 lean left, 0 straight, +1 lean right
    this.score       = 0;
    this.speed       = C.ROAD_SPEED_INIT;
    this.roadOffset  = 0;
    this.frame       = 0;
    this.paused      = false;
    this.gameOver    = false;
    this.dishes      = [];
    this.sidewalks   = [];
    this.particles   = [];
    this._nextDish   = C.SPAWN_INTERVAL_DISH;
    this._nextSide   = C.SPAWN_INTERVAL_SIDE;
    this._raf        = null;
    this._musicOn    = this.audio.enabled;
  }

  init() {
    this._reset();
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

  // ── Controls ──
  moveLeft()  { if (!this.paused && !this.gameOver && this.lane > 0) { this.lane--; this.carTilt = -1; } }
  moveRight() { if (!this.paused && !this.gameOver && this.lane < 2) { this.lane++; this.carTilt = +1; } }

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
    document.getElementById('btn-pause').textContent =
      this.paused ? '▶ RIPRENDI' : '⏸ PAUSA';
  }

  toggleMusic() {
    this._musicOn = this.audio.toggle();
    this._updateMusicBtn();
    if (!this._musicOn) this.audio.stopEngine();
    else if (!this.paused && !this.gameOver) this.audio.startEngine();
  }

  // ── Main loop ──
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

    // Spawn dishes
    if (this.frame >= this._nextDish) {
      this._spawnDish();
      this._nextDish = this.frame + C.SPAWN_INTERVAL_DISH + Math.floor(Math.random() * 40);
    }

    // Spawn sidewalks
    if (this.frame >= this._nextSide) {
      this._spawnSidewalk();
      this._nextSide = this.frame + C.SPAWN_INTERVAL_SIDE + Math.floor(Math.random() * 60);
    }

    // Move & collect dishes
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

    // Move sidewalks & check collision
    for (const s of this.sidewalks) {
      s.y += this.speed;
      if (!s.hit && this._hitCar(s.x, s.y, C.SIDE_W * 0.85, C.SIDE_H * 0.75)) {
        s.hit = true;
        this._triggerCrash(s.x, s.y);
        return;
      }
    }
    this.sidewalks = this.sidewalks.filter(s => s.y < C.HEIGHT + 50);

    // Tilt easing — exponential decay back to 0
    this.carTilt *= 0.82;
    if (Math.abs(this.carTilt) < 0.01) this.carTilt = 0;

    // Particles
    for (const p of this.particles) {
      p.x += p.vx; p.y += p.vy; p.life -= 0.02;
    }
    this.particles = this.particles.filter(p => p.life > 0);

    // HUD speed
    this._updateHUD();
    this.audio.setEngineSpeed(this.speed);

    if (this.frame === 30) this.audio.startEngine();
  }

  _draw() {
    this.renderer.drawRoad(this.roadOffset);
    for (const d of this.dishes)    this.renderer.drawDish(d);
    for (const s of this.sidewalks) this.renderer.drawSidewalk(s);
    this.renderer.drawCar(this.lane, this.carY, this.carTilt);
    if (this.particles.length) this.renderer.drawExplosion(this.particles);
  }

  // ── Spawning ──
  _spawnDish() {
    const lane = Math.floor(Math.random() * C.LANES);
    this.dishes.push({ x: laneX(lane), y: -C.DISH_H, collected: false });
  }

  _spawnSidewalk() {
    // Pick a random lane, ensuring it's not the same as the previous obstacle
    const lane = Math.floor(Math.random() * C.LANES);
    this.sidewalks.push({ x: laneX(lane), y: -C.SIDE_H, hit: false });
  }

  // ── Collision ──
  _hitCar(ox, oy, ow, oh) {
    const carCX = laneX(this.lane);
    const carCY = this.carY + C.CAR_H / 2;
    const hw = C.CAR_W * 0.45;
    const hh = C.CAR_H * 0.45;
    return Math.abs(ox - carCX) < (ow / 2 + hw) &&
           Math.abs(oy - carCY) < (oh / 2 + hh);
  }

  // ── Crash ──
  _triggerCrash(ox, oy) {
    this.gameOver = true;
    this.audio.stopEngine();
    this.audio.crashSound();
    this._createExplosion(laneX(this.lane), this.carY + C.CAR_H / 2);
    this._draw(); // uses this.carTilt which is still set
    this.renderer.drawExplosion(this.particles);
    this._setStatus('GAME OVER!');
    setTimeout(() => this._showOverlay(), 900);
  }

  _createExplosion(cx, cy) {
    const colors = ['#FF4444', '#FF8800', '#FFD700', '#FFFFFF', '#FF6600'];
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 2 + Math.random() * 5;
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        size:  4 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        life:  1,
      });
    }
  }

  // ── HUD ──
  _updateHUD() {
    const s = document.getElementById('score');
    const sp = document.getElementById('speed');
    if (s)  s.textContent  = this.score;
    if (sp) sp.textContent = this.speed.toFixed(1);
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
    if (ov) ov.classList.remove('hidden');
    if (t)  t.textContent  = '💥 GOMME ESPLOSE! 💥';
    if (sc) sc.textContent = 'PUNTEGGIO: ' + this.score;
  }

  _hideOverlay() {
    const ov = document.getElementById('overlay');
    if (ov) ov.classList.add('hidden');
  }
}

// Export for unit tests (Node/Jest env)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Game, AudioEngine, laneX, C };
}
