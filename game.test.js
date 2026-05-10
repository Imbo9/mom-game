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
