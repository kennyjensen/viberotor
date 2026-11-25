'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const solver = require('../ui/solver.cjs');
const { runAper } = require('./helpers/fortran-xoper.js');

function close(actual, expected, relative = 3e-5) {
  assert.ok(Math.abs(actual - expected) <= relative * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}

test('GUI operating-point adapter retains dimensional Fortran APER parity', () => {
  for (const options of [{}, { blades: 2, rpm: 1000 }, { formulation: 'potential', free: false }, { duct: true }]) {
    const { state } = solver.makeState(options);
    const reference = runAper(state, 4, 2, true);
    const result = solver.solve(options);
    assert.equal(result.converged, reference.CONV);
    close(result.summary.TDIM, reference.TTOT * state.RHO * state.VEL ** 2 * state.RAD ** 2);
    close(result.summary.PDIM, reference.PTOT * state.RHO * state.VEL ** 3 * state.RAD ** 2);
    close(result.summary.QDIM, reference.QTOT * state.RHO * state.VEL ** 2 * state.RAD ** 3);
    close(result.summary.EFFTOT, reference.TTOT / reference.PTOT);
    assert.equal(result.stations.length, state.II);
    result.stations.forEach((row, i) => {
      close(row.cl, reference.CL[i]);
      close(row.cd, reference.CD[i]);
      close(row.pitch, reference.BETA[i] * 180 / 3.141592654);
    });
  }
});

test('GUI design geometry can be reopened at the same operating point', () => {
  const design = solver.solve({}, 'design');
  assert.equal(design.converged, true);
  close(design.summary.TDIM, 600, 1e-6);
  const reopened = solver.solve({ ...design.config, geometry: design.geometry });
  assert.equal(reopened.converged, true);
  close(reopened.summary.TDIM, design.summary.TDIM, 1e-5);
  close(reopened.summary.PDIM, design.summary.PDIM, 1e-5);
  assert.ok(reopened.geometry.every(row => row.chord > 0));
  const powerDesign = solver.solve({ targetType: 'power', target: 30000 }, 'design');
  assert.equal(powerDesign.converged, true);
  close(powerDesign.summary.PDIM, 30000, 1e-6);
});

test('GUI keeps nonconvergence distinct from successful solves and sweep points', () => {
  assert.equal(solver.solve({ iterations: 1 }).converged, false);
  const progress = [];
  const points = solver.sweep({}, { from: 800, to: 1000, count: 3 }, p => progress.push(p));
  assert.equal(points.length, 3);
  assert.deepEqual(progress.at(-1), { completed: 3, total: 3 });
  for (const point of points) {
    assert.equal(point.converged, true);
    close(point.thrust, solver.solve({ rpm: point.rpm }).summary.TDIM, 1e-12);
  }
  assert.ok(solver.sweep({ iterations: 1 }, { from: 800, to: 1000, count: 3 }).every(p => !p.converged));
  assert.throws(() => solver.sweep({}, { from: 1000, to: 900, count: 3 }), /increasing/);
});

test('GUI acoustic data is finite and uses the actual rotor blade-passage frequency', () => {
  const result = solver.noise({});
  assert.ok(Number.isFinite(result.spl));
  close(result.bpf, 45, 1e-12);
  assert.equal(result.harmonics.length, 20);
  assert.equal(result.time.length, result.pressure.length);
  assert.ok(result.time.length >= 80);
  assert.ok(result.pressure.every(Number.isFinite));
  assert.throws(() => solver.noise({}, { x: 0, y: 0, z: 0 }), /diameter/);
  assert.throws(() => solver.noise({}, { aoc: -1 }), /Section area/);
  assert.throws(() => solver.noise({ iterations: 1 }), /converged/);
});

test('GUI project validation rejects malformed input and does not carry unknown state', () => {
  assert.equal(solver.validate({ executable: 'not a setting' }).executable, undefined);
  for (const config of [null, [], { free: 'false' }, { duct: 0 }, { geometry: null }, { rpm: NaN }, { radius: 0 }, { blades: 2.5 }, { stations: 81 }, { formulation: 'unknown' }, { targetType: 'torque' }, { geometry: [] }, { geometry: [{ r: 0.2, chord: 0.1, pitch: 30 }, { r: 0.1, chord: 0.1, pitch: 30 }, { r: 1, chord: 0.1, pitch: 30 }] }]) {
    assert.throws(() => solver.validate(config));
  }
  assert.equal(solver.validate({ name: ' ' }).name, 'Untitled rotor');
  assert.equal(solver.validate({ name: 'x'.repeat(200) }).name.length, 80);
});
