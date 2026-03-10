'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const xrotor = require('../js/xrotor.js');
const xoper = require('../js/xoper.js');
const xaero = require('../js/xaero.js');
const { SPLINE } = require('../js/spline.js');
const {
  compileFortranDriver,
  runAtmo,
  runSetx,
  runTinvrt,
  runUvadd,
  runCproj,
  runGetvel,
  runSavvel,
  runNacell,
} = require('./helpers/fortran-xrotor.js');

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

function buildGeometryState(overrides = {}) {
  const state = xrotor.createState({
    II: 5,
    RAD: 1.6,
    VEL: 44.0,
    ADV: 0.72,
    ADW: 0.83,
    XI0: 0.22,
    XITIP: 1.0,
    XW0: 0.22,
    IXSPAC: 2,
    NBLDS: 3,
    DUCT: false,
    URDUCT: 1.0,
    TERSE: true,
    INCR: 2,
    ...overrides,
  });
  xrotor.SETX(state);
  return state;
}

function buildAeroState(overrides = {}) {
  const state = xrotor.createState({
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
    XI0: 0.21,
    XITIP: 1.0,
    XW0: 0.21,
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
    TERSE: false,
    INCR: 2,
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

function buildConvergedState(overrides = {}) {
  const state = buildAeroState(overrides);
  const result = xoper.APER(state, 4, 2, true);
  assert.equal(result.converged, true, 'expected converged state');
  return state;
}

function withPatchedMethod(object, key, replacement, callback) {
  const original = object[key];
  object[key] = replacement;
  try {
    return callback();
  } finally {
    object[key] = original;
  }
}

test.before(() => {
  compileFortranDriver();
});

test('ATMO matches Fortran across interpolation and special branches', () => {
  for (const altitude of [0.0, 7.25, -1.0, 82.0]) {
    const actual = xrotor.ATMO(altitude);
    const expected = runAtmo(altitude);
    assertClose(actual.VSOALT, expected.VSOALT, `ATMO VSOALT @ ${altitude}`, 2e-6, 2e-6);
    assertClose(actual.RHOALT, expected.RHOALT, `ATMO RHOALT @ ${altitude}`, 2e-6, 2e-6);
    assertClose(actual.RMUALT, expected.RMUALT, `ATMO RMUALT @ ${altitude}`, 2e-10, 2e-10);
  }
});

test('SETX matches Fortran for sine and cosine spacing', () => {
  for (const ixspac of [1, 2]) {
    const state = buildGeometryState({ IXSPAC: ixspac });
    const expected = runSetx(state);
    assertClose(state.DT, expected.DT, `SETX DT ${ixspac}`, 2e-7, 2e-7);
    assertVectorClose(state.T.slice(0, state.II), expected.T, `SETX T ${ixspac}`, 2e-7, 2e-7);
    assertVectorClose(state.XI.slice(0, state.II), expected.XI, `SETX XI ${ixspac}`, 2e-7, 2e-7);
    assertVectorClose(state.DXI.slice(0, state.II), expected.DXI, `SETX DXI ${ixspac}`, 2e-7, 2e-7);
    assertVectorClose(state.XV.slice(0, state.II + 1), expected.XV, `SETX XV ${ixspac}`, 2e-7, 2e-7);
  }
});

test('TINVRT matches Fortran for both spacing laws', () => {
  for (const ixspac of [1, 2]) {
    const state = buildGeometryState({ IXSPAC: ixspac });
    const xx = state.XI[2];
    const actual = xrotor.TINVRT(state, xx);
    const expected = runTinvrt(state, xx);
    assertClose(actual, expected, `TINVRT ${ixspac}`, 2e-7, 2e-7);
  }
});

test('UVADD matches Fortran in-range and out-of-range', () => {
  const state = buildGeometryState({
    RAD: 1.8,
    VEL: 52.0,
    NADD: 4,
    RADD: new Float64Array([0.45, 0.85, 1.15, 1.55]),
    UADD: new Float64Array([2.2, 3.1, 2.0, 1.1]),
    VADD: new Float64Array([-0.8, -0.4, 0.1, 0.5]),
  });
  SPLINE(state.UADD, state.UADDR, state.RADD, state.NADD);
  SPLINE(state.VADD, state.VADDR, state.RADD, state.NADD);

  const insideXiw = 0.62;
  const actualInside = xrotor.UVADD(state, insideXiw);
  const expectedInside = runUvadd(state, insideXiw);
  assertClose(actualInside.WA, expectedInside.WA, 'UVADD WA in range', 2e-7, 2e-7);
  assertClose(actualInside.WT, expectedInside.WT, 'UVADD WT in range', 2e-7, 2e-7);

  const actualOutside = xrotor.UVADD(state, 0.1);
  const expectedOutside = runUvadd(state, 0.1);
  assertClose(actualOutside.WA, expectedOutside.WA, 'UVADD WA out of range', 0.0, 0.0);
  assertClose(actualOutside.WT, expectedOutside.WT, 'UVADD WT out of range', 0.0, 0.0);
});

test('CPROJ matches Fortran', () => {
  const state = buildGeometryState({
    ADV: 0.68,
    CH: new Float64Array([0.20, 0.18, 0.16, 0.13, 0.10]),
  });
  for (let i = 0; i < state.II; i += 1) {
    state.VIND[0][i] = 0.015 + 0.004 * i;
    state.VIND[2][i] = 0.035 - 0.003 * i;
  }

  const actual = xrotor.CPROJ(state);
  const expected = runCproj(state);
  assertClose(actual.AX0, expected.AX0, 'CPROJ AX0', 2e-5, 2e-5);
  assertClose(actual.AX1, expected.AX1, 'CPROJ AX1', 2e-5, 2e-5);
  assertClose(actual.AT1, expected.AT1, 'CPROJ AT1', 2e-5, 2e-5);
  assertClose(actual.AT2, expected.AT2, 'CPROJ AT2', 2e-5, 2e-5);
});

test('GETVEL matches Fortran and fills spline storage', () => {
  const text = [
    '0.35 1.50 -0.20',
    '0.70 2.10 -0.10',
    '1.05 1.70 0.15',
    '1.40 1.20 0.40',
  ].join('\n');

  const state = buildGeometryState();
  const actual = xrotor.GETVEL(state, '', { text, axialWeight: 0.85, tangentialWeight: -1.0 });
  const expected = runGetvel({ text, axialWeight: 0.85, tangentialWeight: -1.0 });

  assert.equal(actual.NADD, expected.NADD);
  assertVectorClose(state.RADD.slice(0, state.NADD), expected.RADD, 'GETVEL RADD', 2e-7, 2e-7);
  assertVectorClose(state.UADD.slice(0, state.NADD), expected.UADD, 'GETVEL UADD', 2e-7, 2e-7);
  assertVectorClose(state.VADD.slice(0, state.NADD), expected.VADD, 'GETVEL VADD', 2e-7, 2e-7);
  assertVectorClose(state.UADDR.slice(0, state.NADD), expected.UADDR, 'GETVEL UADDR', 2e-7, 2e-7);
  assertVectorClose(state.VADDR.slice(0, state.NADD), expected.VADDR, 'GETVEL VADDR', 2e-7, 2e-7);
});

test('SAVVEL matches Fortran in ducted slipstream mode', () => {
  const state = buildGeometryState({
    RAD: 1.75,
    VEL: 48.0,
    ADV: 0.66,
    ADW: 0.79,
    URDUCT: 1.08,
    DUCT: true,
    CONV: true,
    NADD: 4,
    RADD: new Float64Array([0.55, 0.95, 1.25, 1.60]),
    UADD: new Float64Array([2.0, 2.6, 2.2, 1.8]),
    VADD: new Float64Array([-0.5, -0.2, 0.0, 0.2]),
    UBODY: new Float64Array([0.03, 0.025, 0.02, 0.01, 0.0]),
    GAM: new Float64Array([0.11, 0.12, 0.10, 0.07, 0.04]),
  });
  SPLINE(state.UADD, state.UADDR, state.RADD, state.NADD);
  SPLINE(state.VADD, state.VADDR, state.RADD, state.NADD);

  const fileName = tempFilePath('xrotor-savvel-js');
  try {
    const actual = xrotor.SAVVEL(state, fileName);
    const expected = runSavvel(state);
    assert.equal(actual.rows.length, expected.rows.length);
    for (let i = 0; i < actual.rows.length; i += 1) {
      assertClose(actual.rows[i].r, expected.rows[i].r, `SAVVEL r[${i}]`, 2e-6, 2e-6);
      assertClose(actual.rows[i].u, expected.rows[i].u, `SAVVEL u[${i}]`, 2e-6, 2e-6);
      assertClose(actual.rows[i].v, expected.rows[i].v, `SAVVEL v[${i}]`, 3e-6, 3e-6);
    }
  } finally {
    if (fs.existsSync(fileName)) {
      fs.unlinkSync(fileName);
    }
  }
});

test('NACELL matches Fortran for file and constant body modes', () => {
  const state = buildGeometryState({
    RAD: 1.55,
    DUCT: true,
    URDUCT: 1.05,
  });

  const bodyText = [
    '0.20 -0.22',
    '0.00 0.00',
    '0.20 -0.08',
    '0.55 0.05',
    '0.95 -0.12',
    '1.40 0.02',
  ].join('\n');

  const actualFile = xrotor.NACELL(state, '', { text: bodyText });
  const expectedFile = runNacell({ state, text: bodyText });
  assertClose(actualFile.XW0, expectedFile.XW0, 'NACELL file XW0', 2e-6, 2e-6);
  assertVectorClose(state.UBODY.slice(0, state.II), expectedFile.UBODY, 'NACELL file UBODY', 2e-6, 2e-6);
  assertVectorClose(state.VBODY.slice(0, state.II), expectedFile.VBODY, 'NACELL file VBODY', 2e-6, 2e-6);
  assertVectorClose(state.XW.slice(0, state.II), expectedFile.XW, 'NACELL file XW', 2e-6, 2e-6);
  assertVectorClose(state.DXW.slice(0, state.II), expectedFile.DXW, 'NACELL file DXW', 2e-6, 2e-6);

  const constState = buildGeometryState({
    RAD: 1.55,
    DUCT: false,
  });
  const actualConst = xrotor.NACELL(constState, 'CONST', { constantUbody: 0.07, constantVbody: 0.0 });
  const expectedConst = runNacell({ state: constState, fileName: 'CONST', constantUbody: 0.07 });
  assertClose(actualConst.XW0, expectedConst.XW0, 'NACELL const XW0', 2e-7, 2e-7);
  assertVectorClose(constState.UBODY.slice(0, constState.II), expectedConst.UBODY, 'NACELL const UBODY', 2e-7, 2e-7);
  assertVectorClose(constState.VBODY.slice(0, constState.II), expectedConst.VBODY, 'NACELL const VBODY', 2e-7, 2e-7);
});

test('SETDEF, GETDEF, and WRTDEF preserve original defaults semantics', () => {
  const state = xrotor.createState();
  xrotor.SETDEF(state);
  const originalSection = xaero.GETAERO(state, 1);

  const defText = [
    '1.11 315.0 1.9e-5',
    '123.0 9.9',
    '0.045 0.088 0.99',
    '800000 0.17',
    '4.8 -3.2 0.77',
    '-0.33',
    '0.41',
    '18 3 1',
    'T F T',
    'T F T',
    'F',
    '0.72 0.02',
  ].join('\n');

  const result = xrotor.GETDEF(state, { text: defText });
  const sectionAfter = xaero.GETAERO(state, 1);
  assert.equal(result.status, 'ok');
  assert.equal(state.II, 18);
  assert.equal(state.INCR, 3);
  assert.equal(state.IXSPAC, 1);
  assert.equal(state.FAST, true);
  assert.equal(state.FREE, false);
  assert.equal(state.DUCT, true);
  assert.equal(state.TERSE, true);
  assert.equal(state.LLAND, false);
  assert.equal(state.LGRID, true);
  assert.equal(state.LVNORM, false);
  assertClose(state.PAR, 0.72, 'GETDEF PAR', 0.0, 0.0);
  assertClose(state.CSIZE, 0.02, 'GETDEF CSIZE', 0.0, 0.0);
  assertClose(sectionAfter.A0, originalSection.A0, 'GETDEF preserves A0', 0.0, 0.0);
  assertClose(sectionAfter.DCLDA, originalSection.DCLDA, 'GETDEF preserves DCLDA', 0.0, 0.0);

  const writePath = tempFilePath('xrotor-def');
  try {
    const writeResult = xrotor.WRTDEF(state, { fileName: writePath });
    assert.equal(writeResult.written, true);
    assert.match(writeResult.text, /1\.11 315 0\.000019/);
  } finally {
    if (fs.existsSync(writePath)) {
      fs.unlinkSync(writePath);
    }
  }
});

test('GETDEF and GETVEL report missing and malformed inputs', () => {
  const state = xrotor.createState();
  xrotor.SETDEF(state);
  const missingDef = xrotor.GETDEF(state, { fileName: tempFilePath('missing-def') });
  assert.equal(missingDef.status, 'missing');

  const badDef = xrotor.GETDEF(state, { text: 'bad defaults' });
  assert.equal(badDef.status, 'error');

  const getvelState = buildGeometryState();
  assert.deepEqual(xrotor.GETVEL(getvelState, '', { text: '0.3 1.0 2.0\n' }), { error: 'New wake velocities not read' });
  assert.deepEqual(xrotor.GETVEL(getvelState, '', { text: '0.3 nope 1.0\n0.5 1.0 2.0' }), { error: 'File read error' });
});

test('INIT resets shared state and falls back cleanly when defaults file is absent', () => {
  const state = xrotor.createState({
    DUCT: true,
    NADD: 5,
    WIND: true,
    IAERO: new Int32Array([9, 9, 9]),
  });
  const missingPath = tempFilePath('no-defaults');
  xrotor.INIT(state, { fileName: missingPath });
  assert.equal(state.DUCT, false);
  assert.equal(state.NADD, 0);
  assert.equal(state.WIND, false);
  assert.equal(state.LROTOR, false);
  assert.equal(state.IAERO[0], 0);
  assert.equal(state.XYOFF[0], 0.0);
});

test('ARBI generates interpolated geometry from dimensional input', () => {
  const state = xrotor.createState({ II: 30 });
  const result = xrotor.ARBI(state, {
    NBLDS: 4,
    VEL: 38.0,
    SGNRAD: -1.8,
    ROOT: 0.36,
    stations: [
      { r: 0.40, chord: 0.22, betaDeg: 38.0 },
      { r: 0.85, chord: 0.18, betaDeg: 27.0 },
      { r: 1.30, chord: 0.12, betaDeg: 17.0 },
      { r: 1.80, chord: 0.08, betaDeg: 11.0 },
    ],
  });
  assert.equal(state.NBLDS, 4);
  assert.equal(state.VEL, 38.0);
  assert.ok(result.ADV >= 0.1);
  assert.ok(state.CH[0] > 0.0);
  assert.ok(state.BETA0[2] > state.BETA0[4]);
});

test('REINIT and RESPACI update state and reuse APER results', () => {
  const reinitState = buildGeometryState({
    RAD: 1.5,
    VEL: 40.0,
    ADV: 0.64,
    TERSE: true,
    CH: new Float64Array([0.18, 0.16, 0.14, 0.11, 0.09]),
    BETA: new Float64Array([0.52, 0.47, 0.39, 0.31, 0.24]),
    BETA0: new Float64Array([0.51, 0.46, 0.38, 0.30, 0.23]),
    TTOT: 0.32,
    PTOT: 0.48,
    QTOT: 0.31,
    TWAK: 0.29,
    PWAK: 0.44,
    TVIS: 0.03,
    PVIS: 0.04,
    RHO: 1.225,
    VSO: 340.0,
    RMU: 1.8e-5,
  });
  const reinitResult = withPatchedMethod(xoper, 'APER', (state) => {
    state.CONV = true;
    return { converged: true };
  }, () => xrotor.REINIT(reinitState, { rpm: 1100.0, restoreAngles: true }));
  assert.equal(reinitResult.converged, true);
  assert.equal(reinitState.CONV, true);
  assert.equal(reinitResult.output.converged, true);
  assertClose(reinitState.BETA0[0], reinitState.BETA[0], 'REINIT restore BETA0', 0.0, 0.0);

  const respaciState = buildGeometryState({
    II: 4,
    XI0: 0.20,
    XITIP: 1.0,
    XW0: 0.20,
    TERSE: true,
    CH: new Float64Array([0.20, 0.17, 0.13, 0.10]),
    BETA: new Float64Array([0.60, 0.48, 0.33, 0.21]),
    BETA0: new Float64Array([0.60, 0.48, 0.33, 0.21]),
    UBODY: new Float64Array([0.02, 0.015, 0.008, 0.0]),
    CL: new Float64Array([0.55, 0.50, 0.42, 0.34]),
    TTOT: 0.35,
    PTOT: 0.52,
    QTOT: 0.33,
    TWAK: 0.30,
    PWAK: 0.45,
    TVIS: 0.05,
    PVIS: 0.07,
    RHO: 1.225,
    VSO: 340.0,
    RMU: 1.8e-5,
  });
  xrotor.SETX(respaciState);
  const respaciResult = withPatchedMethod(xoper, 'APER', (state) => {
    state.CONV = true;
    for (let i = 0; i < state.II; i += 1) {
      state.CL[i] = 0.40 + 0.01 * i;
    }
    return { converged: true };
  }, () => xrotor.RESPACI(respaciState, 6));
  assert.equal(respaciResult.converged, true);
  assert.equal(respaciState.II, 6);
  assert.equal(respaciState.LROTOR, true);
  assertClose(respaciState.CLDES[0], 0.40, 'RESPACI CLDES[0]', 0.0, 0.0);
  assert.ok(respaciResult.output.summary.RPM > 0.0);
});

test('INTE and OPFILE expose structured wrapper behavior', () => {
  const state = buildGeometryState({
    RAD: 1.45,
    CH: new Float64Array([0.19, 0.17, 0.145, 0.12, 0.10]),
    BETA0: new Float64Array([0.58, 0.49, 0.38, 0.29, 0.20]),
    CL: new Float64Array([0.62, 0.57, 0.49, 0.41, 0.33]),
  });
  const inte = xrotor.INTE(state, { radii: [0.32, 0.58, 0.90] });
  assert.equal(inte.rows.length, 3);
  assert.ok(inte.rows[0].chord > inte.rows[2].chord);
  assert.ok(inte.rows[1].beta0Deg > inte.rows[2].beta0Deg);

  const existingPath = tempFilePath('xrotor-opfile');
  fs.writeFileSync(existingPath, 'existing\n', 'utf8');
  try {
    const overwrite = xrotor.OPFILE(0, existingPath);
    assert.equal(overwrite.mode, 'overwrite');
    const redirected = xrotor.OPFILE(0, existingPath, { mode: 'new', newFileName: `${existingPath}.new` });
    assert.equal(redirected.fileName, `${existingPath}.new`);
    assert.throws(() => xrotor.OPFILE(0, '', {}), /missing output filename/);
  } finally {
    if (fs.existsSync(existingPath)) {
      fs.unlinkSync(existingPath);
    }
  }
});

test('OUTPUT returns stable summary and row data for a converged rotor', () => {
  const state = buildConvergedState();
  const output = xrotor.OUTPUT(state);
  assert.equal(output.converged, true);
  assert.equal(output.solutionType, 'Free Tip Graded Momentum');
  assert.ok(Math.abs(output.summary.TDIM) > 0.0);
  assert.ok(Math.abs(output.summary.PDIM) > 0.0);
  assert.ok(output.summary.RPM > 0.0);
  assert.ok(output.rows.length >= 2);
  assert.ok(output.rows[0].MACH > 0.0);

  const helicopterState = buildConvergedState({
    ADV: 0.08,
    ADW: 0.11,
  });
  const helicopterOutput = xrotor.OUTPUT(helicopterState);
  assert.ok(helicopterOutput.helicopter);
  assert.ok(Number.isFinite(helicopterOutput.helicopter.FOM));
});

test('NACELL and SAVVEL surface JS-side error paths', () => {
  const nacellState = buildGeometryState();
  assert.deepEqual(xrotor.NACELL(nacellState, '', { fileName: tempFilePath('missing-nacell') }), {
    error: 'Nacelle data file OPEN error',
    UBODY: nacellState.UBODY,
  });

  const savvelState = buildGeometryState({ CONV: false });
  assert.throws(() => xrotor.SAVVEL(savvelState), /Must define operating point first/);
});

test('XROTOR dispatch covers command wrappers and hook handoff', () => {
  const state = buildGeometryState();
  const calls = [];
  const hooks = {
    DESI: () => ({ hook: 'DESI' }),
    MODI: () => ({ hook: 'MODI' }),
    BEND: () => ({ hook: 'BEND' }),
    INTF: () => ({ hook: 'INTF' }),
    SAVE: () => ({ hook: 'SAVE' }),
    SAVO: () => ({ hook: 'SAVO' }),
    LOAD: () => ({ hook: 'LOAD' }),
    JMAP: () => ({ hook: 'JMAP' }),
    NOIS: () => ({ hook: 'NOIS' }),
    AERO: () => ({ hook: 'AERO' }),
    OPER: () => ({ hook: 'OPER' }),
  };
  hooks.DESI = () => { calls.push('DESI'); return { hook: 'DESI' }; };
  hooks.MODI = () => { calls.push('MODI'); return { hook: 'MODI' }; };
  hooks.BEND = () => { calls.push('BEND'); return { hook: 'BEND' }; };
  hooks.INTF = () => { calls.push('INTF'); return { hook: 'INTF' }; };
  hooks.SAVE = () => { calls.push('SAVE'); return { hook: 'SAVE' }; };
  hooks.SAVO = () => { calls.push('SAVO'); return { hook: 'SAVO' }; };
  hooks.LOAD = () => { calls.push('LOAD'); return { hook: 'LOAD' }; };
  hooks.JMAP = () => { calls.push('JMAP'); return { hook: 'JMAP' }; };
  hooks.NOIS = () => { calls.push('NOIS'); return { hook: 'NOIS' }; };
  hooks.AERO = () => { calls.push('AERO'); return { hook: 'AERO' }; };
  hooks.OPER = () => { calls.push('OPER'); return { hook: 'OPER' }; };

  assert.deepEqual(xrotor.XROTOR(state, { command: 'AERO' }, hooks), { hook: 'AERO' });
  assert.deepEqual(xrotor.XROTOR(state, { command: 'OPER' }, hooks), { hook: 'OPER' });
  assert.deepEqual(xrotor.XROTOR(state, { command: 'DESI' }, hooks), { hook: 'DESI' });
  assert.deepEqual(xrotor.XROTOR(state, { command: 'MODI' }, hooks), { hook: 'MODI' });
  assert.deepEqual(xrotor.XROTOR(state, { command: 'BEND' }, hooks), { hook: 'BEND' });
  assert.deepEqual(xrotor.XROTOR(state, { command: 'INTF' }, hooks), { hook: 'INTF' });
  assert.deepEqual(xrotor.XROTOR(state, { command: 'SAVE' }, hooks), { hook: 'SAVE' });
  assert.deepEqual(xrotor.XROTOR(state, { command: 'SAVO' }, hooks), { hook: 'SAVO' });
  assert.deepEqual(xrotor.XROTOR(state, { command: 'LOAD' }, hooks), { hook: 'LOAD' });
  assert.deepEqual(xrotor.XROTOR(state, { command: 'JMAP' }, hooks), { hook: 'JMAP' });
  assert.deepEqual(xrotor.XROTOR(state, { command: 'NOIS' }, hooks), { hook: 'NOIS' });

  assert.deepEqual(xrotor.XROTOR(state, { command: 'NAME', value: 'Case A' }, hooks), { NAME: 'Case A' });
  assert.equal(xrotor.XROTOR(state, { command: 'WIND' }).WIND, true);
  assert.equal(xrotor.XROTOR(state, { command: 'VCLR' }).NADD, 0);
  assert.equal(xrotor.XROTOR(state, { command: 'II', value: 7 }).II, 7);
  assert.equal(xrotor.XROTOR(state, { command: 'INCR', value: 3 }).INCR, 3);
  assert.equal(xrotor.XROTOR(state, { command: 'REIN' }).converged, false);
  assert.equal(xrotor.XROTOR(state, { command: 'DUCT', value: 1.12 }).DUCT, true);
  assert.equal(xrotor.XROTOR(state, { command: 'VRAT', value: 1.15 }).URDUCT, 1.15);
  assert.ok(xrotor.XROTOR(state, { command: 'PLOP' }).SIZE > 0.0);
  assert.deepEqual(calls.sort(), ['AERO', 'BEND', 'DESI', 'INTF', 'JMAP', 'LOAD', 'MODI', 'NOIS', 'OPER', 'SAVE', 'SAVO'].sort());

  assert.throws(() => xrotor.XROTOR(buildGeometryState(), { command: 'VRAT', value: 1.1 }), /select duct option first/);
  assert.throws(() => xrotor.XROTOR(state, { command: 'UNKNOWN' }), /unsupported command/);
});
