'use strict';

// Minimal DOM stubs for Node/Jest environment
global.document = {
  getElementById: () => null,
  addEventListener: () => {},
};
global.window = {
  AudioContext: undefined,
  webkitAudioContext: undefined,
  requestAnimationFrame: (fn) => setTimeout(fn, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
};
global.requestAnimationFrame  = (fn) => setTimeout(fn, 16);
global.cancelAnimationFrame   = (id) => clearTimeout(id);
global.module = module;

const { laneX, C, AudioEngine } = require('./game.js');

// ─── laneX ────────────────────────────────────────────────────────────────────
describe('laneX()', () => {
  test('left lane center is 60', ()   => expect(laneX(0)).toBe(60));
  test('center lane center is 180', () => expect(laneX(1)).toBe(180));
  test('right lane center is 300', ()  => expect(laneX(2)).toBe(300));
});

// ─── Dish size ────────────────────────────────────────────────────────────────
describe('dish dimensions', () => {
  test('DISH_W is 58 (enlarged ceramic plate)', () => expect(C.DISH_W).toBe(58));
  test('DISH_H matches DISH_W', () => expect(C.DISH_H).toBe(58));
});

// ─── Tilt animation ───────────────────────────────────────────────────────────
describe('carTilt — set on lane change', () => {
  test('moveLeft sets tilt to -TILT_MAX', () => {
    // simulate moveLeft guard + assignment
    let lane = 1, tilt = 0;
    if (lane > 0) { lane--; tilt = -C.TILT_MAX; }
    expect(tilt).toBe(-C.TILT_MAX);
  });
  test('moveRight sets tilt to +TILT_MAX', () => {
    let lane = 1, tilt = 0;
    if (lane < 2) { lane++; tilt = C.TILT_MAX; }
    expect(tilt).toBe(C.TILT_MAX);
  });
  test('moveLeft at lane 0 does NOT change tilt', () => {
    let lane = 0, tilt = 0;
    if (lane > 0) { lane--; tilt = -C.TILT_MAX; }
    expect(tilt).toBe(0);
  });
  test('moveRight at lane 2 does NOT change tilt', () => {
    let lane = 2, tilt = 0;
    if (lane < 2) { lane++; tilt = C.TILT_MAX; }
    expect(tilt).toBe(0);
  });
});

describe('carTilt — decay each frame', () => {
  test('decays by TILT_DECAY factor', () => {
    let tilt = 1;
    tilt *= C.TILT_DECAY;
    expect(tilt).toBeCloseTo(C.TILT_DECAY);
  });
  test('snaps to 0 when below TILT_THRESHOLD', () => {
    let tilt = C.TILT_THRESHOLD * 0.9;
    tilt *= C.TILT_DECAY;
    if (Math.abs(tilt) < C.TILT_THRESHOLD) tilt = 0;
    expect(tilt).toBe(0);
  });
  test('after 20 frames tilt is nearly 0', () => {
    let tilt = 1;
    for (let i = 0; i < 20; i++) {
      tilt *= C.TILT_DECAY;
      if (Math.abs(tilt) < C.TILT_THRESHOLD) { tilt = 0; break; }
    }
    expect(Math.abs(tilt)).toBeLessThan(0.02);
  });
});

describe('carTilt — front wheel steer offset', () => {
  function steerOffset(tilt) { return tilt * 5; }
  test('no steer when tilt is 0', () => expect(steerOffset(0)).toBe(0));
  test('steer left when tilt is -1', () => expect(steerOffset(-1)).toBe(-5));
  test('steer right when tilt is +1', () => expect(steerOffset(1)).toBe(5));
  test('steer proportional at half tilt', () => expect(steerOffset(0.5)).toBeCloseTo(2.5));
});

describe('carTilt — skew factor', () => {
  test('TILT_SKEW is 0.22', () => expect(C.TILT_SKEW).toBe(0.22));
  test('max visible skew at tilt 1 is TILT_SKEW', () => {
    const skewX = 1 * C.TILT_SKEW;
    expect(skewX).toBeCloseTo(0.22);
  });
});

// ─── Collision helper ─────────────────────────────────────────────────────────
// Re-implement _hitCar as a pure function for isolated testing
function hitCar(carLane, carY, ox, oy, ow, oh) {
  const carCX = laneX(carLane);
  const carCY = carY + C.CAR_H / 2;
  const hw = C.CAR_W * 0.45;
  const hh = C.CAR_H * 0.45;
  return Math.abs(ox - carCX) < (ow / 2 + hw) &&
         Math.abs(oy - carCY) < (oh / 2 + hh);
}

describe('collision detection', () => {
  const carY = C.HEIGHT - C.CAR_H - 20;
  const carCY = carY + C.CAR_H / 2;

  test('object directly on car center hits', () => {
    expect(hitCar(1, carY, laneX(1), carCY, C.DISH_W, C.DISH_H)).toBe(true);
  });

  test('object in adjacent lane does not hit', () => {
    // Lane 0 vs object in lane 2
    expect(hitCar(0, carY, laneX(2), carCY, C.SIDE_W * 0.85, C.SIDE_H * 0.75)).toBe(false);
  });

  test('object far above does not hit', () => {
    expect(hitCar(1, carY, laneX(1), -200, C.DISH_W, C.DISH_H)).toBe(false);
  });

  test('object slightly off-center in same lane still hits', () => {
    expect(hitCar(1, carY, laneX(1) + 10, carCY + 10, C.DISH_W, C.DISH_H)).toBe(true);
  });
});

// ─── Lane bounds ──────────────────────────────────────────────────────────────
describe('lane movement guards', () => {
  function simulateMove(startLane, direction) {
    let lane = startLane;
    if (direction === 'left'  && lane > 0) lane--;
    if (direction === 'right' && lane < C.LANES - 1) lane++;
    return lane;
  }

  test('cannot move left from lane 0', () => expect(simulateMove(0, 'left')).toBe(0));
  test('cannot move right from lane 2', () => expect(simulateMove(2, 'right')).toBe(2));
  test('move left from lane 1 gives lane 0', () => expect(simulateMove(1, 'left')).toBe(0));
  test('move right from lane 1 gives lane 2', () => expect(simulateMove(1, 'right')).toBe(2));
});

// ─── Scoring ──────────────────────────────────────────────────────────────────
describe('scoring', () => {
  test('each dish is worth POINTS_PER_DISH', () => expect(C.POINTS_PER_DISH).toBe(10));

  test('collecting 3 dishes gives 30 points', () => {
    let score = 0;
    for (let i = 0; i < 3; i++) score += C.POINTS_PER_DISH;
    expect(score).toBe(30);
  });
});

// ─── AudioEngine toggle ───────────────────────────────────────────────────────
describe('AudioEngine.toggle()', () => {
  test('starts enabled', () => {
    const ae = new AudioEngine();
    expect(ae.enabled).toBe(true);
  });

  test('first toggle disables', () => {
    const ae = new AudioEngine();
    ae.toggle();
    expect(ae.enabled).toBe(false);
  });

  test('double toggle re-enables', () => {
    const ae = new AudioEngine();
    ae.toggle();
    ae.toggle();
    expect(ae.enabled).toBe(true);
  });
});

// ─── Speed increment ──────────────────────────────────────────────────────────
describe('speed', () => {
  test('speed increments by SPEED_INCREMENT each frame', () => {
    let speed = C.ROAD_SPEED_INIT;
    speed += C.SPEED_INCREMENT;
    expect(speed).toBeCloseTo(C.ROAD_SPEED_INIT + C.SPEED_INCREMENT);
  });

  test('initial speed is ROAD_SPEED_INIT', () => {
    expect(C.ROAD_SPEED_INIT).toBe(3);
  });
});
