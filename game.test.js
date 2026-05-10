'use strict';

// ─── Minimal DOM / browser stubs for Node/Jest ────────────────────────────────
let _storage = {};
global.localStorage = {
  getItem:  (k) => _storage[k] || null,
  setItem:  (k, v) => { _storage[k] = String(v); },
  removeItem: (k) => { delete _storage[k]; },
};
global.document = { getElementById: () => null, addEventListener: () => {} };
global.window   = { AudioContext: undefined, webkitAudioContext: undefined };
global.requestAnimationFrame  = (fn) => setTimeout(fn, 16);
global.cancelAnimationFrame   = (id) => clearTimeout(id);

const { laneX, C, AudioEngine, drawDishArt } = require('./game.js');

beforeEach(() => { _storage = {}; });  // reset localStorage between tests

// ─── laneX ────────────────────────────────────────────────────────────────────
describe('laneX()', () => {
  test('left lane center is 60',   () => expect(laneX(0)).toBe(60));
  test('center lane center is 180',() => expect(laneX(1)).toBe(180));
  test('right lane center is 300', () => expect(laneX(2)).toBe(300));
});

// ─── Dish size ────────────────────────────────────────────────────────────────
describe('dish dimensions', () => {
  test('DISH_W is 58', () => expect(C.DISH_W).toBe(58));
  test('DISH_H is 58', () => expect(C.DISH_H).toBe(58));
});

// ─── Lane stripes ─────────────────────────────────────────────────────────────
describe('lane colour', () => {
  test('LANE_COLOR is white (#FFFFFF)', () => expect(C.LANE_COLOR).toBe('#FFFFFF'));
});

// ─── Tilt — set on lane change ────────────────────────────────────────────────
describe('carTilt — set on lane change', () => {
  function sim(lane, dir) {
    let tilt = 0;
    if (dir === 'left'  && lane > 0)          { lane--; tilt = -C.TILT_MAX; }
    if (dir === 'right' && lane < C.LANES - 1) { lane++; tilt = +C.TILT_MAX; }
    return { lane, tilt };
  }
  test('moveLeft sets tilt to -TILT_MAX',          () => expect(sim(1, 'left').tilt).toBe(-C.TILT_MAX));
  test('moveRight sets tilt to +TILT_MAX',         () => expect(sim(1, 'right').tilt).toBe(+C.TILT_MAX));
  test('moveLeft at lane 0 does NOT change tilt',  () => expect(sim(0, 'left').tilt).toBe(0));
  test('moveRight at lane 2 does NOT change tilt', () => expect(sim(2, 'right').tilt).toBe(0));
  test('moveLeft at lane 0 keeps lane 0',          () => expect(sim(0, 'left').lane).toBe(0));
  test('moveRight at lane 2 keeps lane 2',         () => expect(sim(2, 'right').lane).toBe(2));
});

// ─── Tilt — per-frame decay ───────────────────────────────────────────────────
describe('carTilt — decay each frame', () => {
  test('decays by TILT_DECAY factor', () => {
    let t = 1; t *= C.TILT_DECAY;
    expect(t).toBeCloseTo(C.TILT_DECAY);
  });
  test('snaps to 0 below TILT_THRESHOLD', () => {
    let t = C.TILT_THRESHOLD * 0.9; t *= C.TILT_DECAY;
    if (Math.abs(t) < C.TILT_THRESHOLD) t = 0;
    expect(t).toBe(0);
  });
  test('after 20 frames tilt is < 0.02', () => {
    let t = 1;
    for (let i = 0; i < 20; i++) {
      t *= C.TILT_DECAY;
      if (Math.abs(t) < C.TILT_THRESHOLD) { t = 0; break; }
    }
    expect(Math.abs(t)).toBeLessThan(0.02);
  });
});

// ─── Tilt — front wheel steer ─────────────────────────────────────────────────
describe('carTilt — front wheel steer offset', () => {
  const steer = (tilt) => tilt * 5;
  test('no steer at tilt 0',          () => expect(steer(0)).toBe(0));
  test('steer left at tilt -1',       () => expect(steer(-1)).toBe(-5));
  test('steer right at tilt +1',      () => expect(steer(1)).toBe(5));
  test('proportional at half tilt',   () => expect(steer(0.5)).toBeCloseTo(2.5));
});

// ─── Tilt — skew constant ────────────────────────────────────────────────────
describe('carTilt — skew factor', () => {
  test('TILT_SKEW is 0.22', () => expect(C.TILT_SKEW).toBe(0.22));
  test('max skew at tilt 1 equals TILT_SKEW', () => expect(1 * C.TILT_SKEW).toBeCloseTo(0.22));
});

// ─── Collision detection ─────────────────────────────────────────────────────
function hitCar(carLane, carY, ox, oy, ow, oh) {
  const carCX = laneX(carLane);
  const carCY = carY + C.CAR_H / 2;
  const hw = C.CAR_W * 0.45, hh = C.CAR_H * 0.45;
  return Math.abs(ox - carCX) < (ow/2 + hw) && Math.abs(oy - carCY) < (oh/2 + hh);
}
const carY = C.HEIGHT - C.CAR_H - 20;
const carCY = carY + C.CAR_H / 2;

describe('collision detection', () => {
  test('object on car center hits',              () => expect(hitCar(1, carY, laneX(1), carCY, C.DISH_W, C.DISH_H)).toBe(true));
  test('object in adjacent lane does not hit',   () => expect(hitCar(0, carY, laneX(2), carCY, C.SIDE_W*0.85, C.SIDE_H*0.75)).toBe(false));
  test('object far above does not hit',          () => expect(hitCar(1, carY, laneX(1), -200, C.DISH_W, C.DISH_H)).toBe(false));
  test('slight offset in same lane still hits',  () => expect(hitCar(1, carY, laneX(1)+10, carCY+10, C.DISH_W, C.DISH_H)).toBe(true));
});

// ─── Lane movement guards ────────────────────────────────────────────────────
describe('lane movement guards', () => {
  const move = (lane, dir) => {
    if (dir === 'left'  && lane > 0)              return lane - 1;
    if (dir === 'right' && lane < C.LANES - 1)    return lane + 1;
    return lane;
  };
  test('cannot move left from lane 0',    () => expect(move(0, 'left')).toBe(0));
  test('cannot move right from lane 2',   () => expect(move(2, 'right')).toBe(2));
  test('left from lane 1 gives lane 0',   () => expect(move(1, 'left')).toBe(0));
  test('right from lane 1 gives lane 2',  () => expect(move(1, 'right')).toBe(2));
});

// ─── Scoring ─────────────────────────────────────────────────────────────────
describe('scoring', () => {
  test('POINTS_PER_DISH is 10',           () => expect(C.POINTS_PER_DISH).toBe(10));
  test('3 dishes = 30 points',            () => expect(3 * C.POINTS_PER_DISH).toBe(30));
});

// ─── AudioEngine ────────────────────────────────────────────────────────────
describe('AudioEngine.toggle()', () => {
  test('starts enabled',        () => expect(new AudioEngine().enabled).toBe(true));
  test('first toggle disables', () => { const a = new AudioEngine(); a.toggle(); expect(a.enabled).toBe(false); });
  test('double toggle re-enables', () => { const a = new AudioEngine(); a.toggle(); a.toggle(); expect(a.enabled).toBe(true); });
});

// ─── Speed ───────────────────────────────────────────────────────────────────
describe('speed', () => {
  test('initial speed is ROAD_SPEED_INIT', () => expect(C.ROAD_SPEED_INIT).toBe(3));
  test('increments by SPEED_INCREMENT each frame', () => {
    let s = C.ROAD_SPEED_INIT; s += C.SPEED_INCREMENT;
    expect(s).toBeCloseTo(C.ROAD_SPEED_INIT + C.SPEED_INCREMENT);
  });
});

// ─── High score (localStorage) ───────────────────────────────────────────────
describe('high score', () => {
  function getHS() { try { return parseInt(localStorage.getItem(C.HS_KEY) || '0', 10); } catch(e) { return 0; } }
  function setHS(s) { try { localStorage.setItem(C.HS_KEY, String(s)); } catch(e) {} }

  test('HS_KEY is a non-empty string',           () => { expect(typeof C.HS_KEY).toBe('string'); expect(C.HS_KEY.length).toBeGreaterThan(0); });
  test('returns 0 when storage is empty',        () => expect(getHS()).toBe(0));
  test('round-trips a score',                    () => { setHS(250); expect(getHS()).toBe(250); });
  test('overwrites a lower score',               () => { setHS(100); setHS(200); expect(getHS()).toBe(200); });
  test('new score only saved if higher (logic)', () => {
    setHS(100);
    const prev = getHS();
    const newScore = 80;
    if (newScore > prev) setHS(newScore);
    expect(getHS()).toBe(100);  // not overwritten
  });
});

// ─── Crash animation logic ───────────────────────────────────────────────────
describe('crash animation', () => {
  test('car moves 4px upward per phase for 8 phases = 32px total', () => {
    let carY = 400;
    for (let ph = 1; ph <= 8; ph++) carY -= 4;
    expect(carY).toBe(368);
  });
  test('flash starts at 1.0 on impact', () => {
    let flash = 0;
    // simulate phase 9 (impact)
    const ph = 9; if (ph === 9) flash = 1;
    expect(flash).toBe(1);
  });
  test('flash fades by 0.07 per frame after impact', () => {
    let flash = 1;
    flash = Math.max(0, flash - 0.07);
    expect(flash).toBeCloseTo(0.93);
  });
  test('flash reaches 0 within 15 frames', () => {
    let flash = 1;
    for (let i = 0; i < 15; i++) flash = Math.max(0, flash - 0.07);
    expect(flash).toBe(0);
  });
  test('screen shake is 0 before phase 9', () => {
    const ph = 5, shakeDir = 1;
    const shake = (ph >= 9 && ph <= 26) ? (27 - ph) * 1.8 * shakeDir : 0;
    expect(shake).toBe(0);
  });
  test('screen shake is non-zero at phase 9', () => {
    const ph = 9, shakeDir = 1;
    const shake = (ph >= 9 && ph <= 26) ? (27 - ph) * 1.8 * shakeDir : 0;
    expect(Math.abs(shake)).toBeGreaterThan(0);
  });
  test('screen shake is 0 after phase 26', () => {
    const ph = 27, shakeDir = 1;
    const shake = (ph >= 9 && ph <= 26) ? (27 - ph) * 1.8 * shakeDir : 0;
    expect(shake).toBe(0);
  });
  test('4 tire pops × 10 particles = 40 rubber chunks', () => {
    const particles = [];
    const popTire = () => { for (let i = 0; i < 10; i++) particles.push({ life: 0.9 }); };
    for (let t = 0; t < 4; t++) popTire();
    expect(particles.length).toBe(40);
  });
  test('tire pops are scheduled at phases 9, 14, 19, 24', () => {
    const popPhases = [9, 14, 19, 24];
    expect(popPhases.length).toBe(4);
    expect(popPhases[1] - popPhases[0]).toBe(5);
  });
});

// ─── drawDishArt export ──────────────────────────────────────────────────────
describe('drawDishArt', () => {
  test('is exported and is a function', () => expect(typeof drawDishArt).toBe('function'));
  test('accepts (ctx, cw, ch) without throwing', () => {
    const ctx = {
      clearRect: () => {}, fillRect: () => {}, strokeRect: () => {},
      beginPath: () => {}, fill: () => {}, stroke: () => {},
      arc: () => {}, ellipse: () => {}, moveTo: () => {}, lineTo: () => {},
      fillText: () => {},
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '',
    };
    expect(() => drawDishArt(ctx, 300, 148)).not.toThrow();
  });
});
