'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const xrotor = require('../js/xrotor.js');
const xoper = require('../js/xoper.js');
const xbend = require('../js/xbend.js');
const xdesi = require('../js/xdesi.js');
const { structuralState, designState } = require('./helpers/port-audit-state.js');
const { compileAuditDriver, runStructural, runDesign, loadFields, nodeFields, designFields, designSensitivityFields } = require('./helpers/fortran-port-audit.js');

function close(actual, expected, label, absTol = 1e-6, relTol = 1e-6) {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected), `${label}: nonfinite value`);
  assert.ok(Math.abs(actual - expected) <= Math.max(absTol, relTol * Math.abs(expected)), `${label}: ${actual} != ${expected}`);
}

test.before(() => {
  compileAuditDriver();
  compileAuditDriver(true);
});

for (const command of ['stload', 'stcalc', 'coupled']) {
  for (const duct of [false, true]) {
    for (const structural of [false, true]) {
      test(`${command} matches real Fortran dependencies, duct=${duct}, structure=${structural}`, () => {
        const options = { command, duct, structural, added: duct };
        const state = structuralState(options);
        const expected = runStructural(options);
        if (command === 'stload') {
          xbend.STLOAD(state);
        } else {
          if (command === 'coupled') assert.equal(state.CONV, true, 'operating solve converged');
          const result = xrotor.XROTOR(state, { command: 'BEND', subcommand: 'EVAL' });
          assert.equal(result.calc.converged, true, 'structural solve converged');
          close(state.RMS, expected.RMS, 'RMS', 2e-5, 2e-6);
          close(state.RLX, expected.RLX, 'RLX', 2e-5, 2e-6);
        }
        for (const field of [...loadFields, ...nodeFields]) {
          for (let i = 0; i < expected[field].length; i += 1) {
            // Existing structural solver tolerances, including single-precision iteration noise.
            close(state[field][i], expected[field][i], `${field}[${i}]`, 5e-5, 5e-6);
          }
        }
      });
    }
  }
}

test('standalone structural state preserves real aerodynamic state and owns its arrays', () => {
  const original = structuralState({ duct: true, added: true });
  const state = xbend.createState(original);
  assert.notEqual(state.VIND[0], original.VIND[0]);
  assert.notEqual(state.TX, original.TX);
  for (let i = 1; i <= state.II; i += 1) {
    assert.deepEqual(xbend.defaultCSCALC(i, state), xoper.CSCALC(original, i));
  }
  xbend.STLOAD(state);
  const expected = runStructural({ duct: true, added: true });
  close(state.PZ[0], expected.PZ[0], 'default CSCALC load');
});

for (const niter of [0, 1, 40]) {
  test(`DEITER preserves Fortran shared diagnostics with ${niter} iterations`, () => {
    const state = designState(niter, { deff: 123 });
    const expected = runDesign(niter, { deff: 123 });
    const result = xdesi.DEITER(state, 2);
    assert.equal(result.converged, expected.CONV);
    assert.equal(state.RMS, result.history.at(-1).RMS);
    assert.equal(state.RLX, result.history.at(-1).RLX);
    assert.equal(state.DEFF, result.history.at(-1).DEFF);
    for (const field of ['RMS', 'RLX', 'DEFF', 'TTOT', 'PTOT', ...designSensitivityFields]) close(state[field], expected[field], field, 4e-6, 4e-6);
  });
}

test('ducted DEITER retains the original shared DEFF convergence condition', () => {
  const options = { duct: true, deff: 0.01 };
  const state = designState(40, options);
  const expected = runDesign(40, options);
  assert.equal(xdesi.DEITER(state, 2).converged, false);
  assert.equal(state.CONV, expected.CONV);
  assert.equal(state.DEFF, options.deff);
  close(state.DEFF, expected.DEFF, 'DEFF');
});

for (const power of [false, true]) {
  for (const wind of [false, true]) {
    for (const duct of [false, true]) {
      for (const free of [false, true]) {
        test(`DEITER matches Fortran, power=${power}, wind=${wind}, duct=${duct}, free=${free}`, () => {
          const options = { power, wind, duct, free };
          const state = designState(40, options);
          const expected = runDesign(40, options);
          const double = runDesign(40, { ...options, real8: true });
          assert.equal(xdesi.DEITER(state, 2).converged, true);
          assert.equal(state.CONV, expected.CONV);
          assert.equal(state.CONV, double.CONV);
          for (const field of ['RMS', 'RLX', 'TTOT', 'PTOT', 'ADW', 'EFFINV', 'TDES', 'PDES', ...designSensitivityFields]) {
            close(state[field], expected[field], field, 4e-6, 4e-6);
            close(state[field], double[field], `double.${field}`, 1e-10, 1e-10);
          }
          for (const field of designFields) {
            for (let i = 0; i < state.II; i += 1) {
              close(state[field][i], expected[field][i], `${field}[${i}]`, 4e-6, 4e-6);
              close(state[field][i], double[field][i], `double.${field}[${i}]`, 1e-10, 1e-10);
            }
          }
          assert.ok(state.CH.slice(0, state.II).every(chord => chord > 0));
          assert.equal(Math.sign(state.PTOT), wind ? -1 : 1);
        });
      }
    }
  }
}

for (const power of [false, true]) {
  for (const duct of [false, true]) {
    for (const free of [false, true]) {
      test(`DEITER stalled windmill parity, power=${power}, duct=${duct}, free=${free}`, () => {
        // Deliberately bypass DESGEN's stall guard to exercise the solver.
        const options = { power, wind: true, duct, free, cl: -0.6 };
        const state = designState(40, options);
        const single = runDesign(40, options);
        const double = runDesign(40, { ...options, real8: true });
        assert.equal(xdesi.DEITER(state, 2).converged, true);
        assert.equal(single.CONV, true);
        assert.equal(double.CONV, true);
        assert.ok(state.STALL.slice(0, state.II).some(Boolean));
        for (const field of ['RMS', 'RLX', 'TTOT', 'PTOT', 'ADW', 'EFFINV', ...designSensitivityFields]) {
          close(state[field], single[field], field, 4e-6, 4e-6);
          close(state[field], double[field], `double.${field}`, 1e-10, 1e-10);
        }
        for (const field of designFields) {
          // REAL(4) post-stall inverse-lift sensitivity: observed maxima
          // 6.39e-6 rad in pitch and 2.47e-5 in CD; REAL(8) < 6.1e-11.
          const absolute = field === 'CD' ? 3e-5 : ['BETA', 'BETA0'].includes(field) ? 7e-6 : 4e-6;
          for (let i = 0; i < state.II; i += 1) {
            close(state[field][i], single[field][i], `${field}[${i}]`, absolute, 4e-6);
            close(state[field][i], double[field][i], `double.${field}[${i}]`, 1e-10, 1e-10);
          }
        }
      });
    }
  }
}

test('top-level commands reach real child handlers and keep shared numerical state', () => {
  const state = structuralState();
  assert.equal(xrotor.XROTOR(state, { command: 'AERO' }).length, state.NAERO);
  xrotor.XROTOR(state, { command: 'AERO', subcommand: 'NEW', XISECT: 0.7 });
  assert.equal(state.NAERO, 2);
  const copy = xrotor.XROTOR(state, { command: 'AERO', aeroCommand: 'DISP' });
  assert.equal(copy[1].XISECT, 0.7);
  xrotor.XROTOR(state, { command: 'OPER', subcommand: 'ANGL', value: 2 });
  close(state.BETA[0], 0.5 + 2 * xoper.PI / 180, 'pitch change');
  assert.equal(xrotor.XROTOR(state, { command: 'OPER' }).ADV, state.ADV);
  assert.equal(xrotor.XROTOR(state, { command: 'OPER', operCommand: 'ITER', value: 7 }).NITERA, 7);
  assert.equal(xrotor.XROTOR(state, { command: 'BEND' }).command, 'HELP');
  state.TX[0] = 0.03;
  xrotor.XROTOR(state, { command: 'BEND', bendCommand: 'CLR' });
  assert.equal(state.TX[0], 0);
  state.TY[0] = 0.02;
  xrotor.XROTOR(state, { command: 'BEND', action: 'CLR' });
  assert.equal(state.TY[0], 0);
});
