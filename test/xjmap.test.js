'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const xjmap = require('../js/xjmap.js');
const xrotor = require('../js/xrotor.js');
const xdesi = require('../js/xdesi.js');
const xaero = require('../js/xaero.js');
const xoper = require('../js/xoper.js');
const { compileFortranDriver, runJmap } = require('./helpers/fortran-xinte-jmap.js');

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
  assert.equal(actual.length, expected.length, `${label}: row mismatch`);
  for (let i = 0; i < actual.length; i += 1) {
    assertVectorClose(actual[i], expected[i], `${label}[${i}]`, absTol, relTol);
  }
}

function buildGeneratedState() {
  const state = xrotor.createState();
  xrotor.SETDEF(state);
  state.NAME = 'XINTE JMAP DRIVER';
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
  const result = xdesi.DESGEN(state, { force: true });
  assert.equal(result.converged, true, 'expected generated state to converge');
  return state;
}

function tempFilePath(name, extension = '.bin') {
  const buildDir = path.join(__dirname, '..', 'build');
  fs.mkdirSync(buildDir, { recursive: true });
  return path.join(buildDir, `${name}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}${extension}`);
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

test('JMAP matches the Fortran dump contents and final state mutation', () => {
  const state = buildGeneratedState();
  const params = {
    rj1: 2.0,
    rj2: 2.3,
    rjinc: 0.1,
    cp1: 0.06,
    cp2: 0.14,
    cpinc: 0.02,
  };
  const fileName = tempFilePath('xjmap-js');
  try {
    const actual = xjmap.JMAP(state, { ...params, fileName });
    const actualDump = xjmap.parseJMAPDump(fileName);
    const expected = runJmap(params);

    assert.equal(actual.written, true);
    assert.equal(actualDump.NRJ, expected.dump.NRJ);
    assert.equal(actualDump.NCP, expected.dump.NCP);
    assert.equal(actualDump.NAME, expected.dump.NAME);
    assertClose(actualDump.RE6OverRJ, expected.dump.RE6OverRJ, 'JMAP.RE6OverRJ', 5e-6, 5e-6);
    assertClose(actualDump.AMACHOverRJ, expected.dump.AMACHOverRJ, 'JMAP.AMACHOverRJ', 5e-6, 5e-6);
    assertVectorClose(actualDump.KLOW, expected.dump.KLOW, 'JMAP.KLOW', 0.0, 0.0);
    assertVectorClose(actualDump.KUPP, expected.dump.KUPP, 'JMAP.KUPP', 0.0, 0.0);
    assertVectorClose(actualDump.RJ, expected.dump.RJ, 'JMAP.RJ', 5e-6, 5e-6);
    assertVectorClose(actualDump.CP, expected.dump.CP, 'JMAP.CP', 5e-6, 5e-6);
    assertMatrixClose(actualDump.EF, expected.dump.EF, 'JMAP.EF', 4e-5, 4e-5);
    assertMatrixClose(actualDump.BE, expected.dump.BE, 'JMAP.BE', 4e-5, 4e-5);

    assertClose(state.ADV, expected.ADV, 'JMAP final ADV', 5e-6, 5e-6);
    assertClose(state.VEL, expected.VEL, 'JMAP final VEL', 5e-5, 5e-5);
    assertVectorClose(state.BETA.slice(0, state.II), expected.BETA, 'JMAP restored BETA', 5e-6, 5e-6);
  } finally {
    if (fs.existsSync(fileName)) {
      fs.unlinkSync(fileName);
    }
  }
});

test('JMAP handles zero increments, dispatcher routing, and overflow clamps', () => {
  const state = buildGeneratedState();
  assert.deepEqual(xjmap.JMAP(state, { rj1: 2.0, rj2: 2.3, rjinc: 0.0, cp1: 0.06, cp2: 0.14, cpinc: 0.02 }), {
    cancelled: 'J increment is zero',
  });
  assert.deepEqual(xjmap.JMAP(state, { rj1: 2.0, rj2: 2.3, rjinc: 0.1, cp1: 0.06, cp2: 0.14, cpinc: 0.0 }), {
    cancelled: 'Cp increment is zero',
  });

  const routedFile = tempFilePath('xjmap-routed');
  try {
    const routed = xrotor.XROTOR(buildGeneratedState(), {
      command: 'JMAP',
      rj1: 2.0,
      rj2: 2.1,
      rjinc: 0.1,
      cp1: 0.08,
      cp2: 0.10,
      cpinc: 0.02,
      fileName: routedFile,
    });
    assert.equal(routed.written, true);
    assert.equal(routed.RJ.length, 2);
    assert.equal(routed.CP.length, 2);
  } finally {
    if (fs.existsSync(routedFile)) {
      fs.unlinkSync(routedFile);
    }
  }

  const overflowFile = tempFilePath('xjmap-overflow');
  try {
    const overflowState = buildGeneratedState();
    withPatchedMethod(xoper, 'APER', (patchedState) => {
      patchedState.CONV = true;
      patchedState.TTOT = 0.75;
      patchedState.PTOT = 1.0;
      return { converged: true, history: [] };
    }, () => {
      const result = xjmap.JMAP(overflowState, {
        rj1: 2.0,
        rj2: 2.100,
        rjinc: 0.001,
        cp1: 0.06,
        cp2: 0.141,
        cpinc: 0.001,
        fileName: overflowFile,
      });
      assert.equal(result.RJ.length, 91);
      assert.equal(result.CP.length, 81);
    });
  } finally {
    if (fs.existsSync(overflowFile)) {
      fs.unlinkSync(overflowFile);
    }
  }
});
