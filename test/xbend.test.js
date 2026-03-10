'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const xbend = require('../js/xbend.js');
const {
  compileFortranDriver,
  runXbendB12sol,
  runXbendEiload,
  runXbendMclr,
  runXbendStadd,
  runXbendStcalc,
  runXbendStclr,
  runXbendStload,
  runXbendStset,
} = require('./helpers/fortran-xnoise.js');

const fixturePath = path.join(__dirname, 'fixtures', 'xbend-ei.dat');
const fixtureText = fs.readFileSync(fixturePath, 'utf8');

const STATION_FIELDS = [
  'XI',
  'DXI',
  'CH',
  'BETA',
  'BETA0',
  'CL',
  'CD',
  'CM',
  'EIXXB',
  'EIYYB',
  'EAB',
  'GJB',
  'EKB',
  'MB',
  'MXXB',
  'XOCG',
  'XOSC',
  'RSTB',
  'PX',
  'PY',
  'PZ',
  'MX',
  'MY',
  'MZ',
  'PX_TY',
  'PX_TZ',
  'PZ_TX',
  'PZ_TY',
  'PZ_WZ',
  'MY_TY',
  'MZ_TY',
  'MZ_TX',
  'MZ_WZ',
];

const NODE_FIELDS = [
  'TX',
  'TY',
  'TZ',
  'WX',
  'WY',
  'WZ',
  'SHRX',
  'SHRY',
  'SHRZ',
  'MOMX',
  'MOMY',
  'MOMZ',
];

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

function buildState(overrides = {}) {
  const state = xbend.createState({
    II: 4,
    RAD: 2.5,
    VEL: 46.0,
    VSO: 339.0,
    RHO: 1.18,
    ADV: 0.82,
    RAKE: 0.09,
    INCR: 2,
    LSTRUC: true,
    XI: new Float64Array([0.25, 0.5, 0.78, 0.96]),
    DXI: new Float64Array([0.25, 0.25, 0.28, 0.18]),
    CH: new Float64Array([0.24, 0.21, 0.18, 0.14]),
    BETA: new Float64Array([0.32, 0.27, 0.21, 0.16]),
    BETA0: new Float64Array([0.30, 0.25, 0.20, 0.15]),
    CL: new Float64Array([0.82, 0.76, 0.68, 0.55]),
    CD: new Float64Array([0.038, 0.034, 0.030, 0.028]),
    CM: new Float64Array([-0.050, -0.046, -0.041, -0.036]),
    EIXXB: new Float64Array([1.35e5, 1.52e5, 1.76e5, 1.93e5]),
    EIYYB: new Float64Array([1.72e5, 1.90e5, 2.12e5, 2.29e5]),
    EAB: new Float64Array([3.20e7, 3.38e7, 3.56e7, 3.72e7]),
    GJB: new Float64Array([8.5e4, 9.2e4, 1.01e5, 1.10e5]),
    EKB: new Float64Array([1.2e3, 1.35e3, 1.48e3, 1.60e3]),
    MB: new Float64Array([0.71, 0.79, 0.88, 0.94]),
    MXXB: new Float64Array([0.023, 0.027, 0.031, 0.034]),
    XOCG: new Float64Array([0.305, 0.298, 0.291, 0.286]),
    XOSC: new Float64Array([0.281, 0.279, 0.276, 0.274]),
    RSTB: new Float64Array([0.046, 0.050, 0.054, 0.057]),
    TX: new Float64Array([0.0080, 0.0105, 0.0135, 0.0160, 0.0180]),
    TY: new Float64Array([0.0040, 0.0060, 0.0085, 0.0105, 0.0125]),
    TZ: new Float64Array([-0.0070, -0.0045, -0.0010, 0.0018, 0.0040]),
    WX: new Float64Array([0.0000, 0.0011, 0.0025, 0.0038, 0.0048]),
    WY: new Float64Array([0.0000, 0.0006, 0.0013, 0.0021, 0.0029]),
    WZ: new Float64Array([0.0000, -0.0007, -0.0014, -0.0019, -0.0023]),
    SHRX: new Float64Array([0.070, 0.061, 0.048, 0.029, 0.000]),
    SHRY: new Float64Array([0.150, 0.132, 0.101, 0.057, 0.000]),
    SHRZ: new Float64Array([0.052, 0.041, 0.028, 0.014, 0.000]),
    MOMX: new Float64Array([0.0130, 0.0110, 0.0085, 0.0048, 0.0000]),
    MOMY: new Float64Array([0.0210, 0.0175, 0.0122, 0.0060, 0.0000]),
    MOMZ: new Float64Array([0.0290, 0.0230, 0.0155, 0.0070, 0.0000]),
  });

  if (Object.hasOwn(overrides, 'LSTRUC')) {
    state.LSTRUC = overrides.LSTRUC;
  }
  if (Object.hasOwn(overrides, 'INCR')) {
    state.INCR = overrides.INCR;
  }

  return state;
}

function stationSlice(state, field) {
  return state[field].slice(0, state.II);
}

function nodeSlice(state, field) {
  return state[field].slice(0, state.II + 1);
}

function copyBlocks(blocks) {
  return blocks.map((block) => block.map((row) => row.slice()));
}

test.before(() => {
  compileFortranDriver();
});

test('EILOAD matches Fortran interpolation and totals', () => {
  const state = buildState();
  const actual = xbend.EILOAD(state, fixturePath);
  const expected = runXbendEiload({
    II: state.II,
    RAD: state.RAD,
    XI: stationSlice(state, 'XI'),
    DXI: stationSlice(state, 'DXI'),
    fileName: fixturePath,
  });

  assert.equal(state.LSTRUC, true);
  assert.equal(expected.LSTRUC, true);
  assertClose(actual.MASS, expected.MASS, 'EILOAD.MASS', 5e-5, 5e-6);
  assertClose(actual.MAXX, expected.MAXX, 'EILOAD.MAXX', 5e-5, 5e-6);
  assertClose(actual.MRSQ, expected.MRSQ, 'EILOAD.MRSQ', 5e-5, 5e-6);
  for (const field of ['EIXXB', 'EIYYB', 'EAB', 'GJB', 'EKB', 'MB', 'MXXB', 'XOCG', 'XOSC', 'RSTB']) {
    assertVectorClose(stationSlice(state, field), expected[field], `EILOAD.${field}`, 5e-5, 5e-6);
  }
});

test('STCLR and MCLR match Fortran', () => {
  const state = buildState();
  const expectedClear = runXbendStclr({
    II: state.II,
    TX: nodeSlice(state, 'TX'),
    TY: nodeSlice(state, 'TY'),
    TZ: nodeSlice(state, 'TZ'),
    WX: nodeSlice(state, 'WX'),
    WY: nodeSlice(state, 'WY'),
    WZ: nodeSlice(state, 'WZ'),
    SHRX: nodeSlice(state, 'SHRX'),
    SHRY: nodeSlice(state, 'SHRY'),
    SHRZ: nodeSlice(state, 'SHRZ'),
    MOMX: nodeSlice(state, 'MOMX'),
    MOMY: nodeSlice(state, 'MOMY'),
    MOMZ: nodeSlice(state, 'MOMZ'),
  });

  xbend.STCLR(state);
  for (const field of NODE_FIELDS) {
    assertVectorClose(nodeSlice(state, field), expectedClear[field], `STCLR.${field}`, 1e-8, 1e-8);
  }

  const massState = buildState();
  const expectedMassClear = runXbendMclr({
    II: massState.II,
    MB: stationSlice(massState, 'MB'),
    MXXB: stationSlice(massState, 'MXXB'),
    EKB: stationSlice(massState, 'EKB'),
  });

  xbend.MCLR(massState);
  for (const field of ['MB', 'MXXB', 'EKB']) {
    assertVectorClose(stationSlice(massState, field), expectedMassClear[field], `MCLR.${field}`, 1e-8, 1e-8);
  }
});

test('STADD and STSET match Fortran twist updates', () => {
  const addState = buildState();
  const expectedAdd = runXbendStadd({
    II: addState.II,
    BETA: stationSlice(addState, 'BETA'),
    BETA0: stationSlice(addState, 'BETA0'),
    TY: nodeSlice(addState, 'TY'),
  });
  const actualAdd = xbend.STADD(addState);

  assert.equal(addState.CONV, false);
  assertClose(actualAdd.tipAngleDeflectionDeg, expectedAdd.tipAngleDeflectionDeg, 'STADD.tip', 1e-6, 1e-6);
  assertVectorClose(stationSlice(addState, 'BETA'), expectedAdd.BETA, 'STADD.BETA', 1e-6, 1e-6);

  const setState = buildState();
  const expectedSet = runXbendStset({
    II: setState.II,
    BETA: stationSlice(setState, 'BETA'),
    BETA0: stationSlice(setState, 'BETA0'),
    TY: nodeSlice(setState, 'TY'),
  });
  const actualSet = xbend.STSET(setState);

  assert.equal(setState.CONV, false);
  assertClose(actualSet.tipAngleDeflectionDeg, expectedSet.tipAngleDeflectionDeg, 'STSET.tip', 1e-6, 1e-6);
  assertVectorClose(stationSlice(setState, 'BETA0'), expectedSet.BETA0, 'STSET.BETA0', 1e-6, 1e-6);
});

test('B12SOL matches the original block tridiagonal solver', () => {
  const II = 3;
  const A = Array.from({ length: II }, (_, block) =>
    Array.from({ length: 12 }, (_, row) => {
      const values = new Float64Array(12);
      for (let col = 0; col < 12; col += 1) {
        if (row === col) {
          values[col] = 12.0 + 0.5 * block + 0.2 * row;
        } else if (Math.abs(row - col) === 1) {
          values[col] = 0.01 * (block + 1);
        } else {
          values[col] = 0.0005 * (((row + 1) * (col + 2) + block) % 5);
        }
      }
      return values;
    }),
  );
  const B = Array.from({ length: II }, (_, block) =>
    Array.from({ length: 12 }, (_, row) => {
      const values = new Float64Array(12);
      for (let col = 0; col < 12; col += 1) {
        values[col] = row === col ? 0.02 + 0.004 * block : 0.0002 * ((row + col + block) % 4);
      }
      return values;
    }),
  );
  const C = Array.from({ length: II }, (_, block) =>
    Array.from({ length: 12 }, (_, row) => {
      const values = new Float64Array(12);
      for (let col = 0; col < 12; col += 1) {
        values[col] = row === col ? 0.018 + 0.003 * block : 0.00025 * ((row + 2 * col + block) % 3);
      }
      return values;
    }),
  );
  const R = Array.from({ length: II }, (_, block) => {
    const values = new Float64Array(12);
    for (let i = 0; i < 12; i += 1) {
      values[i] = 0.2 * (block + 1) - 0.03 * i;
    }
    return values;
  });

  const actual = xbend.B12SOL(copyBlocks(A), copyBlocks(B), copyBlocks(C), R.map((row) => row.slice()), II);
  const expected = runXbendB12sol({ II, A, B, C, R }).R;

  assertMatrixClose(actual, expected, 'B12SOL', 5e-5, 5e-6);
});

test('STLOAD matches Fortran with structural properties enabled and disabled', () => {
  const structuredState = buildState();
  xbend.STLOAD(structuredState);
  const structuredExpected = runXbendStload(buildState());

  for (const field of ['PX', 'PY', 'PZ', 'MX', 'MY', 'MZ', 'PX_TY', 'PX_TZ', 'PZ_TX', 'PZ_TY', 'PZ_WZ', 'MY_TY', 'MZ_TY', 'MZ_TX', 'MZ_WZ']) {
    assertVectorClose(stationSlice(structuredState, field), structuredExpected[field], `STLOAD.${field}`, 3e-5, 3e-6);
  }

  const rigidState = buildState({ LSTRUC: false });
  xbend.STLOAD(rigidState);
  const rigidExpected = runXbendStload(buildState({ LSTRUC: false }));

  for (const field of ['PX', 'PY', 'PZ', 'MX', 'MY', 'MZ']) {
    assertVectorClose(stationSlice(rigidState, field), rigidExpected[field], `STLOAD rigid.${field}`, 3e-5, 3e-6);
  }
});

test('STCALC matches Fortran across loads and structural state', () => {
  const actualState = buildState();
  const actual = xbend.STCALC(actualState);
  const expected = runXbendStcalc(buildState());

  assertClose(actual.RMS, expected.RMS, 'STCALC.RMS', 2e-5, 2e-6);
  assertClose(actual.RLX, expected.RLX, 'STCALC.RLX', 2e-5, 2e-6);
  for (const field of STATION_FIELDS) {
    assertVectorClose(stationSlice(actualState, field), expected[field], `STCALC.${field}`, 5e-5, 5e-6);
  }
  for (const field of NODE_FIELDS) {
    assertVectorClose(nodeSlice(actualState, field), expected[field], `STCALC.${field}`, 5e-5, 5e-6);
  }
});

test('wrapper APIs return structured data and cover command dispatch', () => {
  const state = buildState();
  const textState = buildState();
  xbend.BEND(textState, { command: 'READ', fileName: fixturePath, text: fixtureText });
  assert.equal(textState.LSTRUC, true);

  const plotState = buildState();
  const evalResult = xbend.BEND(plotState, { command: 'EVAL' });
  assert.ok(evalResult.calc);
  assert.ok(evalResult.report);

  const block = xbend.SHOBLK(2, 3, [new Float64Array([1, 2, 3]), new Float64Array([4, 5, 6])]);
  assert.equal(block.I, 3);
  assert.deepEqual(block.rows, [[1, 2, 3], [4, 5, 6]]);

  const report = xbend.STWRIT(plotState);
  assert.equal(report.beamRows.length, 2);
  assert.equal(report.strainRows.length, 2);

  const strainPlot = xbend.PLEP(
    2,
    new Float64Array([0.2, 0.7]),
    new Float64Array([1.0, 2.0]),
    new Float64Array([0.5, 0.6]),
    new Float64Array([0.2, 0.3]),
    new Float64Array([0.1, 0.2]),
    new Float64Array([1.4, 2.3]),
    1.0,
    0.2,
    2.0,
    0.5,
    0.6,
    1.2,
  );
  assert.equal(strainPlot.kind, 'strain');

  const loadPlot = xbend.STPLOT(plotState);
  assert.equal(loadPlot.strainPlot.kind, 'strain');
  assert.equal(loadPlot.loadPlot.kind, 'loads');

  const stiffnessPlot = xbend.EIPLOT(textState);
  assert.equal(stiffnessPlot.kind, 'stiffness');

  const directStiffness = xbend.PLEI(
    2,
    new Float64Array([0.2, 0.7]),
    new Float64Array([0.04, 0.05]),
    new Float64Array([1.1e5, 1.4e5]),
    new Float64Array([3.2e7, 3.5e7]),
    new Float64Array([8.6e4, 9.2e4]),
    new Float64Array([1.2e3, 1.4e3]),
    new Float64Array([0.7, 0.8]),
    1.0,
    0.2,
    1.0,
    0.2,
    1.0,
    1.2,
    5,
    5,
    3,
    7,
    -1,
  );
  assert.equal(directStiffness.kind, 'stiffness');

  const directLoads = xbend.PLMF(
    2,
    new Float64Array([0.2, 0.7]),
    new Float64Array([10, 8]),
    new Float64Array([4, 3]),
    new Float64Array([9, 6]),
    new Float64Array([20, 18]),
    1.0,
    0.2,
    1.0,
    0.2,
    0.6,
    1.2,
    1,
    1,
    1,
    1,
  );
  assert.equal(directLoads.kind, 'loads');

  const resetState = buildState();
  xbend.BEND(resetState, { command: 'DEFL' });
  xbend.BEND(resetState, { command: 'REST' });
  assertVectorClose(stationSlice(resetState, 'BETA'), stationSlice(resetState, 'BETA0'), 'BEND.REST', 0.0, 0.0);

  assert.ok(xbend.BEND(buildState(), { command: 'PLOT', index: 1 }));
  assert.ok(xbend.BEND(buildState(), { command: 'PLOT', index: 2 }));
  assert.ok(xbend.BEND(buildState(), { command: 'WRIT' }));
  assert.ok(xbend.BEND(buildState(), { command: 'SETS' }));
  assert.ok(xbend.BEND(buildState(), { command: 'MCLR' }));
  assert.deepEqual(xbend.BEND(buildState(), { command: 'SIZE', value: 1.7 }), { command: 'SIZE', value: 1.7 });

  assert.throws(() => xbend.BEND(buildState(), { command: 'PLOT', index: 9 }), /unsupported plot number/);
  assert.throws(() => xbend.BEND(buildState(), { command: 'BOGUS' }), /unsupported command/);
  assert.throws(
    () => xbend.EILOAD(buildState(), fixturePath, { text: 'header1\nheader2\nheader3\nbad token' }),
    /incompatible format/,
  );
});
