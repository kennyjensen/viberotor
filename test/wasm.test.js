'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const js = require('../ui/solver.cjs');
const native = require('./helpers/fortran-wasm.js');
const exampleRotor = require('../ui/example-rotor.cjs');
let wasm;
test.before(async () => { wasm = await (await import('../wasm/solver.mjs')).createWasmSolver(); });
test.after(() => wasm?.dispose());

function close(a, b, label, tolerance = 1e-9) {
  assert.ok(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${label}: ${a} != ${b}`);
}
function vector(a, b, label, tolerance) {
  assert.equal(a.length, b.length, label + ' length');
  a.forEach((value, i) => close(value, b[i], label + '[' + i + ']', tolerance));
}
function compare(actual, reference, tolerance = 1e-9) {
  Object.values(actual.summary).forEach((value, i) => {
    // TNACEL subtracts nearly equal thrust terms before dimensional scaling.
    // Bound single-precision cancellation in the original nondimensional units.
    const cancellation = i === 12 && tolerance > 1e-6 ? 3e-7 * actual.config.density * actual.config.velocity ** 2 * actual.config.radius ** 2 : 0;
    close(value, reference.summary[i], 'summary[' + i + ']', Math.max(tolerance, cancellation));
  });
  assert.equal(actual.converged, Boolean(reference.summary[26]));
  actual.stations.forEach((row, i) => vector(Object.values(row).map(Number), reference.stations.slice(i * 11, i * 11 + 10), 'station ' + i, tolerance));
  // Single precision can cross the convergence threshold one iteration earlier.
  if (tolerance < 1e-6) vector(actual.history.flatMap(row => Object.values(row)), reference.history, 'history', tolerance);
}

test('WASM artifact is tied to the checked-in sources and compiler manifest', () => {
  const root = path.resolve(__dirname, '..');
  const manifest = require('../wasm/generated/manifest.json');
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  assert.equal(manifest.precision, 'f64');
  assert.ok(manifest.f2c && manifest.compiler);
  assert.equal(hash('wasm/generated/xrotor.wasm'), manifest.wasmSha256);
  for (const [file, expected] of Object.entries(manifest.sources)) assert.equal(hash(file), expected, file + ': run npm run build:wasm');
});

test('WASM operating matrix agrees with original native Fortran and the JS port', () => {
  const cases = [{}, { stations: 5 }, { stations: 80 }, { rpm: 1200, blades: 2 },
    { formulation: 'potential' }, { formulation: 'potential', free: false },
    { formulation: 'vortex', stations: 10 }, { formulation: 'vortex', stations: 20, free: false },
    { duct: true }, { duct: true, free: false, ductVelocity: 1.1 }, { iterations: 1 }];
  for (const c of cases) {
    const actual = wasm.solve(c);
    compare(actual, native.run(c));
    compare(actual, native.run(c, { real8: false }), 5e-5);
    const port = js.solve(c);
    vector(Object.values(actual.summary), Object.values(port.summary), 'JS summary');
    actual.stations.forEach((row, i) => vector(Object.values(row).map(Number), Object.values(port.stations[i]).map(Number), 'JS station'));
  }
});

test('all modern XROTOR examples solve with both backends and the native reference', () => {
  const runs = path.resolve(__dirname, '../third_party/Xrotor/runs');
  const files = fs.readdirSync(runs, { recursive: true })
    .filter(file => /\.(prop|newinput)$/.test(file) && !file.includes('old-format') && !path.basename(file).startsWith('README'));
  assert.equal(files.length, 6);
  for (const file of files) {
    const config = exampleRotor(fs.readFileSync(path.join(runs, file), 'utf8'));
    assert.equal(config.geometry.length, config.stations, file);
    const result = wasm.solve(config);
    assert.equal(result.converged, true, file);
    compare(result, native.run(config));
    vector(Object.values(result.summary), Object.values(js.solve(config).summary), file + ' JS summary');
  }
});

test('WASM thrust and power designs agree with Fortran and reopen as operating geometry', () => {
  for (const c of [{}, { targetType: 'power', target: 30000 }, { free: false }, { duct: true }, { duct: true, targetType: 'power', target: 30000 }, { iterations: 1 }]) {
    const result = wasm.solve(c, 'design');
    compare(result, native.run(c, { mode: 'design' }));
    compare(result, native.run(c, { mode: 'design', real8: false }), 5e-5);
    const port = js.solve(c, 'design');
    vector(Object.values(result.summary), Object.values(port.summary), 'JS design');
    if (result.converged) {
      const reopened = wasm.solve({ ...result.config, geometry: result.geometry });
      assert.equal(reopened.converged, true);
      // Fixed-wake DESGEN and APER initialize wake advance differently in
      // original Fortran too; compare that roundtrip to Fortran below.
      if (result.config.free) close(reopened.summary.TDIM, result.summary.TDIM, 'reopened thrust', 1e-5);
      compare(reopened, native.run({ ...result.config, geometry: result.geometry }));
    }
  }
});

test('WASM acoustic waveforms and significant harmonics agree with native Fortran', () => {
  for (const observer of [{}, { x: 8, y: -12, z: -50 }, { x: -10, y: 6, z: 25, aoc: 0 }]) {
    const actual = wasm.noise({}, observer);
    const ref = native.run({}, { observer });
    close(actual.spl, ref.totals[1], 'SPL');
    close(actual.bpf, ref.totals[2], 'BPF');
    vector(actual.time, ref.trace.slice(0, 81), 'time');
    vector(actual.pressure, ref.trace.slice(81), 'pressure');
    const floor = Math.max(...ref.harmonics.slice(0, 40)) * 1e-4;
    actual.harmonics.forEach((row, i) => {
      if (ref.harmonics[i] > floor) close(row.db, ref.harmonics[80 + i], 'harmonic dB', 1e-8);
    });
    const single = native.run({}, { observer, real8: false });
    close(actual.spl, single.totals[1], 'single-precision SPL', 5e-5);
    vector(actual.pressure, single.trace.slice(81), 'single-precision pressure', 5e-5);
    close(actual.spl, js.noise({}, observer).spl, 'JS SPL');
  }
});

test('WASM state isolation, sweeps, validation, and disposal', async () => {
  const baseline = wasm.solve({});
  const memory = wasm.raw.HEAPF64.buffer.byteLength;
  for (let i = 0; i < 10; i += 1) {
    wasm.solve({ duct: true }, 'design');
    wasm.noise({ blades: 2 });
    assert.deepEqual(wasm.solve({}).summary, baseline.summary);
  }
  assert.equal(wasm.raw.HEAPF64.buffer.byteLength, memory);
  const progress = [];
  const points = wasm.sweep({}, { from: 800, to: 1000, count: 3 }, p => progress.push(p));
  assert.deepEqual(progress.at(-1), { completed: 3, total: 3 });
  for (const point of points) {
    assert.equal(point.converged, true);
    close(point.thrust, native.run({ rpm: point.rpm }).summary[3], 'sweep thrust');
  }
  assert.throws(() => wasm.solve({ radius: 0 }), /radius/);
  assert.throws(() => wasm.solve({}, 'invalid'), /mode/);
  assert.throws(() => wasm.sweep({}, { from: 1000, to: 900 }), /increasing/);
  assert.ok(wasm.sweep({ iterations: 1 }, { from: 800, to: 1000, count: 3 }).every(p => !p.converged));
  assert.throws(() => wasm.noise({}, { z: 0 }), /diameter/);
  assert.throws(() => wasm.noise({}, { aoc: -1 }), /Section area/);
  assert.throws(() => wasm.noise({ iterations: 1 }), /converged/);
  const separate = await (await import('../wasm/solver.mjs')).createWasmSolver();
  assert.deepEqual(separate.solve({}).summary, baseline.summary);
  separate.dispose();
  separate.dispose();
  assert.throws(() => separate.solve({}), /disposed/);
});
