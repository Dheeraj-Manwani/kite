const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spring, stepSpring } = require('../src/renderer/kite/physics/spring.ts');
const { createRope, stepRope } = require('../src/renderer/kite/physics/rope.ts');
const { createShake, detectShake } = require('../src/renderer/kite/behaviors/shake.ts');
const { createBehavior, updateBehavior } = require('../src/renderer/kite/behaviors/index.ts');

for (const hz of [30, 60, 144]) {
  test(`spring converges and overshoots at ${hz} Hz`, () => {
    let state = spring(0), maximum = 0;
    for (let i = 0; i < hz * 4; i++) {
      const input = { ...state };
      const next = stepSpring(state, 100, 380, 24, 1 / hz);
      assert.deepEqual(state, input, 'input must not be mutated');
      state = next;
      maximum = Math.max(maximum, state.value);
    }
    assert.ok(maximum > 101, 'underdamped spring should overshoot');
    assert.ok(Math.abs(state.value - 100) < 0.001);
    assert.ok(Math.abs(state.velocity) < 0.001);
  });
}
test('rope keeps pin and segment lengths under moving anchors and variable dt', () => {
  let rope = createRope({ x: 0, y: 0 }, 12, 5.5);
  const original = structuredClone(rope);
  const options = { segmentLength: 5.5, iterations: 5, gravity: 95, wind: 40, wagAmplitude: 2, wagFrequency: 2, phaseDelay: 0.65, drag: 5 };
  let time = 0;
  for (let i = 0; i < 600; i++) {
    const dt = i % 2 ? 1 / 144 : 1 / 30;
    time += dt;
    const pin = { x: Math.sin(time * 2) * 150, y: Math.cos(time) * 30 };
    const input = structuredClone(rope);
    const next = stepRope(rope, pin, time, dt, options);
    assert.deepEqual(rope, input, 'rope is pure');
    rope = next;
    assert.deepEqual(rope.points[0].position, pin);
    assert.deepEqual(rope.points[0].previous, pin);
    for (let j = 1; j < rope.points.length; j++) {
      const a = rope.points[j - 1].position, b = rope.points[j].position;
      assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - 5.5) < 0.01);
    }
  }
  assert.deepEqual(original, createRope({ x: 0, y: 0 }, 12, 5.5));
});
test('shake fires after four meaningful reversals inside 600ms, then cools down', () => {
  let state = createShake(), fires = 0;
  [400, -400, 400, -400, 400, -400, 400].forEach((vx, i) => {
    const result = detectShake(state, vx, i * 0.08);
    state = result.state; fires += Number(result.fired);
  });
  assert.equal(fires, 1);
});
test('smooth travel, low-speed jitter, and widely separated turns do not shake', () => {
  for (const sequence of [
    Array.from({ length: 50 }, () => 500),
    Array.from({ length: 50 }, (_, i) => i % 2 ? 40 : -40),
  ]) {
    let state = createShake();
    sequence.forEach((vx, i) => {
      const result = detectShake(state, vx, i * 0.02);
      state = result.state; assert.equal(result.fired, false);
    });
  }
  let state = createShake();
  for (let i = 0; i < 20; i++) {
    const result = detectShake(state, i % 2 ? 400 : -400, i * 0.7);
    state = result.state; assert.equal(result.fired, false);
  }
});
test('idle thresholds lead to bored/dozing and movement causes anticipation then hop', () => {
  let state = createBehavior(0, 1);
  state = updateBehavior(state, 8.1, 0, 1).state;
  assert.equal(state.name, 'bored');
  state = updateBehavior(state, 30.1, 0, 1).state;
  assert.equal(state.name, 'dozing');
  const wake = updateBehavior(state, 30.2, 300, 1);
  assert.equal(wake.state.name, 'wake');
  assert.ok(wake.motion.stretch < 1);
  const hop = updateBehavior(wake.state, 30.4, 0, 1);
  assert.ok(hop.motion.stretch > 1);
  assert.ok(hop.motion.driftY < 0);
});
test('reduced motion prevents gusts and dizzy spins', () => {
  for (const trigger of ['gust', 'dizzy']) {
    const result = updateBehavior(createBehavior(0, 1), 0.1, 0, 1, trigger, true);
    assert.equal(result.spin, 0);
    assert.equal(result.state.name, 'content');
  }
});
