'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const xaero = require('../js/xaero.js');
const {
  compileFortranDriver,
  runChklim,
  runClcdcm,
  runGetaero,
  runGetalf,
  runGetclcdcm,
  runPutaero,
  runSetiaero,
  runSortar,
} = require('./helpers/fortran-xnoise.js');

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

function buildState() {
  const state = xaero.createState({
    II: 4,
    NAERO: 2,
    XI: new Float64Array([0.2, 0.45, 0.72, 0.94]),
    IAERO: new Int32Array([0, 0, 0, 0]),
    VEL: 52.0,
    VSO: 340.0,
    NAME: 'TEST-SECTION',
  });

  xaero.PUTAERO(
    state,
    1,
    0.2,
    -0.04,
    1.35,
    -1.1,
    5.9,
    1.2,
    0.18,
    0.010,
    0.28,
    0.020,
    -0.08,
    0.72,
    1.8e6,
    -0.15,
  );
  xaero.PUTAERO(
    state,
    2,
    0.82,
    -0.02,
    1.15,
    -0.95,
    5.6,
    1.0,
    0.16,
    0.012,
    0.24,
    0.024,
    -0.06,
    0.68,
    2.3e6,
    -0.12,
  );
  return state;
}

function aeroDataForDriver(state) {
  return Array.from({ length: 13 }, (_, row) => state.AERODATA[row].slice(0, state.NAERO));
}

function expectAeroFields(actual, expected, label, absTol = 1e-6, relTol = 1e-6) {
  for (const key of [
    'XISECT',
    'A0',
    'CLMAX',
    'CLMIN',
    'DCLDA',
    'DCLDA_STALL',
    'DCL_STALL',
    'CDMIN',
    'CLDMIN',
    'DCDCL2',
    'CMCON',
    'MCRIT',
    'REREF',
    'REXP',
  ]) {
    assertClose(actual[key], expected[key], `${label}.${key}`, absTol, relTol);
  }
}

test.before(() => {
  compileFortranDriver();
});

test('PUTAERO and GETAERO match Fortran storage behavior', () => {
  const state = xaero.createState({ NAERO: 2 });
  xaero.PUTAERO(
    state,
    2,
    0.77,
    -0.03,
    1.22,
    -0.84,
    5.7,
    1.1,
    0.17,
    0.011,
    0.25,
    0.021,
    -0.05,
    0.69,
    2.0e6,
    -0.14,
  );

  const expectedPut = runPutaero({
    N: 2,
    XISECT: 0.77,
    A0: -0.03,
    CLMAX: 1.22,
    CLMIN: -0.84,
    DCLDA: 5.7,
    DCLDA_STALL: 1.1,
    DCL_STALL: 0.17,
    CDMIN: 0.011,
    CLDMIN: 0.25,
    DCDCL2: 0.021,
    CMCON: -0.05,
    MCRIT: 0.69,
    REREF: 2.0e6,
    REXP: -0.14,
  });
  expectAeroFields(xaero.GETAERO(state, 2), expectedPut, 'PUTAERO');

  const seeded = buildState();
  const expectedGet = runGetaero({
    NAERO: seeded.NAERO,
    XIAERO: seeded.XIAERO.slice(0, seeded.NAERO),
    AERODATA: aeroDataForDriver(seeded),
    N: 2,
  });
  expectAeroFields(xaero.GETAERO(seeded, 2), expectedGet, 'GETAERO');
});

test('SORTAR and SETIAERO match Fortran', () => {
  const S = new Float64Array([0.82, 0.15, 0.57]);
  const W = [
    new Float64Array([10.0, 20.0, 30.0]),
    new Float64Array([-1.0, -2.0, -3.0]),
  ];

  const actualSort = xaero.SORTAR(3, S.slice(), W.map((row) => row.slice()), 2);
  const expectedSort = runSortar({ NS: 3, NDIM: 2, S, W });
  assertVectorClose(actualSort.S, expectedSort.S, 'SORTAR S', 1e-7, 1e-7);
  assertMatrixClose(actualSort.W, expectedSort.W, 'SORTAR W', 1e-7, 1e-7);

  const state = buildState();
  const actualIaero = xaero.SETIAERO(state);
  const expectedIaero = runSetiaero({
    II: state.II,
    NAERO: state.NAERO,
    XI: state.XI.slice(0, state.II),
    XIAERO: state.XIAERO.slice(0, state.NAERO),
  }).IAERO;
  assertVectorClose(actualIaero.slice(0, state.II), expectedIaero, 'SETIAERO', 0.0, 0.0);
});

test('CLCDCM matches Fortran in linear and clipped/stalled regimes', () => {
  const state = buildState();

  const linearActual = xaero.CLCDCM(
    0.09,
    0.45,
    1.9e6,
    -0.04,
    1.35,
    -1.1,
    5.9,
    1.2,
    0.18,
    0.010,
    0.28,
    0.020,
    -0.08,
    0.72,
    1.8e6,
    -0.15,
    state,
  );
  const linearExpected = runClcdcm({
    VEL: state.VEL,
    VSO: state.VSO,
    ALF: 0.09,
    W: 0.45,
    REY: 1.9e6,
    A0: -0.04,
    CLMAX: 1.35,
    CLMIN: -1.1,
    DCLDA: 5.9,
    DCLDA_STALL: 1.2,
    DCL_STALL: 0.18,
    CDMIN: 0.010,
    CLDMIN: 0.28,
    DCDCL2: 0.020,
    CMCON: -0.08,
    MCRIT: 0.72,
    REREF: 1.8e6,
    REXP: -0.15,
  });
  for (const key of ['CLIFT', 'CL_ALF', 'CL_W', 'CLMAX', 'CLMIN', 'DCL_STALL', 'CDRAG', 'CD_ALF', 'CD_W', 'CD_REY', 'CMOM', 'CM_AL', 'CM_W']) {
    assertClose(linearActual[key], linearExpected[key], `CLCDCM linear.${key}`, 2e-6, 2e-6);
  }
  assert.equal(linearActual.STALLF, linearExpected.STALLF);

  const clippedActual = xaero.CLCDCM(
    0.42,
    6.8,
    2.2e6,
    -0.04,
    1.35,
    -1.1,
    5.9,
    1.2,
    0.18,
    0.010,
    0.28,
    0.020,
    -0.08,
    0.72,
    1.8e6,
    -0.15,
    state,
  );
  const clippedExpected = runClcdcm({
    VEL: state.VEL,
    VSO: state.VSO,
    ALF: 0.42,
    W: 6.8,
    REY: 2.2e6,
    A0: -0.04,
    CLMAX: 1.35,
    CLMIN: -1.1,
    DCLDA: 5.9,
    DCLDA_STALL: 1.2,
    DCL_STALL: 0.18,
    CDMIN: 0.010,
    CLDMIN: 0.28,
    DCDCL2: 0.020,
    CMCON: -0.08,
    MCRIT: 0.72,
    REREF: 1.8e6,
    REXP: -0.15,
  });
  for (const key of ['CLIFT', 'CL_ALF', 'CL_W', 'CLMAX', 'CLMIN', 'CDRAG', 'CD_ALF', 'CD_W', 'CD_REY', 'CMOM', 'CM_W']) {
    assertClose(clippedActual[key], clippedExpected[key], `CLCDCM clipped.${key}`, 5e-5, 2e-5);
  }
  assert.equal(clippedActual.STALLF, clippedExpected.STALLF);
  assert.equal(clippedActual.machClipped, true);
});

test('GETCLCDCM matches Fortran interpolation and IAERO update', () => {
  const state = buildState();
  const actual = xaero.GETCLCDCM(state, 3, 0.11, 0.52, 2.1e6);
  const expected = runGetclcdcm({
    II: state.II,
    NAERO: state.NAERO,
    XI: state.XI.slice(0, state.II),
    IAERO: new Int32Array([0, 0, 0, 0]),
    XIAERO: state.XIAERO.slice(0, state.NAERO),
    AERODATA: aeroDataForDriver(state),
    VEL: state.VEL,
    VSO: state.VSO,
    IS: 3,
    ALF: 0.11,
    W: 0.52,
    REY: 2.1e6,
  });

  assertVectorClose(state.IAERO.slice(0, state.II), expected.IAERO, 'GETCLCDCM IAERO', 0.0, 0.0);
  for (const key of ['CLIFT', 'CL_ALF', 'CL_W', 'CLMAX', 'CLMIN', 'DCL_STALL', 'CDRAG', 'CD_ALF', 'CD_W', 'CD_REY', 'CMOM', 'CM_AL', 'CM_W']) {
    assertClose(actual[key], expected[key], `GETCLCDCM.${key}`, 5e-6, 2e-6);
  }
  assert.equal(actual.STALLF, expected.STALLF);
});

test('GETALF matches Fortran inverse alpha solve', () => {
  const state = buildState();
  xaero.SETIAERO(state);
  const target = xaero.GETCLCDCM(state, 2, 0.08, 0.5, 0.0).CLIFT;

  const actual = xaero.GETALF(state, 2, target, 0.5);
  const expected = runGetalf({
    II: state.II,
    NAERO: state.NAERO,
    XI: state.XI.slice(0, state.II),
    IAERO: state.IAERO.slice(0, state.II),
    XIAERO: state.XIAERO.slice(0, state.NAERO),
    AERODATA: aeroDataForDriver(state),
    VEL: state.VEL,
    VSO: state.VSO,
    IS: 2,
    CLIFT: target,
    W: 0.5,
  });

  assertClose(actual.ALF, expected.ALF, 'GETALF ALF', 2e-5, 2e-6);
  assertClose(actual.ALF_CL, expected.ALF_CL, 'GETALF ALF_CL', 2e-5, 2e-6);
  assertClose(actual.ALF_W, expected.ALF_W, 'GETALF ALF_W', 2e-5, 2e-6);
  assert.equal(actual.STALLF, expected.STALLF);
});

test('CHKLIM matches Fortran', () => {
  const F = new Float64Array([1.5, 1.2, 0.8, 0.4, 1.1, 1.6]);
  const actual = xaero.CHKLIM(F.length, F, 1.0);
  const expected = runChklim({ N: F.length, F, FMAX: 1.0 });

  assert.equal(actual.NSTRT, expected.NSTRT);
  assert.equal(actual.NEND, expected.NEND);
});

test('AEROPLT, AEROEDIT, and AERO provide stable structured wrappers', () => {
  const state = buildState();
  xaero.SETIAERO(state);

  const plot = xaero.AEROPLT(
    state,
    1,
    state.XIAERO[0],
    3,
    new Float64Array([0.0, 0.55, 0.92]),
    state.AERODATA[0][0],
    state.AERODATA[1][0],
    state.AERODATA[2][0],
    state.AERODATA[3][0],
    state.AERODATA[4][0],
    state.AERODATA[5][0],
    state.AERODATA[6][0],
    state.AERODATA[7][0],
    state.AERODATA[8][0],
    state.AERODATA[9][0],
    state.AERODATA[12][0],
    state.AERODATA[10][0],
    state.AERODATA[11][0],
  );
  assert.equal(plot.machSeries.length, 3);
  assert.equal(plot.title.section, 1);
  assert.equal(plot.machSeries[1].cdCl.x.length, 301);

  const edited = xaero.AEROEDIT(state, 1, { values: { CLMAX: 1.41, MCRIT: 0.75 } });
  assertClose(edited.CLMAX, 1.41, 'AEROEDIT CLMAX', 0.0, 0.0);
  assertClose(edited.MCRIT, 0.75, 'AEROEDIT MCRIT', 0.0, 0.0);

  const reflected = xaero.AEROEDIT(state, 1, { command: 'REFL' });
  assert.equal(state.WIND, true);
  assertClose(reflected.A0, 0.04, 'AEROEDIT REFL A0', 2e-6, 2e-6);

  const listing = xaero.AERO(state, { command: 'DISP' });
  assert.equal(listing.length, 2);

  xaero.AERO(state, { command: 'NEW', copyIndex: 1, XISECT: 0.6 });
  assert.equal(state.NAERO, 3);
  xaero.AERO(state, { command: 'DEL', index: 2 });
  assert.equal(state.NAERO, 2);

  const serialized = xaero.AERO(state, { command: 'WRIT' });
  const restored = xaero.createState({ II: state.II, XI: state.XI, IAERO: state.IAERO, VEL: state.VEL, VSO: state.VSO });
  xaero.AERO(restored, { command: 'READ', text: serialized });
  assert.equal(restored.NAERO, state.NAERO);
});
