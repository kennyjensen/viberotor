'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const xdesi = require('../js/xdesi.js');
const xrotor = require('../js/xrotor.js');
const xaero = require('../js/xaero.js');
const xoper = require('../js/xoper.js');
const { compileFortranDriver, runDesgen, runDesini, runDeiter, runDesmil, runSetcldLinear, runSetcldFile, runSavcld } = require('./helpers/fortran-xdesi.js');

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

function plotEvent(actualX, actualY, XOFF, XSF, YOFF, YSF, key = '') {
  return {
    x: XSF * (actualX - XOFF),
    y: YSF * (actualY - YOFF),
    key,
  };
}

function buildDesiState() {
  const state = xrotor.createState();
  xrotor.SETDEF(state);
  state.NAME = 'XDESI DRIVER';
  state.II = 5;
  state.NBLDS = 3;
  state.NAERO = 2;
  state.FAST = false;
  state.FREE = true;
  state.DUCT = false;
  state.WIND = false;
  state.VRTX = false;
  state.DEST = true;
  state.DESP = false;
  state.LDESINI = true;
  state.LROTOR = false;
  state.NITERD = 12;
  state.NITERA = 12;
  state.ADWFCTR = 1.0;
  state.URDUCT = 1.0;
  state.PAR = 0.6;
  state.CSIZE = 0.014;
  state.SIZE = 10.0;
  state.SCRNFR = 0.70;
  state.IDEV = 1;
  state.IDEVRP = 2;
  state.IPSLU = 0;
  state.LPLOT = false;
  state.LLAND = true;
  state.LGRID = true;
  state.XYOFF[0] = 0.0;
  state.XYOFF[1] = 0.0;
  state.XYFAC[0] = 1.0;
  state.XYFAC[1] = 1.0;
  state.RADDES = 1.45;
  state.R0DES = 0.32;
  state.RWDES = 0.35;
  state.VELDES = 42.0;
  state.ADVDES = 0.69;
  state.RPMDES = 0.0;
  state.TDDES = 180.0;
  state.PDDES = 0.0;
  state.CLDES0 = 0.0;
  state.XITIP = 1.0;
  state.XI0 = state.R0DES / state.RADDES;
  state.XW0 = state.RWDES / state.RADDES;
  state.IINF = state.II + Math.trunc(state.II / 2);

  xaero.PUTAERO(state, 1, 0.28, -0.04, 1.32, -1.05, 5.8, 1.15, 0.18, 0.010, 0.28, 0.020, -0.08, 0.71, 1.9e6, -0.14);
  xaero.PUTAERO(state, 2, 0.82, -0.025, 1.18, -0.92, 5.5, 1.00, 0.16, 0.012, 0.24, 0.024, -0.06, 0.68, 2.2e6, -0.12);
  xaero.SETIAERO(state);

  xrotor.SETX(state);
  xdesi.SETCLD(state, 0.65, 0.55);
  return state;
}

function prepareDesignRun(state) {
  state.CONV = false;
  state.RAD = state.RADDES;
  state.VEL = state.VELDES;
  state.ADV = state.ADVDES === 0.0
    ? state.VELDES / (state.RADDES * state.RPMDES * xoper.PI / 30.0)
    : state.ADVDES;
  state.TDES = state.TDDES / (state.RHO * state.VEL ** 2 * state.RAD ** 2);
  state.PDES = state.PDDES / (state.RHO * state.VEL ** 3 * state.RAD ** 2);
  state.XI0 = state.R0DES / state.RAD;
  state.XW0 = state.RWDES / state.RAD;
  xrotor.SETX(state);
  xoper.XWINIT(state);
  for (let i = 0; i < state.II; i += 1) {
    state.CL[i] = state.CLDES[i];
    state.STALL[i] = false;
  }
  state.EFFINV = 1.0;
  if (state.FREE && state.DEST) {
    state.EFFINV = 0.50 * Math.sqrt(Math.abs(1.0 + state.TDES * 2.0 / xoper.PI)) + 0.50;
  }
  if (state.FREE && state.DESP) {
    state.EFFINV = 0.25 * Math.sqrt(Math.abs(1.0 + state.PDES * 4.0 / xoper.PI)) + 0.75;
  }
  state.ADW = state.EFFINV * state.ADV;
}

function assertDesiStateClose(state, expected, label) {
  assert.equal(state.CONV, expected.CONV, `${label}.CONV`);
  assert.equal(state.NBLDS, expected.NBLDS, `${label}.NBLDS`);
  assert.equal(state.II, expected.II, `${label}.II`);
  for (const field of ['RAD', 'VEL', 'ADV', 'XI0', 'XW0', 'ADW', 'EFFINV', 'TDES', 'PDES', 'TTOT', 'PTOT', 'RADDES', 'R0DES', 'RWDES', 'VELDES', 'ADVDES', 'RPMDES', 'TDDES', 'PDDES', 'CLDES0']) {
    assertClose(state[field], expected[field], `${label}.${field}`, 4e-6, 4e-6);
  }
  for (const field of ['CH', 'BETA', 'BETA0', 'CLDES', 'CL', 'GAM', 'XI', 'DXI', 'XW', 'DXW']) {
    assertVectorClose(state[field].slice(0, state.II), expected[field], `${label}.${field}`, 4e-6, 4e-6);
  }
}

function parseClFile(text) {
  return text.trim().split(/\r?\n/).map((line) => line.trim().split(/\s+/).map(Number));
}

test.before(() => {
  compileFortranDriver();
});

test('SETCLD matches Fortran for linear and file-driven CL distributions', () => {
  const linearState = buildDesiState();
  xdesi.SETCLD(linearState, 0.72, 0.51);
  {
    const expected = runSetcldLinear(0.72, 0.51);
    assert.equal(linearState.II, expected.II);
    assertVectorClose(linearState.XI.slice(0, linearState.II), expected.XI, 'SETCLD linear.XI', 4e-6, 4e-6);
    assertVectorClose(linearState.CLDES.slice(0, linearState.II), expected.CLDES, 'SETCLD linear.CLDES', 4e-6, 4e-6);
  }

  const fileState = buildDesiState();
  const fileText = [
    '0.20 0.74',
    '0.45 0.68',
    '0.70 0.59',
    '1.00 0.52',
    '',
  ].join('\n');
  xdesi.SETCLD(fileState, 999.0, 999.0, { text: fileText });
  {
    const expected = runSetcldFile(fileText);
    assert.equal(fileState.II, expected.II);
    assertVectorClose(fileState.XI.slice(0, fileState.II), expected.XI, 'SETCLD file.XI', 4e-6, 4e-6);
    assertVectorClose(fileState.CLDES.slice(0, fileState.II), expected.CLDES, 'SETCLD file.CLDES', 4e-6, 4e-6);
  }
});

test('DESINI matches Fortran for the initialized MIL design state', () => {
  const state = buildDesiState();
  prepareDesignRun(state);
  xdesi.DESINI(state);
  assertDesiStateClose(state, runDesini(), 'DESINI');
});

test('DEITER matches Fortran for the fixed-CL design solve', () => {
  const state = buildDesiState();
  prepareDesignRun(state);
  xdesi.DESINI(state);
  xdesi.DEITER(state, 2);
  assertDesiStateClose(state, runDeiter(2), 'DEITER');
});

test('DESMIL matches Fortran for the fixed-chord twist/CL optimization solve', () => {
  const state = buildDesiState();
  prepareDesignRun(state);
  xdesi.DESINI(state);
  xdesi.DESMIL(state, 3);
  assertDesiStateClose(state, runDesmil(3), 'DESMIL');
});

test('DESGEN matches Fortran for the end-to-end design generation path', () => {
  const state = buildDesiState();
  const result = xdesi.DESGEN(state, { force: true });
  assert.equal(result.converged, true);
  assertDesiStateClose(state, runDesgen(), 'DESGEN');
});

test('SAVCLD produces the same CL table as the original Fortran', () => {
  const state = buildDesiState();
  const actual = xdesi.SAVCLD(state, { fileName: path.join(process.cwd(), 'build', 'xdesi-savcld-js.dat') });
  const expected = runSavcld();
  const actualPairs = parseClFile(actual.text);
  const expectedPairs = parseClFile(expected);
  assert.equal(actualPairs.length, expectedPairs.length);
  for (let i = 0; i < actualPairs.length; i += 1) {
    assertClose(actualPairs[i][0], expectedPairs[i][0], `SAVCLD.XI[${i}]`, 5e-7, 5e-7);
    assertClose(actualPairs[i][1], expectedPairs[i][1], `SAVCLD.CLDES[${i}]`, 5e-7, 5e-7);
  }
});

test('MODCL applies cursor-driven CLDES edits and clears CLDES0 when a segment changes', () => {
  const state = buildDesiState();
  state.CLDES0 = 0.6;
  const events = [
    plotEvent(0.78, 0.56, 0.0, 1.0, 0.0, 1.0),
    plotEvent(0.35, 0.74, 0.0, 1.0, 0.0, 1.0),
    plotEvent(0.58, 0.63, 0.0, 1.0, 0.0, 1.0),
    plotEvent(0.82, 0.54, 0.0, 1.0, 0.0, 1.0),
    plotEvent(0.82, 0.55, 0.0, 1.0, 0.0, 1.0),
    plotEvent(0.82, 0.56, 0.0, 1.0, 0.0, 1.0),
  ];
  const before = state.CLDES.slice();
  const result = xdesi.MODCL(state, { events });
  assert.ok(result.plot.plot.points.length > 0);
  assert.ok(result.cursor.previewCurve.length > 0);
  assert.equal(state.CLDES0, 0.0);
  assert.notDeepEqual(Array.from(state.CLDES.slice(0, state.II)), Array.from(before.slice(0, state.II)));
});

test('DESI wrapper commands cover input, edit, atmosphere, plot, and error paths', () => {
  const state = buildDesiState();

  const help = xdesi.DESI(state, {});
  assert.ok(help.commands.length > 5);

  const formGrad = xdesi.DESI(state, { subcommand: 'FORM', formCommand: 'GRAD' });
  assert.equal(formGrad.FAST, true);
  const formPot = xdesi.DESI(state, { subcommand: 'FORM', formCommand: 'POT' });
  assert.equal(formPot.VRTX, false);
  const formVortex = xdesi.DESI(state, { subcommand: 'FORM', formCommand: 'VRTX' });
  assert.equal(formVortex.VRTX, true);
  const freeBefore = state.FREE;
  xdesi.DESI(state, { subcommand: 'FORM', formCommand: 'WAKE' });
  assert.equal(state.FREE, !freeBefore);

  const inputOnly = xdesi.DESI(state, {
    subcommand: 'INPU',
    generate: false,
    nblades: 4,
    tipRadius: 1.7,
    hubRadius: 0.26,
    wakeRadius: 0.31,
    airspeed: 44.0,
    advanceRatio: 0.73,
    thrust: 210.0,
    liftCoefficient: 0.62,
  });
  assert.equal(inputOnly.parameters.NBLDS, 4);
  assert.equal(inputOnly.generated, null);

  const editHelp = xdesi.DESI(state, { subcommand: 'EDIT', editCommand: 'HELP' });
  assert.ok(editHelp.commands.length > 5);
  const editCC = xdesi.DESI(state, { subcommand: 'EDIT', editCommand: 'CC', value: 0.58 });
  assertClose(editCC.CLDES0, 0.58, 'DESI EDIT CC', 0.0, 0.0);
  const editCL = xdesi.DESI(state, { subcommand: 'EDIT', editCommand: 'CL', root: 0.71, tip: 0.49 });
  assertClose(editCL.CLDES0, 0.60, 'DESI EDIT CL average', 2e-6, 2e-6);

  const clFile = [
    '0.20 0.73',
    '0.40 0.68',
    '0.80 0.57',
    '1.00 0.50',
    '',
  ].join('\n');
  const editCR = xdesi.DESI(state, { subcommand: 'EDIT', editCommand: 'CR', text: clFile });
  assert.equal(editCR.mode, 'file');

  const saved = xdesi.DESI(state, {
    subcommand: 'EDIT',
    editCommand: 'CW',
    fileName: path.join(process.cwd(), 'build', 'xdesi-wrapper-cl.dat'),
    overwrite: true,
  });
  assert.equal(saved.written, true);

  const cursorEdited = xdesi.DESI(state, {
    subcommand: 'EDIT',
    editCommand: 'CX',
    events: [
      plotEvent(0.78, 0.55, 0.0, 1.0, 0.0, 1.0),
      plotEvent(0.42, 0.72, 0.0, 1.0, 0.0, 1.0),
      plotEvent(0.62, 0.63, 0.0, 1.0, 0.0, 1.0),
      plotEvent(0.86, 0.54, 0.0, 1.0, 0.0, 1.0),
      plotEvent(0.86, 0.55, 0.0, 1.0, 0.0, 1.0),
      plotEvent(0.86, 0.56, 0.0, 1.0, 0.0, 1.0),
    ],
  });
  assert.ok(cursorEdited.cursor.previewCurve.length > 0);

  const atmo = xdesi.DESI(state, { subcommand: 'ATMO', value: 1.5 });
  assert.ok(atmo.VSOALT > 0.0);
  const terseBefore = state.TERSE;
  const terse = xdesi.DESI(state, { subcommand: 'TERS' });
  assert.equal(terse.TERSE, !terseBefore);
  const named = xdesi.DESI(state, { subcommand: 'NAME', value: 'Edited design' });
  assert.equal(named.NAME, 'Edited design');

  const iter = xdesi.DESI(state, { subcommand: 'ITER', value: 19 });
  assert.equal(iter.NITERD, 19);
  const resized = xdesi.DESI(state, { subcommand: 'SIZE', value: 11.5 });
  assertClose(resized.SIZE, 11.5, 'DESI SIZE', 0.0, 0.0);

  const nRespaced = xdesi.DESI(state, { subcommand: 'N', value: 7 });
  assert.equal(nRespaced.II, 7);

  const plot1 = xdesi.DESI(state, { subcommand: 'PLOT', plotNumber: 1 });
  assert.equal(plot1.routine, 'GEOPLT');
  const plotCancel = xdesi.DESI(state, { subcommand: 'PLOT', plotNumber: 0 });
  assert.equal(plotCancel.cancelled, true);
  const noSlipstream = buildDesiState();
  noSlipstream.NADD = 0;
  const plot10 = xdesi.DESI(noSlipstream, { subcommand: 'PLOT', plotNumber: 10 });
  assert.match(plot10.error, /No slipstream profiles present/);
  assert.throws(() => xdesi.DESI(state, { subcommand: 'PLOT', plotNumber: 99 }), /unsupported plot number/);

  const annoError = xdesi.DESI(state, { subcommand: 'ANNO' });
  assert.match(annoError.error, /No current plot/);
  state.LPLOT = true;
  assert.equal(xdesi.DESI(state, { subcommand: 'ANNO' }).annotated, true);
  assert.equal(xdesi.DESI(state, { subcommand: 'HARD' }).hardcopy, true);

  const display = xdesi.DESI(state, { subcommand: 'DISP' });
  assert.ok(display.summary);

  assert.throws(() => xdesi.DESI(state, { subcommand: 'BOGUS' }), /unsupported command BOGUS/);
  assert.throws(() => xdesi.DESI(state, { subcommand: 'EDIT', editCommand: '???' }), /unsupported parameter/);
});

test('DESGEN reports stall-limit and Betz-limit guard paths', () => {
  const stallState = buildDesiState();
  for (let i = 0; i < stallState.II; i += 1) {
    stallState.CLDES[i] = 2.0;
  }
  const stall = xdesi.DESGEN(stallState);
  assert.match(stall.error, /past stall limit/);

  const betzState = buildDesiState();
  betzState.TDDES = -100000.0;
  betzState.DEST = true;
  betzState.DESP = false;
  const betz = xdesi.DESGEN(betzState);
  assert.equal(betz.requiresConfirmation, true);
});

test('xrotor dispatch now delegates DESI through xdesi', () => {
  const state = buildDesiState();
  const result = xrotor.XROTOR(state, { command: 'DESI', subcommand: 'SIZE', value: 9.75 });
  assertClose(result.SIZE, 9.75, 'XROTOR DESI SIZE', 0.0, 0.0);
});
