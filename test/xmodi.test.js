'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const xmodi = require('../js/xmodi.js');
const xrotor = require('../js/xrotor.js');
const xoper = require('../js/xoper.js');
const xaero = require('../js/xaero.js');
const { SPLINE } = require('../js/spline.js');
const { compileFortranDriver, runModiSession, runPltmod } = require('./helpers/fortran-xmodi.js');

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

function buildModiState() {
  const state = xrotor.createState();
  xrotor.SETDEF(state);
  state.VERSION = 7.55;
  state.NAME = 'XMODI DRIVER';
  state.II = 5;
  state.NAERO = 2;
  state.NBLDS = 3;
  state.FAST = false;
  state.FREE = true;
  state.DUCT = true;
  state.WIND = false;
  state.RAD = 1.45;
  state.VEL = 42.0;
  state.VSO = 339.0;
  state.RHO = 1.19;
  state.RMU = 1.82e-5;
  state.ALT = 1.5;
  state.ADV = 0.69;
  state.ADW = 0.81;
  state.RAKE = 0.04;
  state.URDUCT = 1.07;
  state.XI0 = 0.22;
  state.XW0 = 0.24;
  state.XITIP = 1.0;
  state.IINF = state.II + Math.trunc(state.II / 2);
  state.NITERA = 12;
  state.ADWFCTR = 1.0;
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

  state.XI.set([0.28, 0.44, 0.62, 0.80, 0.94]);
  state.DXI.set([0.14, 0.17, 0.18, 0.16, 0.11]);
  state.XV.set([0.22, 0.35, 0.53, 0.71, 0.88, 1.0]);
  state.CH.set([0.23, 0.20, 0.17, 0.14, 0.11]);
  state.BETA.set([0.58, 0.51, 0.43, 0.35, 0.28]);
  state.BETA0.set([0.58, 0.51, 0.43, 0.35, 0.28]);
  state.UBODY.set([0.02, 0.018, 0.015, 0.010, 0.005]);
  state.GAM.set([0.09, 0.108, 0.104, 0.080, 0.050]);

  xaero.PUTAERO(state, 1, 0.28, -0.04, 1.32, -1.05, 5.8, 1.15, 0.18, 0.010, 0.28, 0.020, -0.08, 0.71, 1.9e6, -0.14);
  xaero.PUTAERO(state, 2, 0.82, -0.025, 1.18, -0.92, 5.5, 1.00, 0.16, 0.012, 0.24, 0.024, -0.06, 0.68, 2.2e6, -0.12);
  xaero.SETIAERO(state);

  state.NADD = 4;
  state.RADD.set([0.42, 0.76, 1.06, 1.34]);
  state.UADD.set([1.6, 2.0, 1.8, 1.4]);
  state.VADD.set([-0.25, -0.10, 0.05, 0.18]);
  SPLINE(state.UADD, state.UADDR, state.RADD, state.NADD);
  SPLINE(state.VADD, state.VADDR, state.RADD, state.NADD);

  const result = xoper.APER(state, 4, 2, true);
  assert.equal(result.converged, true, 'expected converged xmodi setup state');
  state.CONV = true;
  state.LROTOR = true;
  return state;
}

function assertModiStateClose(state, expected, label) {
  assert.equal(state.NBLDS, expected.NBLDS, `${label}.NBLDS`);
  assert.equal(state.II, expected.II, `${label}.II`);
  for (const field of ['RAD', 'XI0', 'XW0', 'RAKE', 'XPITCH', 'SIZE']) {
    assertClose(state[field], expected[field], `${label}.${field}`, 3e-6, 3e-6);
  }
  assertVectorClose(state.CH.slice(0, state.II), expected.CH, `${label}.CH`, 3e-6, 3e-6);
  assertVectorClose(state.BETA.slice(0, state.II), expected.BETA, `${label}.BETA`, 3e-6, 3e-6);
  assertVectorClose(state.BETA0.slice(0, state.II), expected.BETA0, `${label}.BETA0`, 3e-6, 3e-6);
  assertVectorClose(state.XI.slice(0, state.II), expected.XI, `${label}.XI`, 3e-6, 3e-6);
  assertVectorClose(state.DXI.slice(0, state.II), expected.DXI, `${label}.DXI`, 3e-6, 3e-6);
  assertVectorClose(state.XW.slice(0, state.II), expected.XW, `${label}.XW`, 3e-6, 3e-6);
  assertVectorClose(state.DXW.slice(0, state.II), expected.DXW, `${label}.DXW`, 3e-6, 3e-6);
}

test.before(() => {
  compileFortranDriver();
});

test('MODI BLAD, SCAL, and TLIN match Fortran', () => {
  const bladState = buildModiState();
  xmodi.MODI(bladState, { subcommand: 'BLAD', value: 5 });
  assertModiStateClose(bladState, runModiSession(['BLAD 5', '']), 'MODI BLAD');

  const scalState = buildModiState();
  xmodi.MODI(scalState, { subcommand: 'SCAL', a: 1.15, b: -0.22 });
  assertModiStateClose(scalState, runModiSession(['SCAL 1.15 -0.22', '']), 'MODI SCAL');

  const tlinState = buildModiState();
  xmodi.MODI(tlinState, { subcommand: 'TLIN', tipAngleDeg: 7.5 });
  assertModiStateClose(tlinState, runModiSession(['TLIN 7.5', '']), 'MODI TLIN');
});

test('MODI RTIP, RHUB, and RWAK match Fortran', () => {
  const rtipState = buildModiState();
  xmodi.MODI(rtipState, { subcommand: 'RTIP', radius: 1.62 });
  assertModiStateClose(rtipState, runModiSession(['RTIP 1.62', '']), 'MODI RTIP');

  const rhubState = buildModiState();
  xmodi.MODI(rhubState, { subcommand: 'RHUB', radius: 0.39 });
  assertModiStateClose(rhubState, runModiSession(['RHUB 0.39', '']), 'MODI RHUB');

  const rwakState = buildModiState();
  xmodi.MODI(rwakState, { subcommand: 'RWAK', radius: 0.47 });
  assertModiStateClose(rwakState, runModiSession(['RWAK 0.47', '']), 'MODI RWAK');
});

test('MODI RAKE, XPAX, CLPI, and CLPO match Fortran', () => {
  const rakeState = buildModiState();
  xmodi.MODI(rakeState, { subcommand: 'RAKE', deg: 6.0 });
  assertModiStateClose(rakeState, runModiSession(['RAKE 6.0', '']), 'MODI RAKE');

  const xpaxState = buildModiState();
  xmodi.MODI(xpaxState, { subcommand: 'XPAX', value: 0.41 });
  assertModiStateClose(xpaxState, runModiSession(['XPAX 0.41', '']), 'MODI XPAX');

  const clpiState = buildModiState();
  xmodi.MODI(clpiState, { subcommand: 'CLPI', radius: 0.41 });
  assertModiStateClose(clpiState, runModiSession(['CLPI 0.41', '']), 'MODI CLPI');

  const clpoState = buildModiState();
  xmodi.MODI(clpoState, { subcommand: 'CLPO', radius: 1.30 });
  assertModiStateClose(clpoState, runModiSession(['CLPO 1.30', '']), 'MODI CLPO');
});

test('PLTMOD matches Fortran scaling and axis offsets', () => {
  const state = buildModiState();
  const X = new Float64Array([0.0, 0.2, 0.45, 0.7, 1.0]);
  const Y = new Float64Array([0.35, 0.55, 0.40, 0.18, 0.12]);
  const YLIMS = new Float64Array([999.0, 999.0]);
  const actual = xmodi.PLTMOD(state, X.length, X, Y, 0.02, YLIMS, 0.95, 1.20 * state.PAR, 20);
  const expected = runPltmod({
    N: X.length,
    X,
    Y,
    DYMIN: 0.02,
    YLIMS,
    PLFAC: 0.95,
    PLPAR: 1.20 * state.PAR,
    NSPLT: 20,
  });

  for (const field of ['DYMIN', 'XOFF', 'XSF', 'YOFF', 'YSF']) {
    assertClose(actual[field], expected[field], `PLTMOD.${field}`, 3e-6, 3e-6);
  }
});

test('PLTMOD covers equal-range scaling and input validation', () => {
  const state = buildModiState();
  state.LGRID = false;
  const X = new Float64Array([0.0, 0.5, 1.0]);
  const Y = new Float64Array([2.0, 2.0, 2.0]);
  const YLIMS = new Float64Array([1.0, 1.1]);
  const plot = xmodi.PLTMOD(state, X.length, X, Y, 0.02, YLIMS, 0.95, 1.20 * state.PAR, 8);
  assert.equal(plot.plot.grid, null);
  assert.ok(plot.DYMIN >= 0.02);
  assert.throws(
    () => xmodi.PLTMOD(state, X.length, 'bad', Y, 0.02, YLIMS, 0.95, 1.20 * state.PAR, 8),
    /X: expected an array-like value/,
  );
  assert.throws(
    () => xmodi.PLTMOD(state, X.length, X, Y, 0.02, new Float64Array(1), 0.95, 1.20 * state.PAR, 8),
    /YLIMS: expected length >= 2/,
  );
});

test('MODBE and MODCH apply modify.f edits and return plot metadata', () => {
  const modbState = buildModiState();
  const betaEvents = [
    plotEvent(0.78, 29.0, 0.0, 1.0, 0.0, 1.0),
    plotEvent(0.38, 34.0, 0.0, 1.0, 0.0, 1.0),
    plotEvent(0.56, 31.5, 0.0, 1.0, 0.0, 1.0),
    plotEvent(0.82, 28.0, 0.0, 1.0, 0.0, 1.0),
    plotEvent(0.82, 28.5, 0.0, 1.0, 0.0, 1.0),
    plotEvent(0.82, 29.0, 0.0, 1.0, 0.0, 1.0),
  ];
  const betaBefore = modbState.BETA.slice();
  const modb = xmodi.MODI(modbState, { subcommand: 'MODB', events: betaEvents });
  assert.ok(modb.plot.plot.points.length > 0);
  assert.ok(modb.cursor.previewCurve.length > 0);
  assert.notDeepEqual(Array.from(modbState.BETA.slice(0, modbState.II)), Array.from(betaBefore.slice(0, modbState.II)));
  assert.notDeepEqual(Array.from(modbState.BETA0.slice(0, modbState.II)), Array.from(betaBefore.slice(0, modbState.II)));

  const modcState = buildModiState();
  const chordEvents = [
    plotEvent(0.78, 0.11, 0.0, 1.0, 0.0, 1.0),
    plotEvent(0.36, 0.22, 0.0, 1.0, 0.0, 1.0),
    plotEvent(0.58, 0.18, 0.0, 1.0, 0.0, 1.0),
    plotEvent(0.84, 0.13, 0.0, 1.0, 0.0, 1.0),
    plotEvent(0.84, 0.15, 0.0, 1.0, 0.0, 1.0),
    plotEvent(0.84, 0.17, 0.0, 1.0, 0.0, 1.0),
  ];
  const chordBefore = modcState.CH.slice();
  const modc = xmodi.MODI(modcState, { subcommand: 'MODC', events: chordEvents });
  assert.ok(modc.plot.plot.points.length > 0);
  assert.ok(modc.cursor.previewCurve.length > 0);
  assert.notDeepEqual(Array.from(modcState.CH.slice(0, modcState.II)), Array.from(chordBefore.slice(0, modcState.II)));
});

test('MODI OPTI covers built-in DESMIL fallback, restore, zero-relaxation, and target-resolve branches', () => {
  const fallbackState = buildModiState();
  fallbackState.DEST = false;
  fallbackState.DESP = true;
  const fallback = xmodi.MODI(fallbackState, { subcommand: 'OPTI', relaxation: 0.0 });
  assert.equal(typeof fallback.converged, 'boolean');
  assert.equal(fallback.designResult.formulation, 'Potential');

  const restoreState = buildModiState();
  const betaBefore = restoreState.BETA.slice(0, restoreState.II);
  const beta0Before = restoreState.BETA0.slice(0, restoreState.II);
  const restored = xmodi.MODI(restoreState, {
    subcommand: 'OPTI',
    designSolver: (solverState) => {
      solverState.BETA[0] += 0.3;
      solverState.BETA0[0] += 0.3;
      solverState.CONV = false;
      return { hooked: 'restore' };
    },
  });
  assert.equal(restored.converged, false);
  assert.equal(restored.restored, true);
  assertVectorClose(restoreState.BETA.slice(0, restoreState.II), betaBefore, 'MODI OPTI restore BETA');
  assertVectorClose(restoreState.BETA0.slice(0, restoreState.II), beta0Before, 'MODI OPTI restore BETA0');

  const zeroRelaxState = buildModiState();
  const zeroRelax = xmodi.MODI(zeroRelaxState, {
    subcommand: 'OPTI',
    relaxation: 0.0,
    designSolver: (solverState) => {
      solverState.BETA[0] += 0.2;
      solverState.BETA0[0] += 0.2;
      solverState.CONV = true;
      return { hooked: 'zero' };
    },
  });
  assert.equal(zeroRelax.modified, false);
  assert.equal(zeroRelax.output, null);
  assertClose(zeroRelaxState.BETA[0], betaBefore[0] + 0.2, 'MODI OPTI zero relaxation', 2e-6, 2e-6);

  const targetState = buildModiState();
  targetState.DEST = true;
  targetState.DESP = true;
  const aperCalls = [];
  const originalAPER = xoper.APER;
  xoper.APER = (solverState, itype, iconv, init) => {
    aperCalls.push([itype, iconv, init]);
    solverState.CONV = true;
    return { converged: true };
  };
  try {
    const target = xmodi.MODI(targetState, {
      subcommand: 'OPTI',
      relaxation: 1.0,
      designSolver: (solverState) => {
        solverState.BETA[0] += 0.02;
        solverState.BETA0[0] += 0.02;
        solverState.CONV = true;
        return { hooked: 'target' };
      },
    });
    assert.equal(target.modified, true);
    assert.deepEqual(aperCalls, [[1, 2, true], [3, 2, true]]);
  } finally {
    xoper.APER = originalAPER;
  }
});

test('MODI wrapper commands expose stable plot and optimization behavior', () => {
  const state = buildModiState();

  const help = xmodi.MODI(state, { subcommand: 'HELP' });
  assert.ok(help.commands.length > 5);

  const plot1 = xmodi.MODI(state, { subcommand: 'PLOT', plotNumber: 1 });
  assert.equal(plot1.routine, 'GEOPLT');

  const noSlipstream = buildModiState();
  noSlipstream.NADD = 0;
  const plot10 = xmodi.MODI(noSlipstream, { subcommand: 'PLOT', plotNumber: 10 });
  assert.match(plot10.error, /No slipstream profiles present/);

  const annoError = xmodi.MODI(state, { subcommand: 'ANNO' });
  assert.match(annoError.error, /No current plot/);
  state.LPLOT = true;
  assert.equal(xmodi.MODI(state, { subcommand: 'ANNO' }).annotated, true);
  assert.equal(xmodi.MODI(state, { subcommand: 'HARD' }).hardcopy, true);

  const sized = xmodi.MODI(state, { subcommand: 'SIZE', value: 12.5 });
  assertClose(sized.SIZE, 12.5, 'MODI SIZE', 0.0, 0.0);

  const optiState = buildModiState();
  optiState.DEST = false;
  optiState.DESP = false;
  const beta0 = optiState.BETA[0];
  const opti = xmodi.MODI(optiState, {
    subcommand: 'OPTI',
    relaxation: 0.5,
    designSolver: (solverState) => {
      solverState.BETA[0] += 0.2;
      solverState.BETA0[0] += 0.2;
      solverState.CONV = true;
      return { hooked: true };
    },
  });
  assert.equal(opti.converged, true);
  assertClose(optiState.BETA[0], beta0 + 0.1, 'MODI OPTI relaxation', 2e-6, 2e-6);
});

test('MODI wrapper edge cases cover empty commands, hooks, cancellations, and errors', () => {
  const state = buildModiState();
  assert.ok(Array.isArray(xmodi.MODI(state, {}).commands));
  assert.throws(() => xmodi.MODI(state, { subcommand: 'BOGUS' }), /unsupported command BOGUS/);

  const cancelled = xmodi.MODI(state, { subcommand: 'PLOT', plotNumber: 0 });
  assert.equal(cancelled.cancelled, true);
  assert.throws(() => xmodi.MODI(state, { subcommand: 'PLOT', plotNumber: 99 }), /unsupported plot number/);

  const plotHook = xmodi.MODI(state, { subcommand: 'PLOT', plotNumber: 3 }, {
    PLOT: (_solverState, plotAction) => ({ hooked: true, plotNumber: plotAction.plotNumber, routine: plotAction.info.routine }),
  });
  assert.deepEqual(plotHook, { hooked: true, plotNumber: 3, routine: 'CLPLT' });

  state.LPLOT = true;
  const annoHook = xmodi.MODI(state, { subcommand: 'ANNO' }, {
    ANNO: () => ({ hooked: 'anno' }),
  });
  assert.deepEqual(annoHook, { hooked: 'anno' });
  const hardHook = xmodi.MODI(state, { subcommand: 'HARD' }, {
    HARD: () => ({ hooked: 'hard' }),
  });
  assert.deepEqual(hardHook, { hooked: 'hard' });
});

test('xrotor dispatch now delegates MODI through xmodi', () => {
  const state = buildModiState();
  const result = xrotor.XROTOR(state, { command: 'MODI', subcommand: 'SIZE', value: 11.25 });
  assertClose(result.SIZE, 11.25, 'XROTOR MODI SIZE', 0.0, 0.0);
});
