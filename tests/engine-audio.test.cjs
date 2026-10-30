const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'engine-audio.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const { Sim, ENGINES, CORES, PROFILES } = sandbox.window.VelonixAudio;
const step = (sim, seconds) => { for (let i = 0; i < seconds * 60; i++) sim.step(1 / 60); };

for (const [name, spec] of Object.entries({ ...ENGINES, ...CORES })) {
  test(`${name}: sustained throttle keeps accelerating beyond the old redline`, () => {
    const sim = new Sim(spec);
    const updates = [];
    sim.attach({ set: state => updates.push(state), pop() {} });
    sim.start(); sim.throttle(true); step(sim, 10);
    assert.ok(sim.rpm > spec.limit * 2);
    const rpm = sim.rpm, speed = sim.speed;
    step(sim, 50);
    assert.ok(sim.rpm > rpm * 2, 'revs should continue rising during a long hold');
    assert.ok(sim.speed > speed * 2, 'road speed should continue rising');
    assert.ok(updates.every(s => !s.cut), 'ignition should never hit fuel cut');
    assert.equal(sim.motion().wheelSpeed, sim.speed, 'rolling tyres must match road speed');
    sim.throttle(false); step(sim, 3);
    assert.ok(sim.rpm < rpm && sim.speed < speed, 'lifting off should slow the vehicle');
    sim.stop(); step(sim, 30);
    assert.equal(sim.speed, 0);
    assert.equal(sim.rpm, 0);
    assert.equal(sim.ign, false);
  });
}

test('burnout creates driven-wheel slip and returns to rolling on release', () => {
  const sim = new Sim(ENGINES.spectre);
  sim.start(); sim.burnout = true; step(sim, 4);
  assert.ok(sim.motion().wheelSpeed > sim.speed * 2);
  sim.burnout = false;
  assert.equal(sim.motion().wheelSpeed, sim.speed);
  let lastAudio;
  sim.attach({ set: state => { lastAudio = state; }, pop() {} });
  sim.park();
  assert.equal(sim.rpm, 0);
  assert.equal(sim.speed, 0);
  assert.equal(sim.burnout, false);
  assert.equal(lastAudio.ign, false, 'parking must silence the worklet before a background tab suspends');
  assert.equal(lastAudio.rpm, 0);
});

test('acceleration remains consistent at different frame rates', () => {
  const run = fps => {
    const sim = new Sim(ENGINES.vortex); sim.start(); sim.throttle(true);
    for (let i = 0; i < fps * 20; i++) sim.step(1 / fps);
    return sim;
  };
  const a = run(30), b = run(144);
  assert.ok(Math.abs(a.rpm - b.rpm) / b.rpm < 0.02);
  assert.ok(Math.abs(a.speed - b.speed) / b.speed < 0.02);
});

const worklet = source.match(/const WORKLET = `([\s\S]*?)`;/)[1];
for (const sampleRate of [44100, 48000]) {
  for (const [name, spec] of Object.entries({ ...ENGINES, ...CORES })) {
    test(`${name}: finite, audible stereo at idle and extreme revs (${sampleRate} Hz)`, () => {
      let Processor;
      vm.runInNewContext(worklet, {
        sampleRate,
        AudioWorkletProcessor: class { constructor() { this.port = {}; } },
        registerProcessor: (_, ctor) => { Processor = ctor; }
      });
      const engine = new Processor();
      engine.setProfile({ ...PROFILES[spec.sound], idle: spec.idle || 800, limit: spec.limit });
      const left = new Float32Array(128), right = new Float32Array(128);
      const param = value => new Float32Array([value]);
      for (const rpm of [spec.idle || 400, spec.limit, spec.limit * 8, 1e9]) {
        let energy = 0, peak = 0;
        for (let i = 0; i < 100; i++) {
          engine.process([], [[left, right]], { rpm: param(rpm), load: param(1), ign: param(1), starter: param(0) });
          for (const samples of [left, right]) for (const value of samples) {
            assert.ok(Number.isFinite(value));
            energy += value * value; peak = Math.max(peak, Math.abs(value));
          }
        }
        assert.ok(energy > 0.001, `silent output at ${rpm} rpm`);
        assert.ok(peak <= 1, 'output must stay bounded');
      }
      // Engine off must decay to silence without lingering resonator noise.
      for (let i = 0; i < 2400; i++) engine.process([], [[left, right]], { rpm: param(0), load: param(0), ign: param(0), starter: param(0) });
      assert.ok(left.every(x => Math.abs(x) < 0.001));
    });
  }
}
