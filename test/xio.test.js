'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const xio = require('../js/xio.js');
const xrotor = require('../js/xrotor.js');
const xoper = require('../js/xoper.js');
const xaero = require('../js/xaero.js');
const { SPLINE } = require('../js/spline.js');
const {
  compileFortranDriver,
  runSave,
  runSaveOld,
  runLoad,
  runLoadOld,
} = require('./helpers/fortran-xio.js');

const buildDir = path.join(__dirname, '..', 'build');

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

function tempFilePath(name) {
  fs.mkdirSync(buildDir, { recursive: true });
  return path.join(buildDir, `${name}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.dat`);
}

function buildRestartState(overrides = {}) {
  const state = xrotor.createState({
    NAME: 'Restart blade',
    VERSION: 7.55,
    II: 5,
    NAERO: 2,
    NBLDS: 3,
    FAST: false,
    FREE: true,
    DUCT: true,
    WIND: false,
    RAD: 1.45,
    VEL: 42.0,
    VSO: 339.0,
    RHO: 1.19,
    RMU: 1.82e-5,
    ALT: 1.5,
    ADV: 0.69,
    ADW: 0.81,
    RAKE: 0.04,
    URDUCT: 1.07,
    XI0: 0.22,
    XW0: 0.24,
    XITIP: 1.0,
    XI: new Float64Array([0.28, 0.44, 0.62, 0.80, 0.94]),
    DXI: new Float64Array([0.14, 0.17, 0.18, 0.16, 0.11]),
    XV: new Float64Array([0.22, 0.35, 0.53, 0.71, 0.88, 1.0]),
    CH: new Float64Array([0.23, 0.20, 0.17, 0.14, 0.11]),
    BETA: new Float64Array([0.58, 0.51, 0.43, 0.35, 0.28]),
    BETA0: new Float64Array([0.58, 0.51, 0.43, 0.35, 0.28]),
    UBODY: new Float64Array([0.02, 0.018, 0.015, 0.010, 0.005]),
    GAM: new Float64Array([0.09, 0.108, 0.104, 0.080, 0.050]),
    NITERA: 12,
    ADWFCTR: 1.0,
    CONV: true,
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

  state.NADD = 4;
  state.RADD.set([0.42, 0.76, 1.06, 1.34]);
  state.UADD.set([1.6, 2.0, 1.8, 1.4]);
  state.VADD.set([-0.25, -0.10, 0.05, 0.18]);
  SPLINE(state.UADD, state.UADDR, state.RADD, state.NADD);
  SPLINE(state.VADD, state.VADDR, state.RADD, state.NADD);

  const result = xoper.APER(state, 4, 2, true);
  assert.equal(result.converged, true, 'expected converged restart state');
  state.CONV = true;
  return state;
}

function buildLoadState(initialII) {
  const state = xrotor.createState();
  xrotor.SETDEF(state);
  state.VERSION = 7.55;
  state.XITIP = 1.0;
  state.XINF = 3.0;
  state.NN = 32;
  state.GEE = 9.81;
  state.ADWFCTR = 1.0;
  state.NITERD = 40;
  state.NITERA = 40;
  state.II = initialII;
  state.IINF = state.II + Math.trunc(state.II / 2);
  return state;
}

function assertLoadedStateClose(state, expected, label) {
  assert.equal(Boolean(state.CONV), expected.CONV, `${label}.CONV`);
  assert.equal(Boolean(state.FREE), expected.FREE, `${label}.FREE`);
  assert.equal(Boolean(state.DUCT), expected.DUCT, `${label}.DUCT`);
  assert.equal(Boolean(state.WIND), expected.WIND, `${label}.WIND`);
  assert.equal(Boolean(state.LROTOR), expected.LROTOR, `${label}.LROTOR`);
  assert.equal(state.II, expected.II, `${label}.II`);
  assert.equal(state.NBLDS, expected.NBLDS, `${label}.NBLDS`);
  assert.equal(state.NAERO, expected.NAERO, `${label}.NAERO`);
  assert.equal(state.NADD, expected.NADD, `${label}.NADD`);

  for (const field of ['RHO', 'VSO', 'RMU', 'ALT', 'RAD', 'VEL', 'ADV', 'RAKE', 'XI0', 'XW0', 'URDUCT', 'TTOT', 'PTOT', 'QTOT', 'RADDES', 'VELDES', 'ADVDES', 'RPMDES', 'R0DES', 'RWDES', 'TDDES', 'PDDES', 'CLDES0']) {
    assertClose(state[field], expected[field], `${label}.${field}`, 2e-5, 2e-5);
  }

  assertVectorClose(state.XI.slice(0, state.II), expected.XI, `${label}.XI`, 2e-5, 2e-5);
  assertVectorClose(state.CH.slice(0, state.II), expected.CH, `${label}.CH`, 2e-5, 2e-5);
  assertVectorClose(state.BETA.slice(0, state.II), expected.BETA, `${label}.BETA`, 2e-5, 2e-5);
  assertVectorClose(state.BETA0.slice(0, state.II), expected.BETA0, `${label}.BETA0`, 2e-5, 2e-5);
  assertVectorClose(state.UBODY.slice(0, state.II), expected.UBODY, `${label}.UBODY`, 2e-5, 2e-5);
  assertVectorClose(state.CL.slice(0, state.II), expected.CL, `${label}.CL`, 2e-5, 2e-5);
  assertVectorClose(state.CLDES.slice(0, state.II), expected.CLDES, `${label}.CLDES`, 2e-5, 2e-5);
  assert.deepEqual(Array.from(state.IAERO.slice(0, state.II)), Array.from(expected.IAERO), `${label}.IAERO`);
  assertVectorClose(state.XIAERO.slice(0, state.NAERO), expected.XIAERO, `${label}.XIAERO`, 2e-7, 2e-7);
  for (let row = 0; row < 13; row += 1) {
    assertVectorClose(state.AERODATA[row].slice(0, state.NAERO), expected.AERODATA[row], `${label}.AERODATA[${row}]`, 2e-5, 2e-5);
  }
  assertVectorClose(state.RADD.slice(0, state.NADD), expected.RADD, `${label}.RADD`, 2e-7, 2e-7);
  assertVectorClose(state.UADD.slice(0, state.NADD), expected.UADD, `${label}.UADD`, 2e-7, 2e-7);
  assertVectorClose(state.VADD.slice(0, state.NADD), expected.VADD, `${label}.VADD`, 2e-7, 2e-7);
}

test.before(() => {
  compileFortranDriver();
});

test('SAVE new format is load-compatible with the original Fortran and LOAD matches it', () => {
  const sourceState = buildRestartState();
  const fileName = tempFilePath('xio-save-new');
  let text;
  try {
    text = xio.SAVE(sourceState, fileName).text;
  } finally {
    if (fs.existsSync(fileName)) {
      fs.unlinkSync(fileName);
    }
  }

  const expected = runLoad({ text, initialII: 7, stationAnswer: '' });
  const state = buildLoadState(7);
  const result = xio.LOAD(state, '', { text, analysisStations: 7 });
  assert.equal(result.format, 'new');
  assert.equal(state.NAME.trim(), 'Restart blade');
  assert.ok(result.output || !state.CONV);
  assertLoadedStateClose(state, expected, 'LOAD from JS SAVE');
  assertVectorClose(state.UADDR.slice(0, state.NADD), new Float64Array(state.NADD), 'LOAD leaves UADDR unchanged', 0.0, 0.0);
  assertVectorClose(state.VADDR.slice(0, state.NADD), new Float64Array(state.NADD), 'LOAD leaves VADDR unchanged', 0.0, 0.0);
});

test('SAVEOLD old format is load-compatible with the original Fortran and LOAD falls back correctly', () => {
  const sourceState = buildRestartState();
  const fileName = tempFilePath('xio-save-old');
  let text;
  try {
    text = xio.SAVEOLD(sourceState, fileName).text;
  } finally {
    if (fs.existsSync(fileName)) {
      fs.unlinkSync(fileName);
    }
  }

  const expected = runLoadOld({ text, initialII: 5, stationAnswer: '' });
  const state = buildLoadState(5);
  const result = xio.LOAD(state, '', { text, analysisStations: 5 });
  assert.equal(result.format, 'old');
  assert.equal(state.NAME.trim(), 'Restart blade');
  assertLoadedStateClose(state, expected, 'LOAD fallback from JS SAVEOLD');
});

test('LOAD matches Fortran on Fortran-generated new-format restart files', () => {
  const sourceState = buildRestartState();
  const saved = runSave(sourceState);
  const expected = runLoad({ text: saved.text, initialII: 6, stationAnswer: '' });
  const state = buildLoadState(6);
  const result = xio.LOAD(state, '', { text: saved.text, analysisStations: 6 });
  assert.equal(result.format, 'new');
  assertLoadedStateClose(state, expected, 'LOAD from Fortran SAVE');
});

test('LOADOLD matches Fortran on Fortran-generated old-format restart files', () => {
  const sourceState = buildRestartState();
  const saved = runSaveOld(sourceState);
  const expected = runLoadOld({ text: saved.text, initialII: 5, stationAnswer: '' });
  const state = buildLoadState(5);
  const result = xio.LOADOLD(state, '', { text: saved.text, analysisStations: 5 });
  assert.equal(result.format, 'old');
  assertLoadedStateClose(state, expected, 'LOADOLD from Fortran SAVEOLD');
});

test('RDLINE skips comments and blanks while preserving significant text', () => {
  const cursor = { index: 0 };
  const lines = [
    '! comment',
    '   ',
    '# hash comment',
    'first line',
    '',
    ' second line with leading space',
  ];
  assert.equal(xio.RDLINE(lines, cursor), 'first line');
  assert.equal(xio.RDLINE(lines, cursor), ' second line with leading space');
  assert.equal(xio.RDLINE(lines, cursor), 'END');
});

test('SAVE, SAVEOLD, LOAD, and LOADOLD expose wrapper/error paths', () => {
  const unconverged = buildRestartState();
  unconverged.CONV = false;
  const oldSave = xio.SAVEOLD(unconverged, 'ignored.dat', { mode: 'skip' });
  assert.equal(oldSave.written, false);
  assert.match(oldSave.error, /Converged operating solution/);

  const savePath = tempFilePath('xio-skip');
  fs.writeFileSync(savePath, 'existing\n', 'utf8');
  try {
    const skipped = xio.SAVE(buildRestartState(), savePath, { mode: 'skip' });
    assert.equal(skipped.skipped, true);
  } finally {
    if (fs.existsSync(savePath)) {
      fs.unlinkSync(savePath);
    }
  }

  const loadState = buildLoadState(5);
  const missing = xio.LOAD(loadState, tempFilePath('missing-load'));
  assert.match(missing.error, /not found/);

  const badState = buildLoadState(5);
  const incompatible = xio.LOADOLD(badState, '', { text: 'bad data' });
  assert.match(incompatible.error, /incompatible format/);
});

test('xrotor dispatch now delegates SAVE, SAVO, and LOAD through xio', () => {
  const state = buildRestartState();
  const savePath = tempFilePath('xrotor-save');
  try {
    const saveResult = xrotor.XROTOR(state, { command: 'SAVE', fileName: savePath });
    assert.equal(saveResult.written, true);
    const saveOldPath = tempFilePath('xrotor-saveold');
    const saveOldResult = xrotor.XROTOR(state, { command: 'SAVO', fileName: saveOldPath });
    assert.equal(saveOldResult.written, true);

    const loadState = buildLoadState(5);
    const loadResult = xrotor.XROTOR(loadState, { command: 'LOAD', fileName: savePath, analysisStations: 5 });
    assert.equal(loadResult.format, 'new');

    if (fs.existsSync(saveOldPath)) {
      fs.unlinkSync(saveOldPath);
    }
  } finally {
    if (fs.existsSync(savePath)) {
      fs.unlinkSync(savePath);
    }
  }
});
