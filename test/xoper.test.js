'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const xoper = require('../js/xoper.js');
const xaero = require('../js/xaero.js');
const {
  compileFortranDriver,
  runAper,
  runApinit,
  runCscalc,
  runFilter,
  runGradmo,
  runHelico,
  runSetxw,
  runTpq,
  runVcalc,
  runXwinit,
} = require('./helpers/fortran-xoper.js');

function assertClose(actual, expected, label, absTol = 1e-6, relTol = 1e-6) {
  const diff = Math.abs(actual - expected);
  const limit = Math.max(absTol, relTol * Math.abs(expected));
  assert.ok(
    diff <= limit,
    `${label}: expected ${expected}, got ${actual}, diff ${diff}, limit ${limit}`,
  );
}

function assertVectorClose(actual, expected, label, absTol = 1e-6, relTol = 1e-6) {
  assert.equal(actual.length, expected.length, `${label}: length mismatch`);
  for (let i = 0; i < actual.length; i += 1) {
    assertClose(actual[i], expected[i], `${label}[${i}]`, absTol, relTol);
  }
}

function assertMatrixClose(actual, expected, label, absTol = 1e-6, relTol = 1e-6) {
  assert.equal(actual.length, expected.length, `${label}: row count mismatch`);
  for (let i = 0; i < actual.length; i += 1) {
    assertVectorClose(actual[i], expected[i], `${label}[${i}]`, absTol, relTol);
  }
}

function assertTensor3Close(actual, expected, label, absTol = 1e-6, relTol = 1e-6) {
  assert.equal(actual.length, expected.length, `${label}: plane count mismatch`);
  for (let k = 0; k < actual.length; k += 1) {
    assertMatrixClose(actual[k], expected[k], `${label}[${k}]`, absTol, relTol);
  }
}

function sliceVector(values, count) {
  return values.slice(0, count);
}

function sliceMatrix(values, rows, cols) {
  return Array.from({ length: rows }, (_, i) => values[i].slice(0, cols));
}

function sliceTensor3(values, depth, rows, cols) {
  return Array.from({ length: depth }, (_, k) => sliceMatrix(values[k], rows, cols));
}

function buildBaseState(overrides = {}) {
  const state = xoper.createState({
    II: 5,
    NAERO: 2,
    NBLDS: 3,
    DUCT: false,
    FAST: true,
    FREE: true,
    VRTX: false,
    RAD: 1.4,
    VEL: 45.0,
    VSO: 340.0,
    RHO: 1.225,
    RMU: 1.789e-5,
    ADV: 0.72,
    ADW: 0.82,
    RAKE: 0.05,
    XI: new Float64Array([0.28, 0.44, 0.62, 0.80, 0.94]),
    DXI: new Float64Array([0.14, 0.17, 0.18, 0.16, 0.11]),
    XV: new Float64Array([0.21, 0.35, 0.53, 0.71, 0.88, 1.0]),
    CH: new Float64Array([0.22, 0.20, 0.17, 0.14, 0.11]),
    BETA: new Float64Array([0.58, 0.51, 0.43, 0.35, 0.28]),
    BETA0: new Float64Array([0.58, 0.51, 0.43, 0.35, 0.28]),
    UBODY: new Float64Array([0.02, 0.02, 0.015, 0.01, 0.005]),
    GAM: new Float64Array([0.095, 0.11, 0.105, 0.082, 0.05]),
    NITERA: 12,
    ADWFCTR: 1.0,
    ...overrides,
  });

  xaero.PUTAERO(
    state,
    1,
    0.28,
    -0.04,
    1.32,
    -1.05,
    5.8,
    1.15,
    0.18,
    0.010,
    0.28,
    0.020,
    -0.08,
    0.71,
    1.9e6,
    -0.14,
  );
  xaero.PUTAERO(
    state,
    2,
    0.82,
    -0.025,
    1.18,
    -0.92,
    5.5,
    1.00,
    0.16,
    0.012,
    0.24,
    0.024,
    -0.06,
    0.68,
    2.2e6,
    -0.12,
  );
  xaero.SETIAERO(state);
  return state;
}

function cloneState(state) {
  return xoper.createState(state);
}

function prepareMomentumState(state) {
  xoper.GRADMO(xoper.IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
  xoper.VCALC(state);
  return state;
}

function prepareWakeState(state) {
  prepareMomentumState(state);
  xoper.SETXW(state);
  return state;
}

function buildDesignState() {
  const state = buildBaseState();
  prepareWakeState(state);
  xoper.TPQ(state, 1);
  return state;
}

function buildConvergedState(overrides = {}) {
  const state = buildBaseState(overrides);
  const result = xoper.APER(state, 4, 2, true);
  assert.equal(result.converged, true, 'expected converged setup state');
  return state;
}

test.before(() => {
  compileFortranDriver();
});

test('GRADMO matches Fortran in free-tip mode', () => {
  const state = buildBaseState();

  const actual = xoper.GRADMO(xoper.IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
  const expected = runGradmo(state);

  assertTensor3Close(sliceTensor3(actual.VIND_GAM, 3, state.II, state.II), expected.VIND_GAM, 'GRADMO VIND_GAM', 5e-7, 5e-7);
  assertMatrixClose(sliceMatrix(actual.VIND_ADW, 3, state.II), expected.VIND_ADW, 'GRADMO VIND_ADW', 5e-7, 5e-7);
});

test('GRADMO matches Fortran in duct mode', () => {
  const state = buildBaseState({
    DUCT: true,
    URDUCT: 1.12,
    ADW: 0.9,
  });

  const actual = xoper.GRADMO(xoper.IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
  const expected = runGradmo(state);

  assertTensor3Close(sliceTensor3(actual.VIND_GAM, 3, state.II, state.II), expected.VIND_GAM, 'GRADMO duct VIND_GAM', 2e-7, 2e-7);
  assertMatrixClose(sliceMatrix(actual.VIND_ADW, 3, state.II), expected.VIND_ADW, 'GRADMO duct VIND_ADW', 2e-7, 2e-7);
});

test('HELICO matches Fortran', () => {
  const state = buildBaseState({
    FAST: false,
  });

  const actual = xoper.HELICO(xoper.IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
  const expected = runHelico(state);

  assertTensor3Close(sliceTensor3(actual.VIND_GAM, 3, state.II, state.II), expected.VIND_GAM, 'HELICO VIND_GAM', 2e-5, 2e-5);
  assertMatrixClose(sliceMatrix(actual.VIND_ADW, 3, state.II), expected.VIND_ADW, 'HELICO VIND_ADW', 2e-6, 2e-6);
});

test('FILTER matches Fortran and preserves oversize arrays', () => {
  const q = new Float64Array([1.0, -0.4, 0.9, 1.6, -0.2, 0.7]);

  const actual = xoper.FILTER(q.slice(), 1.8, q.length);
  const expected = runFilter({ Q: q, SMLEN: 1.8, N: q.length });

  assertVectorClose(actual, expected.Q, 'FILTER', 2e-7, 2e-7);

  const oversize = new Float64Array(501).fill(0.0).map((_, i) => Math.sin(i / 13));
  const copy = oversize.slice();
  const unchanged = xoper.FILTER(copy, 2.0, copy.length);
  assertVectorClose(unchanged, oversize, 'FILTER oversize', 0.0, 0.0);
});

test('VCALC and CSCALC match Fortran', () => {
  const state = buildBaseState();
  prepareMomentumState(state);

  const expectedVcalc = runVcalc(state);
  assertMatrixClose(sliceMatrix(state.VIND, 3, state.II), expectedVcalc.VIND, 'VCALC', 2e-7, 2e-7);

  const actualCscalc = xoper.CSCALC(state, 3);
  const expectedCscalc = runCscalc(state, 3);
  for (const field of ['UTOT', 'WA', 'WT', 'VT', 'VT_ADW', 'VA', 'VA_ADW', 'VD', 'VD_ADW', 'CI', 'CI_ADV', 'CI_VT', 'SI', 'SI_VA', 'W', 'W_ADV', 'W_VT', 'W_VA', 'PHI', 'P_ADV', 'P_VT', 'P_VA']) {
    assertClose(actualCscalc[field], expectedCscalc[field], `CSCALC.${field}`, 2e-7, 2e-7);
  }

  const adwCorr = xoper.ADWCORR(state);
  for (let i = 1; i <= state.II; i += 1) {
    const c = runCscalc(state, i);
    const expected = (state.XI[i - 1] / state.ADV) / (state.XI[i - 1] / state.ADV - c.VT);
    assertClose(adwCorr[i - 1], expected, `ADWCORR[${i - 1}]`, 3e-7, 3e-7);
  }
});

test('XWINIT and SETXW match Fortran', () => {
  const xwinitState = buildBaseState();
  prepareMomentumState(xwinitState);
  const xwinitDriverState = buildBaseState();
  prepareMomentumState(xwinitDriverState);

  const actualXwinit = xoper.XWINIT(xwinitState);
  const expectedXwinit = runXwinit(xwinitDriverState);
  assertVectorClose(sliceVector(actualXwinit.XW, xwinitState.II), expectedXwinit.XW, 'XWINIT XW', 2e-7, 2e-7);
  assertVectorClose(sliceVector(actualXwinit.DXW, xwinitState.II), expectedXwinit.DXW, 'XWINIT DXW', 2e-7, 2e-7);
  assertVectorClose(sliceVector(actualXwinit.VWAK, xwinitState.II), expectedXwinit.VWAK, 'XWINIT VWAK', 2e-7, 2e-7);
  assertVectorClose(sliceVector(xwinitState.VW_ADW, xwinitState.II), expectedXwinit.VW_ADW, 'XWINIT VW_ADW', 2e-7, 2e-7);
  assertClose(xwinitState.XWTIP, expectedXwinit.XWTIP, 'XWINIT XWTIP', 2e-7, 2e-7);

  const setxwState = buildBaseState();
  prepareMomentumState(setxwState);
  const setxwDriverState = buildBaseState();
  prepareMomentumState(setxwDriverState);
  xoper.SETXW(setxwState);
  const expectedSetxw = runSetxw(setxwDriverState);
  assertVectorClose(sliceVector(setxwState.XW, setxwState.II), expectedSetxw.XW, 'SETXW XW', 2e-7, 2e-7);
  assertVectorClose(sliceVector(setxwState.DXW, setxwState.II), expectedSetxw.DXW, 'SETXW DXW', 2e-7, 2e-7);
  assertVectorClose(sliceVector(setxwState.VWAK, setxwState.II), expectedSetxw.VWAK, 'SETXW VWAK', 2e-7, 2e-7);
  assertVectorClose(sliceVector(setxwState.XW_ADV, setxwState.II), expectedSetxw.XW_ADV, 'SETXW XW_ADV', 2e-7, 2e-7);
  assertVectorClose(sliceVector(setxwState.XW_ADW, setxwState.II), expectedSetxw.XW_ADW, 'SETXW XW_ADW', 2e-7, 2e-7);
  assertVectorClose(sliceVector(setxwState.DXW_ADV, setxwState.II), expectedSetxw.DXW_ADV, 'SETXW DXW_ADV', 2e-7, 2e-7);
  assertVectorClose(sliceVector(setxwState.DXW_ADW, setxwState.II), expectedSetxw.DXW_ADW, 'SETXW DXW_ADW', 2e-7, 2e-7);
  assertVectorClose(sliceVector(setxwState.VW_ADV, setxwState.II), expectedSetxw.VW_ADV, 'SETXW VW_ADV', 2e-7, 2e-7);
  assertVectorClose(sliceVector(setxwState.VW_ADW, setxwState.II), expectedSetxw.VW_ADW, 'SETXW VW_ADW', 2e-7, 2e-7);
  assertClose(setxwState.XWTIP, expectedSetxw.XWTIP, 'SETXW XWTIP', 2e-7, 2e-7);
});

test('TPQ matches Fortran for analysis mode', () => {
  const state = buildBaseState();
  const driverState = buildBaseState();
  prepareWakeState(state);
  prepareMomentumState(driverState);

  const actual = xoper.TPQ(state, 1);
  const expected = runTpq(driverState, 1);

  for (const field of ['TINV', 'PINV', 'TWAK', 'PWAK', 'TVIS', 'PVIS', 'TTOT', 'PTOT', 'QTOT', 'TI_ADV', 'PI_ADV', 'TW_ADV', 'PW_ADV', 'TV_ADV', 'PV_ADV', 'TV_DBE', 'PV_DBE']) {
    assertClose(state[field], expected[field], `TPQ1.${field}`, 2e-7, 2e-7);
  }
  for (const field of ['CH', 'BETA', 'BETA0', 'CL', 'CD', 'CM', 'RE', 'EFFP', 'DTII', 'DPII', 'DTWI', 'DPWI', 'DTVI', 'DPVI', 'TI_GAM', 'PI_GAM', 'TW_GAM', 'PW_GAM', 'TV_GAM', 'PV_GAM']) {
    assertVectorClose(sliceVector(state[field], state.II), expected[field], `TPQ1.${field}`, 2e-7, 2e-7);
  }
});

test('TPQ matches Fortran for fixed-CL design mode', () => {
  const state = buildDesignState();
  const actualState = cloneState(state);

  const actual = xoper.TPQ(actualState, 2);
  const expected = runTpq(state, 2);

  for (const field of ['TTOT', 'PTOT', 'QTOT', 'TINV', 'PINV', 'TWAK', 'PWAK', 'TVIS', 'PVIS']) {
    assertClose(actual[field], expected[field], `TPQ2.${field}`, 2e-7, 2e-7);
  }
  for (const field of ['CH', 'BETA', 'BETA0', 'CL', 'CD', 'CM']) {
    assertVectorClose(sliceVector(actualState[field], actualState.II), expected[field], `TPQ2.${field}`, 2e-7, 2e-7);
  }
});

test('TPQ matches Fortran for fixed-chord design mode', () => {
  const state = buildDesignState();
  const actualState = cloneState(state);

  const actual = xoper.TPQ(actualState, 3);
  const expected = runTpq(state, 3);

  for (const field of ['TTOT', 'PTOT', 'QTOT', 'TINV', 'PINV', 'TWAK', 'PWAK', 'TVIS', 'PVIS']) {
    assertClose(actual[field], expected[field], `TPQ3.${field}`, 2e-7, 2e-7);
  }
  for (const field of ['CH', 'BETA', 'BETA0', 'CL', 'CD', 'CM']) {
    assertVectorClose(sliceVector(actualState[field], actualState.II), expected[field], `TPQ3.${field}`, 2e-7, 2e-7);
  }
});

test('APINIT matches Fortran', () => {
  const actualState = buildBaseState();
  const actual = xoper.APINIT(actualState);
  const expected = runApinit(buildBaseState());

  assertClose(actual.ADW, expected.ADW, 'APINIT ADW', 2e-7, 2e-7);
  assertVectorClose(sliceVector(actualState.GAM, actualState.II), expected.GAM, 'APINIT GAM', 2e-7, 2e-7);
  assertVectorClose(sliceVector(actualState.CL, actualState.II), expected.CL, 'APINIT CL', 2e-7, 2e-7);
  assertVectorClose(sliceVector(actualState.CD, actualState.II), expected.CD, 'APINIT CD', 2e-7, 2e-7);
  assertVectorClose(sliceVector(actualState.CM, actualState.II), expected.CM, 'APINIT CM', 2e-7, 2e-7);
});

test('APER matches Fortran for a fixed advance-ratio operating-point solve', () => {
  const actualState = buildBaseState();
  const actual = xoper.APER(actualState, 4, 2, true);
  const expected = runAper(buildBaseState(), 4, 2, true);

  assert.equal(actual.converged, expected.CONV, 'APER convergence');
  assert.equal(actualState.IWTYP, expected.IWTYP, 'APER wake model type');
  for (const field of ['ADV', 'ADW', 'DBETA', 'RMS', 'RLX', 'TTOT', 'PTOT', 'QTOT', 'TINV', 'PINV', 'TWAK', 'PWAK', 'TVIS', 'PVIS']) {
    assertClose(actualState[field], expected[field], `APER.${field}`, 2e-7, 2e-7);
  }
  for (const field of ['GRESMX', 'FRESMX', 'ARESMX']) {
    assertClose(actualState[field], expected[field], `APER.${field}`, 5e-7, 5e-7);
  }
  for (const field of ['BETA', 'BETA0', 'GAM', 'CL', 'CD', 'CM', 'DGAMOLD']) {
    assertVectorClose(sliceVector(actualState[field], actualState.II), expected[field], `APER.${field}`, 2e-7, 2e-7);
  }
});

test('APER matches Fortran for thrust, torque, and power target branches', () => {
  const baseState = buildConvergedState();
  const cases = [
    {
      label: 'thrust-fixed-rpm',
      ispec: 1,
      icon: 1,
      field: 'TSPEC',
      value: baseState.TTOT * baseState.RHO * baseState.VEL ** 2 * baseState.RAD ** 2,
    },
    {
      label: 'torque-fixed-pitch',
      ispec: 2,
      icon: 2,
      field: 'QSPEC',
      value: baseState.QTOT * baseState.RHO * baseState.VEL ** 2 * baseState.RAD ** 3,
    },
    {
      label: 'power-fixed-pitch',
      ispec: 3,
      icon: 2,
      field: 'PSPEC',
      value: baseState.PTOT * baseState.RHO * baseState.VEL ** 3 * baseState.RAD ** 2,
    },
  ];

  for (const scenario of cases) {
    const actualState = cloneState(baseState);
    actualState[scenario.field] = scenario.value;
    const actual = xoper.APER(actualState, scenario.ispec, scenario.icon, false);

    const expectedState = cloneState(baseState);
    expectedState[scenario.field] = scenario.value;
    const expected = runAper(expectedState, scenario.ispec, scenario.icon, false);

    assert.equal(actual.converged, expected.CONV, `${scenario.label} convergence`);
    for (const field of ['ADV', 'ADW', 'TTOT', 'PTOT', 'QTOT', 'TINV', 'PINV', 'TWAK', 'PWAK', 'TVIS', 'PVIS']) {
      assertClose(actualState[field], expected[field], `${scenario.label}.${field}`, 1e-6, 1e-6);
    }
    for (const field of ['BETA', 'GAM', 'CL', 'CD']) {
      assertVectorClose(sliceVector(actualState[field], actualState.II), expected[field], `${scenario.label}.${field}`, 1e-6, 1e-6);
    }
  }
});

test('GETPVAR, GETCAS, SHOCAS, and SETCAS handle file-style inputs', () => {
  const powerLine = [
    'RPM PWR',
    '1200 18.5',
    '1500 21.0',
    '1800 24.5',
  ].join('\n');
  const pvar = xoper.GETPVAR(0, 10, 0, null, null, { text: powerLine });
  assert.equal(pvar.N, 3);
  assertVectorClose(pvar.XRPM.slice(0, 3), new Float64Array([1200, 1500, 1800]), 'GETPVAR XRPM', 0.0, 0.0);
  assertVectorClose(pvar.XPWR.slice(0, 3), new Float64Array([18.5, 21.0, 24.5]), 'GETPVAR XPWR', 0.0, 0.0);

  const caseText = [
    'TEST CASES',
    '',
    '',
    '1 0.70 12.0 46.0 0.0 1.225 1.789 340.0 0.0 5.2 2.8 1.9 0.53',
    '2 0.76 14.0 48.0 0.0 1.210 1.760 338.0 0.2 5.8 3.0 2.1 0.56',
  ].join('\n');
  const cases = xoper.GETCAS(0, 12, 0, null, { text: caseText });
  assert.equal(cases.NCAS, 2);
  assert.equal(cases.NAME.trim(), 'TEST CASES');
  const shown = xoper.SHOCAS(0, 12, cases.NCAS, cases.PAR, 1.4, cases.NAME);
  assert.equal(shown.rows.length, 2);
  assertClose(shown.rows[0].ADV, 0.70, 'SHOCAS ADV', 0.0, 0.0);
  assertClose(shown.rows[1].POW, 5.8, 'SHOCAS POW', 0.0, 0.0);

  const seqState = buildBaseState();
  const seq1 = xoper.SETCAS(seqState, 1, 0, [], { ADV1: 0.6, ADV2: 0.8, DADV: 0.1 });
  assert.equal(seq1.KCASE, 1);
  assert.equal(seqState.NCASE, 3);
  assertClose(seqState.CASPAR[1][2], 0.8, 'SETCAS ADV sequence', 0.0, 0.0);

  const seqRpm = xoper.SETCAS(seqState, 2, 0, [], {
    RPM1: 1200,
    RPM2: 1600,
    DRPM: 200,
    fixed: 'Q',
    usePowerLine: true,
  });
  assert.equal(seqRpm.KCASE, 2);
  assert.ok(seqState.CASPAR[0][3] > 2000.0);

  const seqBeta = xoper.SETCAS(seqState, 3, 0, [], { BET1: 8, BET2: 12, DBET: 2 });
  assert.equal(seqBeta.KCASE, 3);
  assertClose(seqState.CASPAR[3][seqState.NCASE - 1], 12 * Math.PI / 180.0, 'SETCAS beta sequence', 1e-10, 1e-10);

  seqState.PTOT = 0.42;
  const seq2 = xoper.SETCAS(seqState, 4, 0, [], {
    VEL1: 40,
    VEL2: 50,
    DVEL: 5,
    mode: 'CS',
    constantRpm: 1800,
  });
  assert.equal(seq2.KCASE, 5);
  assert.ok(seqState.PSPEC > 0.0);
});

test('OPER handles command-style wrappers and reports unsupported commands', () => {
  const state = buildBaseState();
  const powerLine = [
    'RPM PWR',
    '1200 18.5',
    '1500 21.0',
    '1800 24.5',
  ].join('\n');
  const caseText = [
    'TEST CASES',
    '',
    '',
    '1 0.70 12.0 46.0 0.0 1.225 1.789 340.0 0.0 5.2 2.8 1.9 0.53',
    '2 0.76 14.0 48.0 0.0 1.210 1.760 338.0 0.2 5.8 3.0 2.1 0.56',
  ].join('\n');

  const form = xoper.OPER(state, { command: 'FORM', mode: 'POT' });
  assert.equal(form.FAST, false);
  assert.equal(form.VRTX, false);
  assert.equal(xoper.OPER(state, { command: 'FORM', mode: 'GRAD' }).FAST, true);
  assert.equal(xoper.OPER(state, { command: 'FORM', mode: 'VRTX' }).VRTX, true);
  assert.equal(xoper.OPER(state, { command: 'FORM', mode: 'WAKE' }).FREE, false);

  const terse = xoper.OPER(state, { command: 'TERS' });
  assert.equal(terse.TERSE, true);

  const iter = xoper.OPER(state, { command: 'ITER', value: 7 });
  assert.equal(iter.NITERA, 7);

  const adw = xoper.OPER(state, { command: 'ADW', value: 1.15 });
  assert.equal(adw.ADWFCTR, 1.15);

  const duct = xoper.OPER(state, { command: 'DUCT', value: 1.08 });
  assert.equal(duct.DUCT, true);
  assert.equal(xoper.OPER(state, { command: 'VRAT', value: 1.12 }).URDUCT, 1.12);

  state.TTOT = 0.08;
  state.PTOT = 0.11;
  state.QTOT = 0.07;
  assert.equal(xoper.OPER(state, { command: 'VELO', value: 50.0 }).VEL, 50.0);
  assert.ok(xoper.OPER(state, { command: 'ANGL', value: 2.0 }).BETA_TIP_DEG > 0.0);

  const display = xoper.OPER(state, { command: 'DISP' });
  assert.equal(display.ADV, state.ADV);
  assert.equal(display.CONV, state.CONV);

  const powerVar = xoper.OPER(state, { command: 'PVAR', text: powerLine });
  assert.equal(powerVar.NPWRVAR, 3);
  assert.equal(state.LPWRVAR, true);

  assert.equal(xoper.OPER(state, { command: 'INIT' }).LOPRINI, true);
  assert.equal(xoper.OPER(state, { command: 'ADDC' }).NCASE, 1);
  assert.equal(xoper.OPER(state, { command: 'CLRC' }).NCASE, 0);
  assert.equal(xoper.OPER(state, { command: 'CGET', text: caseText }).NCAS, 2);
  assert.equal(xoper.OPER(state, { command: 'CPUT' }).rows.length, 2);

  const help = xoper.OPER(state, { command: 'HELP', value: 'topics' });
  assert.deepEqual(help, { command: 'HELP', value: 'topics' });

  assert.throws(() => xoper.OPER(state, { command: 'NOPE' }), /unsupported command/);
});
