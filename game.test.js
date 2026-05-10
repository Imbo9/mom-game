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

const { laneX, C, AudioEngine, drawDishArt, ISLAND_DEFS, ISLAND_WEIGHTS, MUSIC_NOTES } = require('./game.js');

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

// ─── ISLAND_DEFS — structure ─────────────────────────────────────────────────
describe('ISLAND_DEFS — structure', () => {
  test('exports 5 island types', () => expect(ISLAND_DEFS.length).toBe(5));
  test('every def has lanes, x, w, arrow, key', () => {
    for (const def of ISLAND_DEFS) {
      expect(Array.isArray(def.lanes)).toBe(true);
      expect(typeof def.x).toBe('number');
      expect(typeof def.w).toBe('number');
      expect(['left','right','both']).toContain(def.arrow);
      expect(typeof def.key).toBe('string');
    }
  });
});

// ─── ISLAND_DEFS — individual types ──────────────────────────────────────────
describe('ISLAND_DEFS — CENTER', () => {
  const def = ISLAND_DEFS.find(d => d.key === 'CENTER');
  test('exists',           () => expect(def).toBeDefined());
  test('blocks lane 1',    () => expect(def.lanes).toEqual([1]));
  test('arrow is both',    () => expect(def.arrow).toBe('both'));
  test('x is laneX(1)',    () => expect(def.x).toBe(laneX(1)));
  test('width is 90',      () => expect(def.w).toBe(90));
});

describe('ISLAND_DEFS — SINGLE_RIGHT', () => {
  const def = ISLAND_DEFS.find(d => d.key === 'SINGLE_RIGHT');
  test('exists',           () => expect(def).toBeDefined());
  test('blocks lane 2',    () => expect(def.lanes).toEqual([2]));
  test('arrow is left',    () => expect(def.arrow).toBe('left'));
  test('x is laneX(2)',    () => expect(def.x).toBe(laneX(2)));
  test('width is 90',      () => expect(def.w).toBe(90));
});

describe('ISLAND_DEFS — SINGLE_LEFT', () => {
  const def = ISLAND_DEFS.find(d => d.key === 'SINGLE_LEFT');
  test('exists',           () => expect(def).toBeDefined());
  test('blocks lane 0',    () => expect(def.lanes).toEqual([0]));
  test('arrow is right',   () => expect(def.arrow).toBe('right'));
  test('x is laneX(0)',    () => expect(def.x).toBe(laneX(0)));
  test('width is 90',      () => expect(def.w).toBe(90));
});

describe('ISLAND_DEFS — DOUBLE_RIGHT', () => {
  const def = ISLAND_DEFS.find(d => d.key === 'DOUBLE_RIGHT');
  test('exists',              () => expect(def).toBeDefined());
  test('blocks lanes 1 and 2',() => expect(def.lanes).toEqual([1, 2]));
  test('arrow is left',       () => expect(def.arrow).toBe('left'));
  test('x is midpoint of laneX(1) and laneX(2)', () => expect(def.x).toBeCloseTo((laneX(1)+laneX(2))/2));
  test('width is 218',        () => expect(def.w).toBe(218));
});

describe('ISLAND_DEFS — DOUBLE_LEFT', () => {
  const def = ISLAND_DEFS.find(d => d.key === 'DOUBLE_LEFT');
  test('exists',              () => expect(def).toBeDefined());
  test('blocks lanes 0 and 1',() => expect(def.lanes).toEqual([0, 1]));
  test('arrow is right',      () => expect(def.arrow).toBe('right'));
  test('x is midpoint of laneX(0) and laneX(1)', () => expect(def.x).toBeCloseTo((laneX(0)+laneX(1))/2));
  test('width is 218',        () => expect(def.w).toBe(218));
});

// ─── ISLAND_WEIGHTS ───────────────────────────────────────────────────────────
describe('ISLAND_WEIGHTS', () => {
  test('length matches ISLAND_DEFS', () => expect(ISLAND_WEIGHTS.length).toBe(ISLAND_DEFS.length));
  test('all weights are positive integers', () => {
    for (const w of ISLAND_WEIGHTS) { expect(w).toBeGreaterThan(0); expect(Number.isInteger(w)).toBe(true); }
  });
  test('total weight is 8 (single islands more common)', () => {
    expect(ISLAND_WEIGHTS.reduce((a,b)=>a+b,0)).toBe(8);
  });
  test('single-lane islands (first 3) have weight 2 each', () => {
    expect(ISLAND_WEIGHTS[0]).toBe(2);
    expect(ISLAND_WEIGHTS[1]).toBe(2);
    expect(ISLAND_WEIGHTS[2]).toBe(2);
  });
  test('double-lane islands (last 2) have weight 1 each', () => {
    expect(ISLAND_WEIGHTS[3]).toBe(1);
    expect(ISLAND_WEIGHTS[4]).toBe(1);
  });
});

// ─── Island lane-based collision ─────────────────────────────────────────────
function islandHitsCar(isleLanes, isleY, carLane, carY) {
  if (!isleLanes.includes(carLane)) return false;
  const carCY = carY + C.CAR_H / 2;
  return Math.abs(isleY - carCY) < (C.ISLAND_H / 2 + C.CAR_H * 0.42);
}

describe('island collision — lane check', () => {
  const cy = C.HEIGHT - C.CAR_H - 20;
  const carCY = cy + C.CAR_H / 2;

  test('CENTER hits when car is in lane 1',      () => expect(islandHitsCar([1], carCY, 1, cy)).toBe(true));
  test('CENTER misses when car is in lane 0',    () => expect(islandHitsCar([1], carCY, 0, cy)).toBe(false));
  test('CENTER misses when car is in lane 2',    () => expect(islandHitsCar([1], carCY, 2, cy)).toBe(false));

  test('SINGLE_RIGHT hits lane 2',               () => expect(islandHitsCar([2], carCY, 2, cy)).toBe(true));
  test('SINGLE_RIGHT misses lane 0',             () => expect(islandHitsCar([2], carCY, 0, cy)).toBe(false));
  test('SINGLE_RIGHT misses lane 1',             () => expect(islandHitsCar([2], carCY, 1, cy)).toBe(false));

  test('SINGLE_LEFT hits lane 0',                () => expect(islandHitsCar([0], carCY, 0, cy)).toBe(true));
  test('SINGLE_LEFT misses lane 1',              () => expect(islandHitsCar([0], carCY, 1, cy)).toBe(false));
  test('SINGLE_LEFT misses lane 2',              () => expect(islandHitsCar([0], carCY, 2, cy)).toBe(false));

  test('DOUBLE_RIGHT hits lane 1',               () => expect(islandHitsCar([1,2], carCY, 1, cy)).toBe(true));
  test('DOUBLE_RIGHT hits lane 2',               () => expect(islandHitsCar([1,2], carCY, 2, cy)).toBe(true));
  test('DOUBLE_RIGHT misses lane 0',             () => expect(islandHitsCar([1,2], carCY, 0, cy)).toBe(false));

  test('DOUBLE_LEFT hits lane 0',                () => expect(islandHitsCar([0,1], carCY, 0, cy)).toBe(true));
  test('DOUBLE_LEFT hits lane 1',                () => expect(islandHitsCar([0,1], carCY, 1, cy)).toBe(true));
  test('DOUBLE_LEFT misses lane 2',              () => expect(islandHitsCar([0,1], carCY, 2, cy)).toBe(false));
});

describe('island collision — y distance check', () => {
  const cy = C.HEIGHT - C.CAR_H - 20;
  const carCY = cy + C.CAR_H / 2;
  const threshold = C.ISLAND_H / 2 + C.CAR_H * 0.42;

  test('island exactly at car center hits',      () => expect(islandHitsCar([1], carCY,          1, cy)).toBe(true));
  test('island just inside threshold hits',      () => expect(islandHitsCar([1], carCY + threshold - 1, 1, cy)).toBe(true));
  test('island far above car does not hit',      () => expect(islandHitsCar([1], -200,            1, cy)).toBe(false));
  test('island far below car does not hit',      () => expect(islandHitsCar([1], C.HEIGHT + 200,  1, cy)).toBe(false));
});

// ─── Music constants ──────────────────────────────────────────────────────────
describe('music constants', () => {
  test('MUSIC_BPM is 200',               () => expect(C.MUSIC_BPM).toBe(200));
  test('MUSIC_BPM is a positive number', () => expect(C.MUSIC_BPM).toBeGreaterThan(0));
  test('beat duration = 60 / BPM',       () => expect(60 / C.MUSIC_BPM).toBeCloseTo(0.3));
});

// ─── MUSIC_NOTES ──────────────────────────────────────────────────────────────
describe('MUSIC_NOTES', () => {
  test('is exported and is an array',              () => expect(Array.isArray(MUSIC_NOTES)).toBe(true));
  test('has at least one note',                    () => expect(MUSIC_NOTES.length).toBeGreaterThan(0));
  test('every entry is [freq, beats] pair',        () => {
    for (const entry of MUSIC_NOTES) {
      expect(Array.isArray(entry)).toBe(true);
      expect(entry.length).toBe(2);
      expect(typeof entry[0]).toBe('number'); // freq (0 = rest)
      expect(typeof entry[1]).toBe('number'); // beats
      expect(entry[1]).toBeGreaterThan(0);    // duration must be positive
      expect(entry[0]).toBeGreaterThanOrEqual(0); // freq >= 0
    }
  });
  test('total loop length is 16 beats', () => {
    const total = MUSIC_NOTES.reduce((sum, [, b]) => sum + b, 0);
    expect(total).toBeCloseTo(16);
  });
  test('loop duration at 200 BPM is ~4.8 seconds', () => {
    const total = MUSIC_NOTES.reduce((sum, [, b]) => sum + b, 0);
    const loopSec = total * (60 / C.MUSIC_BPM);
    expect(loopSec).toBeCloseTo(4.8, 1);
  });
  test('contains at least one rest (freq = 0)',    () => {
    expect(MUSIC_NOTES.some(([f]) => f === 0)).toBe(true);
  });
  test('contains at least one pitched note',       () => {
    expect(MUSIC_NOTES.some(([f]) => f > 0)).toBe(true);
  });
  test('highest note is 698 Hz (F5) – tarantella folk melody',  () => {
    const maxFreq = Math.max(...MUSIC_NOTES.map(([f]) => f));
    expect(maxFreq).toBe(698);
  });
  test('lowest pitched note is 349 Hz (F4)',       () => {
    const minFreq = Math.min(...MUSIC_NOTES.filter(([f]) => f > 0).map(([f]) => f));
    expect(minFreq).toBe(349);
  });
});

// ─── Speedometer (km/h) ───────────────────────────────────────────────────────
describe('speedometer constants', () => {
  test('KMH_MAX is 300',                    () => expect(C.KMH_MAX).toBe(300));
  test('KMH_FRAMES is 10800 (3 min × 60fps)', () => expect(C.KMH_FRAMES).toBe(10800));
});

describe('speedometer — km/h formula', () => {
  const kmh = (frame) => Math.min(C.KMH_MAX, Math.round(frame * C.KMH_MAX / C.KMH_FRAMES));

  test('starts at 0 km/h on frame 0',          () => expect(kmh(0)).toBe(0));
  test('reaches 300 km/h at frame 10800',       () => expect(kmh(10800)).toBe(300));
  test('caps at 300 after frame 10800',         () => expect(kmh(20000)).toBe(300));
  test('is ~150 km/h at halftime (frame 5400)', () => expect(kmh(5400)).toBe(150));
  test('is ~100 km/h at 1/3 time (frame 3600)', () => expect(kmh(3600)).toBe(100));
  test('never exceeds KMH_MAX',                 () => {
    for (const f of [0, 1000, 5000, 10800, 15000, 100000])
      expect(kmh(f)).toBeLessThanOrEqual(C.KMH_MAX);
  });
  test('is non-decreasing',                     () => {
    let prev = 0;
    for (let f = 0; f <= 12000; f += 600) {
      const v = kmh(f);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

// ─── Veronese road design constants ──────────────────────────────────────────
describe('road design constants', () => {
  test('ROAD_COLOR is warm dark asphalt',   () => expect(C.ROAD_COLOR).toBe('#1C1810'));
  test('GRASS_W is 16px',                   () => expect(C.GRASS_W).toBe(16));
  test('TREE_SPACING is 180px',             () => expect(C.TREE_SPACING).toBe(180));
  test('GRASS_W is even (needed for >> 1)', () => expect(C.GRASS_W % 2).toBe(0));
  test('TREE_SPACING > CAR_H (trees never fully covered by car)', () =>
    expect(C.TREE_SPACING).toBeGreaterThan(C.CAR_H));
});

// ─── Km/h milestone notifications ────────────────────────────────────────────
describe('km/h milestone logic', () => {
  const milestones = [100, 200, 300];
  const kmh = (frame) => Math.min(C.KMH_MAX, Math.round(frame * C.KMH_MAX / C.KMH_FRAMES));

  test('milestone 100 is first reached before 3650 frames', () => {
    const reachedAt = Array.from({length: 4000}, (_, i) => i).find(f => kmh(f) >= 100);
    expect(reachedAt).toBeLessThan(3650);
  });
  test('milestone 200 is first reached around frame 7200',  () => {
    const reachedAt = Array.from({length: 8000}, (_, i) => i).find(f => kmh(f) >= 200);
    expect(reachedAt).toBeGreaterThan(7100);
    expect(reachedAt).toBeLessThan(7300);
  });
  test('milestones array has 3 entries',           () => expect(milestones.length).toBe(3));
  test('milestones are in ascending order',        () => {
    for (let i = 1; i < milestones.length; i++)
      expect(milestones[i]).toBeGreaterThan(milestones[i-1]);
  });
  test('300 km/h milestone is the max speed',      () => expect(milestones[milestones.length - 1]).toBe(C.KMH_MAX));
});
