'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const xinte = require('../js/xinte.js');
const xrotor = require('../js/xrotor.js');
const xdesi = require('../js/xdesi.js');
const xaero = require('../js/xaero.js');
const { PI } = require('../js/xoper.js');
const { compileFortranDriver, runInte1, runInte2 } = require('./helpers/fortran-xinte-jmap.js');

function assertClose(actual, expected, label, absTol = 1e-6, relTol = 1e-6) {
  const diff = Math.abs(actual - expected);
  const limit = Math.max(absTol, relTol * Math.abs(expected));
  assert.ok(
    diff <= limit,
    `${label}: expected ${expected}, got ${actual}, diff ${diff}, limit ${limit}`,
  );
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

function tempFilePath(name) {
  const buildDir = path.join(__dirname, '..', 'build');
  fs.mkdirSync(buildDir, { recursive: true });
  return path.join(buildDir, `${name}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.dat`);
}

test.before(() => {
  compileFortranDriver();
});

test('INTE1 matches Fortran across sub-root interpolation and effective-radius corrections', () => {
  const state = buildGeneratedState();
  const stations = [
    { rOverR: 0.18, aolDeg: -2.0 },
    { rOverR: 0.34, aolDeg: 0.5 },
    { rOverR: 0.68, aolDeg: 1.25 },
    { rOverR: 0.92, aolDeg: -0.75 },
  ];

  const actual = xinte.INTE1(state, { stations });
  const expected = runInte1(stations);

  assert.equal(actual.rows.length, expected.rows.length);
  for (let i = 0; i < actual.rows.length; i += 1) {
    const row = actual.rows[i];
    const ref = expected.rows[i];
    assertClose(row.rOverR, ref.rOverR, `INTE1.rOverR[${i}]`, 4e-6, 4e-6);
    assertClose(row.cOverR, ref.cOverR, `INTE1.cOverR[${i}]`, 4e-6, 4e-6);
    assertClose(row.betaBaseRad, ref.betaBaseRad, `INTE1.betaBaseRad[${i}]`, 5e-6, 5e-6);
    assertClose(row.CL, ref.CL, `INTE1.CL[${i}]`, 5e-6, 5e-6);
    assertClose(row.dynamicPressure, ref.dynamicPressure, `INTE1.q[${i}]`, 5e-5, 5e-5);
    assertClose(row.aolDeg, ref.aolDeg, `INTE1.aol[${i}]`, 0.0, 0.0);
    assertClose(row.betaOlDeg, ref.betmodRad * 180.0 / PI, `INTE1.betaOlDeg[${i}]`, 6e-3, 6e-3);
    assertClose(row.cmodOverR, ref.cmodOverR, `INTE1.cmodOverR[${i}]`, 5e-6, 5e-6);
  }
});

test('INTE2 matches Fortran and writes the same structured station table branch', () => {
  const state = buildGeneratedState();
  const stations = [
    { rOverR: 0.18, aolDeg: -1.5 },
    { rOverR: 0.40, aolDeg: 0.0 },
    { rOverR: 0.74, aolDeg: 1.0 },
    { rOverR: 0.98, aolDeg: 2.0 },
  ];

  const actual = xinte.INTE2(state, { stations });
  const expected = runInte2(stations);

  assert.equal(actual.rows.length, expected.rows.length);
  for (let i = 0; i < actual.rows.length; i += 1) {
    const row = actual.rows[i];
    const ref = expected.rows[i];
    assertClose(row.rOverR, ref.rOverR, `INTE2.rOverR[${i}]`, 4e-6, 4e-6);
    assertClose(row.cOverR, ref.cOverR, `INTE2.cOverR[${i}]`, 4e-6, 4e-6);
    assertClose(row.betaBaseRad, ref.betaBaseRad, `INTE2.betaBaseRad[${i}]`, 5e-6, 5e-6);
    assertClose(row.CL, ref.CL, `INTE2.CL[${i}]`, 5e-6, 5e-6);
    assertClose(row.dynamicPressure, ref.dynamicPressure, `INTE2.q[${i}]`, 5e-5, 5e-5);
    assertClose(row.aolDeg, ref.aolDeg, `INTE2.aol[${i}]`, 0.0, 0.0);
    assertClose(row.xteIn, ref.xteOverR * state.RAD * 100.0 / 2.54, `INTE2.xteIn[${i}]`, 5e-5, 5e-5);
  }
});

test('INTE save mode writes a disk file and xrotor dispatch routes INTF to the real port', () => {
  const state = buildGeneratedState();
  const stations = [
    { rOverR: 0.30, aolDeg: 0.0 },
    { rOverR: 0.60, aolDeg: 0.5 },
    { rOverR: 0.90, aolDeg: 1.0 },
  ];
  const fileName = tempFilePath('xinte-save');
  try {
    const saved = xinte.INTE1(state, { stations, save: true, outputFileName: fileName });
    assert.equal(saved.written, true);
    assert.ok(saved.text.includes('betaOL'));
    assert.equal(fs.readFileSync(fileName, 'utf8'), saved.text);
  } finally {
    if (fs.existsSync(fileName)) {
      fs.unlinkSync(fileName);
    }
  }

  const dispatched = xrotor.XROTOR(buildGeneratedState(), {
    command: 'INTF',
    stations,
  });
  assert.equal(dispatched.rows.length, stations.length);
  assert.ok(dispatched.rows[0].beta0Deg > dispatched.rows[dispatched.rows.length - 1].beta0Deg);
});
