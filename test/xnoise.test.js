'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const xnoise = require('../js/xnoise.js');
const {
  compileFortranDriver,
  runDbfoot,
  runPsplin,
  runPtrace,
  runPtriso,
  runScalit,
  runSeval,
  runSpline,
  runSft,
  runTrisol,
} = require('./helpers/fortran-xnoise.js');

function sumPressureComponents(pcomp) {
  const pres = new Float64Array(pcomp.length);
  for (let it = 0; it < pcomp.length; it += 1) {
    pres[it] = pcomp[it][0] + pcomp[it][1] + pcomp[it][2];
  }
  return pres;
}

function rmsPressure(pres, time) {
  let prms = 0.0;
  for (let it = 1; it < pres.length; it += 1) {
    const delt = time[it] - time[it - 1];
    const pavg = 0.5 * (pres[it] + pres[it - 1]);
    prms += pavg * pavg * delt;
  }
  return Math.sqrt(prms / (time[pres.length - 1] - time[0]));
}

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
    assert.equal(actual[i].length, expected[i].length, `${label}[${i}]: column count mismatch`);
    for (let j = 0; j < actual[i].length; j += 1) {
      assertClose(actual[i][j], expected[i][j], `${label}[${i}][${j}]`, absTol, relTol);
    }
  }
}

function wrapAngleDifference(actual, expected) {
  let diff = actual - expected;
  while (diff > Math.PI) {
    diff -= 2.0 * Math.PI;
  }
  while (diff < -Math.PI) {
    diff += 2.0 * Math.PI;
  }
  return Math.abs(diff);
}

function assertPhaseVectorClose(
  actual,
  expected,
  amplitudes,
  label,
  phaseTol = 5e-3,
  amplitudeFloor = 1e-4,
) {
  assert.equal(actual.length, expected.length, `${label}: length mismatch`);
  assert.equal(amplitudes.length, expected.length, `${label}: amplitude length mismatch`);
  for (let i = 0; i < actual.length; i += 1) {
    if (Math.abs(amplitudes[i]) <= amplitudeFloor) {
      continue;
    }
    const diff = wrapAngleDifference(actual[i], expected[i]);
    assert.ok(
      diff <= phaseTol,
      `${label}[${i}]: expected ${expected[i]}, got ${actual[i]}, diff ${diff}, limit ${phaseTol}`,
    );
  }
}

function assertDecibSpectrumClose(
  actual,
  expected,
  amplitudes,
  label,
  absTol = 5e-3,
  relTol = 5e-6,
  amplitudeFloor = 1e-5,
) {
  assert.equal(actual.length, expected.length, `${label}: length mismatch`);
  assertClose(actual[0], expected[0], `${label}[0]`, absTol, relTol);

  let maxAmplitude = 0.0;
  for (let i = 0; i < amplitudes.length; i += 1) {
    maxAmplitude = Math.max(maxAmplitude, Math.abs(amplitudes[i]));
  }
  const floor = Math.max(amplitudeFloor, maxAmplitude * 1e-4);

  for (let i = 1; i < actual.length; i += 1) {
    if (Math.abs(amplitudes[i - 1]) <= floor) {
      continue;
    }
    assertClose(actual[i], expected[i], `${label}[${i}]`, absTol, relTol);
  }
}

function createRepresentativeState() {
  return {
    NBLDS: 3,
    II: 4,
    XI: new Float64Array([0.25, 0.5, 0.75, 0.95]),
    DXI: new Float64Array([0.25, 0.25, 0.25, 0.2]),
    AOC: new Float64Array([0.01, 0.011, 0.012, 0.013]),
    CH: new Float64Array([0.12, 0.105, 0.09, 0.075]),
    GAM: new Float64Array([0.02, 0.018, 0.014, 0.01]),
    ADV: 0.78,
    RAD: 1.15,
    VEL: 52.0,
    VSO: 339.0,
    RHO: 1.225,
  };
}

function createGroundGrid(xValues, yValues) {
  return {
    X: xValues.map((x) => Float64Array.from(yValues, () => x)),
    Y: xValues.map(() => Float64Array.from(yValues)),
  };
}

function buildExpectedFootprintGrid(galt, xlim, ylim, ndbsiz) {
  const nx = ndbsiz[0];
  const ny = ndbsiz[1];
  const x = Array.from({ length: nx }, () => new Float64Array(ny));
  const y = Array.from({ length: nx }, () => new Float64Array(ny));
  const thx1 = Math.atan2(xlim[0], galt);
  const thx2 = Math.atan2(xlim[1], galt);
  const thy1 = Math.atan2(ylim[0], galt);
  const thy2 = Math.atan2(ylim[1], galt);

  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < ny; j += 1) {
      const thx = thx1 + ((thx2 - thx1) * i) / (nx - 1);
      const thy = thy1 + ((thy2 - thy1) * j) / (ny - 1);
      x[i][j] = galt * Math.tan(thx);
      y[i][j] = galt * Math.tan(thy);
    }
  }

  return { X: x, Y: y };
}

test.before(() => {
  compileFortranDriver();
});

test('TRISOL matches the original Fortran solver', () => {
  const A = new Float64Array([4.0, 4.5, 5.0, 6.0]);
  const B = new Float64Array([0.0, 0.5, -0.25, 0.75]);
  const C = new Float64Array([0.8, -0.1, 0.4, 0.0]);
  const D = new Float64Array([1.0, -0.5, 2.0, 0.25]);

  const actual = xnoise.TRISOL(A.slice(), B.slice(), C.slice(), D.slice(), D.length);
  const expected = runTrisol({ KK: D.length, A, B, C, D }).D;

  assertVectorClose(actual, expected, 'TRISOL', 2e-6, 2e-6);
});

test('PTRISO matches the original Fortran solver', () => {
  const A = new Float64Array([4.0, 4.5, 5.0, 4.25]);
  const B = new Float64Array([1.0, 0.5, 0.75, 0.6]);
  const C = new Float64Array([0.8, 0.7, 0.9, 1.1]);
  const D = new Float64Array([1.0, -0.5, 2.0, 0.25]);

  const actual = xnoise.PTRISO(A.slice(), B.slice(), C.slice(), D.slice(), D.length);
  const expected = runPtriso({ KK: D.length, A, B, C, D }).D;

  assertVectorClose(actual, expected, 'PTRISO', 2e-6, 2e-6);
});

test('PSPLIN matches the original Fortran periodic spline setup', () => {
  const S = new Float64Array([0.0, 0.08, 0.23, 0.47, 0.71, 0.9, 1.0]);
  const X = new Float64Array(S.length);
  for (let i = 0; i < S.length; i += 1) {
    X[i] = 0.7 * Math.sin(2.0 * Math.PI * S[i]) + 0.2 * Math.cos(4.0 * Math.PI * S[i]);
  }
  X[X.length - 1] = X[0];

  const actual = xnoise.PSPLIN(X.slice(), new Float64Array(X.length), S, S.length);
  const expected = runPsplin({ II: S.length, X, S }).XP;

  assertVectorClose(actual, expected, 'PSPLIN', 2e-6, 2e-6);
});

test('SPLINE and SEVAL match the original Fortran helpers', () => {
  const S = new Float64Array([0.0, 0.12, 0.35, 0.6, 0.82, 1.0]);
  const X = new Float64Array([0.15, 0.4, -0.2, 0.8, 0.35, 0.5]);
  const SS = new Float64Array([0.05, 0.2, 0.5, 0.9]);

  const actualXS = xnoise.SPLINE(X.slice(), new Float64Array(X.length), S, S.length);
  const expectedXS = runSpline({ N: X.length, X, S }).XS;
  assertVectorClose(actualXS, expectedXS, 'SPLINE', 2e-6, 2e-6);

  const actualValues = Float64Array.from(SS, (ss) => xnoise.SEVAL(ss, X, actualXS, S, S.length));
  const expectedValues = runSeval({
    N: X.length,
    M: SS.length,
    X,
    XS: expectedXS,
    S,
    SS,
  }).VALUES;
  assertVectorClose(actualValues, expectedValues, 'SEVAL', 2e-6, 2e-6);

  const singletonX = new Float64Array([2.5]);
  const singletonS = new Float64Array([0.0]);
  const singletonXS = xnoise.SPLINE(singletonX, new Float64Array(1), singletonS, 1);
  assert.equal(singletonXS[0], 0.0);
  assert.equal(xnoise.SEVAL(10.0, singletonX, singletonXS, singletonS, 1), 2.5);
});

test('SCALIT matches the original Fortran helper for scalar, vector, and zero cases', () => {
  const Y = new Float64Array([-2.0, 6.0, 3.5, -4.5]);
  const YOFF = 1.5;
  const actualVector = xnoise.SCALIT(Y.length, Y, YOFF);
  const expectedVector = runScalit({ II: Y.length, Y, YOFF }).YSF;
  assertClose(actualVector, expectedVector, 'SCALIT vector', 2e-6, 2e-6);

  const actualScalar = xnoise.SCALIT(1, 12.5, 3.0);
  const expectedScalar = runScalit({ II: 1, Y: [12.5], YOFF: 3.0 }).YSF;
  assertClose(actualScalar, expectedScalar, 'SCALIT scalar', 2e-6, 2e-6);

  const actualZero = xnoise.SCALIT(3, new Float64Array([2.0, 2.0, 2.0]), 2.0);
  const expectedZero = runScalit({ II: 3, Y: [2.0, 2.0, 2.0], YOFF: 2.0 }).YSF;
  assertClose(actualZero, expectedZero, 'SCALIT zero', 1e-6, 1e-6);
  assert.equal(actualZero, 1.0e8);
});

test('SFT matches the original Fortran harmonic amplitudes and phases', () => {
  const N = 48;
  const NF = 6;
  const Y = new Float64Array(N + 1);
  const T = new Float64Array(N + 1);

  for (let i = 0; i <= N; i += 1) {
    const tt = i / N;
    T[i] = tt;
    Y[i] =
      0.9 * Math.sin(2.0 * Math.PI * tt + 0.2) +
      0.35 * Math.cos(4.0 * Math.PI * tt - 0.4) -
      0.15 * Math.sin(6.0 * Math.PI * tt + 0.1);
  }
  Y[N] = Y[0];

  const actual = xnoise.SFT(Y, T, N, undefined, undefined, NF);
  const expected = runSft({ N, NF, Y, T });

  assertVectorClose(actual.FAMPL, expected.FAMPL, 'SFT FAMPL', 2e-6, 2e-6);
  assertPhaseVectorClose(actual.PHASE, expected.PHASE, expected.FAMPL, 'SFT PHASE');
});

test('PTRACE matches the original Fortran acoustic pressure trace', () => {
  const state = createRepresentativeState();
  const NT = 40;
  const observer = { XOBS: 1.75, YOBS: -2.25, ZOBS: -92.0 };

  const actual = xnoise.PTRACE(
    observer.XOBS,
    observer.YOBS,
    observer.ZOBS,
    state.NBLDS,
    state.II,
    state.XI,
    state.DXI,
    state.AOC,
    state.CH,
    state.GAM,
    state.ADV,
    state.RAD,
    state.VEL,
    state.VSO,
    state.RHO,
    NT,
    NT,
  );
  const expected = runPtrace({
    NBLDS: state.NBLDS,
    II: state.II,
    NT,
    XOBS: observer.XOBS,
    YOBS: observer.YOBS,
    ZOBS: observer.ZOBS,
    ADV: state.ADV,
    RAD: state.RAD,
    VEL: state.VEL,
    VSO: state.VSO,
    RHO: state.RHO,
    XI: state.XI,
    DXI: state.DXI,
    AOC: state.AOC,
    CH: state.CH,
    GAM: state.GAM,
  });

  assertVectorClose(actual.TIME, expected.TIME, 'PTRACE TIME', 5e-6, 5e-6);
  assertMatrixClose(actual.PRES, expected.PRES, 'PTRACE PRES', 5e-6, 5e-6);
});

test('PTRACE reports Mach clipping and still matches the original trace', () => {
  const XI = new Float64Array([0.3, 0.6, 0.9]);
  const DXI = new Float64Array([0.3, 0.3, 0.3]);
  const AOC = new Float64Array([0.01, 0.01, 0.01]);
  const CH = new Float64Array([0.12, 0.1, 0.08]);
  const GAM = new Float64Array([0.02, 0.02, 0.01]);

  const actual = xnoise.PTRACE(
    0.0,
    0.0,
    -1.0,
    2,
    3,
    XI,
    DXI,
    AOC,
    CH,
    GAM,
    0.2,
    1.0,
    100.0,
    340.0,
    1.225,
    20,
    20,
  );
  assert.ok(actual.warnings.length > 0, 'expected Mach clipping warning');

  const expected = runPtrace({
    NBLDS: 2,
    II: 3,
    NT: 20,
    XOBS: 0.0,
    YOBS: 0.0,
    ZOBS: -1.0,
    ADV: 0.2,
    RAD: 1.0,
    VEL: 100.0,
    VSO: 340.0,
    RHO: 1.225,
    XI,
    DXI,
    AOC,
    CH,
    GAM,
  });

  assertVectorClose(actual.TIME, expected.TIME, 'PTRACE clipped TIME', 1e-5, 1e-4);
  assertMatrixClose(actual.PRES, expected.PRES, 'PTRACE clipped PRES', 10.0, 5e-4);
});

test('DBFOOT matches the original Fortran footprint calculation', () => {
  const state = createRepresentativeState();
  const NT = 20;
  const xValues = [-120.0, -30.0, 60.0];
  const yValues = [-70.0, 0.0, 70.0];
  const grid = createGroundGrid(xValues, yValues);

  const actual = xnoise.DBFOOT(
    state.NBLDS,
    state.II,
    state.XI,
    state.DXI,
    state.AOC,
    state.CH,
    state.GAM,
    state.ADV,
    state.RAD,
    state.VEL,
    state.VSO,
    state.RHO,
    100.0,
    6.0,
    1.0,
    NT,
    xValues.length,
    yValues.length,
    xValues.length,
    yValues.length,
    grid.X,
    grid.Y,
  );
  const expected = runDbfoot({
    NBLDS: state.NBLDS,
    II: state.II,
    NT,
    NX: xValues.length,
    NY: yValues.length,
    ADV: state.ADV,
    RAD: state.RAD,
    VEL: state.VEL,
    VSO: state.VSO,
    RHO: state.RHO,
    GALT: 100.0,
    DCLIMB: 6.0,
    UNITL: 1.0,
    XI: state.XI,
    DXI: state.DXI,
    AOC: state.AOC,
    CH: state.CH,
    GAM: state.GAM,
    X: grid.X,
    Y: grid.Y,
  }).D;

  assertMatrixClose(actual, expected, 'DBFOOT', 2e-4, 2e-5);
});

test('DBFOOT matches the original fallback path when all y stations are negative', () => {
  const state = createRepresentativeState();
  const NT = 12;
  const xValues = [-80.0, -20.0, 40.0];
  const yValues = [-60.0, -25.0, -5.0];
  const grid = createGroundGrid(xValues, yValues);

  const actual = xnoise.DBFOOT(
    state.NBLDS,
    state.II,
    state.XI,
    state.DXI,
    state.AOC,
    state.CH,
    state.GAM,
    state.ADV,
    state.RAD,
    state.VEL,
    state.VSO,
    state.RHO,
    90.0,
    4.0,
    1.0,
    NT,
    xValues.length,
    yValues.length,
    xValues.length,
    yValues.length,
    grid.X,
    grid.Y,
  );
  const expected = runDbfoot({
    NBLDS: state.NBLDS,
    II: state.II,
    NT,
    NX: xValues.length,
    NY: yValues.length,
    ADV: state.ADV,
    RAD: state.RAD,
    VEL: state.VEL,
    VSO: state.VSO,
    RHO: state.RHO,
    GALT: 90.0,
    DCLIMB: 4.0,
    UNITL: 1.0,
    XI: state.XI,
    DXI: state.DXI,
    AOC: state.AOC,
    CH: state.CH,
    GAM: state.GAM,
    X: grid.X,
    Y: grid.Y,
  }).D;

  assertMatrixClose(actual, expected, 'DBFOOT negative-y fallback', 2e-4, 2e-5);
});

test('NOISE pressure mode stays aligned with the original Fortran pipeline', () => {
  const state = createRepresentativeState();
  const NT = 40;
  const XYZOBS = [1.75, -2.25, -92.0];
  const UNITL = 1.0;

  const actual = xnoise.NOISE(
    {
      ...state,
      AOCI: state.AOC,
      XYZOBS,
      UNITL,
    },
    {
      mode: 'pressure',
      NT,
      AOCI: state.AOC,
      XYZOBS,
      UNITL,
    },
  );

  const fortranTrace = runPtrace({
    NBLDS: state.NBLDS,
    II: state.II,
    NT,
    XOBS: XYZOBS[0] / UNITL,
    YOBS: XYZOBS[1] / UNITL,
    ZOBS: XYZOBS[2] / UNITL,
    ADV: state.ADV,
    RAD: state.RAD,
    VEL: state.VEL,
    VSO: state.VSO,
    RHO: state.RHO,
    XI: state.XI,
    DXI: state.DXI,
    AOC: state.AOC,
    CH: state.CH,
    GAM: state.GAM,
  });
  const fortranPres = sumPressureComponents(fortranTrace.PRES);
  const fortranPrms = rmsPressure(fortranPres, fortranTrace.TIME);
  const fortranSpectrum = runSft({
    N: NT,
    NF: Math.floor(NT / 2),
    Y: fortranPres,
    T: fortranTrace.TIME,
  });
  const fortranDecib = new Float64Array(Math.floor(NT / 2) + 1);
  for (let i = 1; i < fortranDecib.length; i += 1) {
    fortranDecib[i] =
      20.0 * Math.log10((Math.sqrt(0.5) * fortranSpectrum.FAMPL[i - 1]) / 20.0e-6);
  }
  fortranDecib[0] = 20.0 * Math.log10(fortranPrms / 20.0e-6);

  assertVectorClose(actual.TIME, fortranTrace.TIME, 'NOISE TIME', 5e-6, 5e-6);
  assertMatrixClose(actual.PCOMP, fortranTrace.PRES, 'NOISE PCOMP', 5e-6, 5e-6);
  assertVectorClose(actual.PRES, fortranPres, 'NOISE PRES', 5e-6, 5e-6);
  assertClose(actual.PRMS, fortranPrms, 'NOISE PRMS', 5e-6, 5e-6);
  assertVectorClose(actual.FAMPL, fortranSpectrum.FAMPL, 'NOISE FAMPL', 5e-6, 5e-6);
  assertPhaseVectorClose(
    actual.PHASE,
    fortranSpectrum.PHASE,
    fortranSpectrum.FAMPL,
    'NOISE PHASE',
    5e-3,
    1e-5,
  );
  assertDecibSpectrumClose(actual.DECIB, fortranDecib, fortranSpectrum.FAMPL, 'NOISE DECIB');
});

test('NOISE pressure mode with AOCProfile matches the original spline interpolation path', () => {
  const state = createRepresentativeState();
  const NT = 36;
  const XYZOBS = [2.0, -1.5, -85.0];
  const AOCProfile = {
    XA: new Float64Array([0.2, 0.45, 0.7, 1.0]),
    AOC: new Float64Array([0.008, 0.01, 0.013, 0.015]),
  };

  const actual = xnoise.NOISE(
    {
      ...state,
      XYZOBS,
      UNITL: 1.0,
    },
    {
      mode: 'pressure',
      NT,
      XYZOBS,
      UNITL: 1.0,
      AOCProfile,
    },
  );

  const spline = runSpline({ N: AOCProfile.XA.length, X: AOCProfile.AOC, S: AOCProfile.XA });
  const aoci = runSeval({
    N: AOCProfile.XA.length,
    M: state.II,
    X: AOCProfile.AOC,
    XS: spline.XS,
    S: AOCProfile.XA,
    SS: state.XI,
  }).VALUES;
  const expected = runPtrace({
    NBLDS: state.NBLDS,
    II: state.II,
    NT,
    XOBS: XYZOBS[0],
    YOBS: XYZOBS[1],
    ZOBS: XYZOBS[2],
    ADV: state.ADV,
    RAD: state.RAD,
    VEL: state.VEL,
    VSO: state.VSO,
    RHO: state.RHO,
    XI: state.XI,
    DXI: state.DXI,
    AOC: aoci,
    CH: state.CH,
    GAM: state.GAM,
  });

  assertVectorClose(actual.AOCI, aoci, 'NOISE AOCProfile AOCI', 2e-6, 2e-6);
  assertVectorClose(actual.TIME, expected.TIME, 'NOISE AOCProfile TIME', 5e-6, 5e-6);
  assertMatrixClose(actual.PCOMP, expected.PRES, 'NOISE AOCProfile PCOMP', 5e-6, 5e-6);
});

test('NOISE footprint mode generates the default grid and matches the original DBFOOT calculation', () => {
  const state = createRepresentativeState();
  const GALT = 110.0;
  const DCLIMB = 5.0;
  const NDBSIZ = [4, 3];

  const actual = xnoise.NOISE(
    {
      ...state,
      AOCI: state.AOC,
      UNITL: 1.0,
    },
    {
      mode: 'footprint',
      NT: 16,
      AOCI: state.AOC,
      UNITL: 1.0,
      GALT,
      DCLIMB,
      NDBSIZ,
    },
  );

  const expectedGrid = buildExpectedFootprintGrid(GALT, [-2.0 * GALT, 2.0 * GALT], [-1.0 * GALT, 1.0 * GALT], NDBSIZ);
  assertMatrixClose(actual.XDB, expectedGrid.X, 'NOISE footprint XDB', 1e-12, 1e-12);
  assertMatrixClose(actual.YDB, expectedGrid.Y, 'NOISE footprint YDB', 1e-12, 1e-12);

  const expectedADB = runDbfoot({
    NBLDS: state.NBLDS,
    II: state.II,
    NT: 16,
    NX: NDBSIZ[0],
    NY: NDBSIZ[1],
    ADV: state.ADV,
    RAD: state.RAD,
    VEL: state.VEL,
    VSO: state.VSO,
    RHO: state.RHO,
    GALT,
    DCLIMB,
    UNITL: 1.0,
    XI: state.XI,
    DXI: state.DXI,
    AOC: state.AOC,
    CH: state.CH,
    GAM: state.GAM,
    X: actual.XDB,
    Y: actual.YDB,
  }).D;
  assertMatrixClose(actual.ADB, expectedADB, 'NOISE footprint ADB', 2e-3, 2e-5);
});

test('NOISE footprint mode honors provided grids and default AOC0 clamping', () => {
  const state = createRepresentativeState();
  const grid = createGroundGrid([-50.0, 0.0, 50.0], [-30.0, 0.0, 30.0]);
  const actual = xnoise.NOISE(
    {
      ...state,
      AOC0: -3.0,
      UNITL: 1.0,
    },
    {
      mode: 'footprint',
      NT: 12,
      GALT: 80.0,
      DCLIMB: 3.0,
      XDB: grid.X,
      YDB: grid.Y,
      NX: 3,
      NY: 3,
    },
  );

  assertVectorClose(actual.AOCI, new Float64Array(state.II), 'NOISE default AOCI clamp', 0.0, 0.0);

  const expectedADB = runDbfoot({
    NBLDS: state.NBLDS,
    II: state.II,
    NT: 12,
    NX: 3,
    NY: 3,
    ADV: state.ADV,
    RAD: state.RAD,
    VEL: state.VEL,
    VSO: state.VSO,
    RHO: state.RHO,
    GALT: 80.0,
    DCLIMB: 3.0,
    UNITL: 1.0,
    XI: state.XI,
    DXI: state.DXI,
    AOC: actual.AOCI,
    CH: state.CH,
    GAM: state.GAM,
    X: grid.X,
    Y: grid.Y,
  }).D;
  assertMatrixClose(actual.ADB, expectedADB, 'NOISE provided-grid ADB', 2e-4, 2e-5);
});

test('title and plot metadata helpers return structured data', () => {
  const titleState = {
    ADV: 0.8,
    VEL: 50.0,
    VSO: 340.0,
    PTOT: 0.12,
    NAME: 'Demo Rotor',
  };
  const ptitle = xnoise.PTITLE(0.0, 1.0, 0.02, [1.0, 2.0, 3.0], 'ft', titleState);
  const ctitle = xnoise.CTITLE(0.0, 1.0, 0.02, 100.0, 4.0, 'ft', titleState);
  assert.equal(ptitle.ULNAM, 'ft');
  assert.equal(ctitle.GALT, 100.0);
  assert.ok(Number.isFinite(ptitle.MACH));
  assert.ok(Number.isFinite(ctitle.MTIP));

  const emptyTitle = xnoise.PTITLE(0.0, 0.0, 0.01, [0.0, 0.0, 0.0], 'm');
  assert.ok(Number.isNaN(emptyTitle.MACH));

  const NT = 4;
  const TIME = new Float64Array([0.0, 0.25, 0.5, 0.75, 1.0]);
  const PRES = new Float64Array([0.0, 1.0, 0.0, -1.0, 0.0]);
  const PCOMP = [
    new Float64Array([0.0, 0.0, 0.0]),
    new Float64Array([0.6, 0.3, 0.1]),
    new Float64Array([0.0, 0.0, 0.0]),
    new Float64Array([-0.6, -0.3, -0.1]),
    new Float64Array([0.0, 0.0, 0.0]),
  ];
  const ptplot = xnoise.PTPLOT(NT, NT, PCOMP, PRES, TIME, 0.65, 0.016, 0.01, true);
  assert.equal(ptplot.series.length, 4);
  assert.equal(ptplot.series[0].points.length, NT + 1);

  const dbsplt = xnoise.DBSPLT(4, 2.0, new Float64Array([82.0, 75.0, 64.0, 58.0, 50.0]), 0.65, 0.016, true);
  assert.ok(dbsplt.grid);
  assert.equal(dbsplt.harmonics.length, 4);
});

test('DBXPLT and DBCPLT produce stable plot metadata across edge cases', () => {
  const X = [
    new Float64Array([-10.0, -10.0, -10.0]),
    new Float64Array([0.0, 0.0, 0.0]),
    new Float64Array([10.0, 10.0, 10.0]),
  ];
  const Y = [
    new Float64Array([-5.0, 0.0, 5.0]),
    new Float64Array([-5.0, 0.0, 5.0]),
    new Float64Array([-5.0, 0.0, 5.0]),
  ];
  const D = [
    new Float64Array([18.0, 22.0, 23.0]),
    new Float64Array([19.0, 24.0, 25.0]),
    new Float64Array([20.0, 26.0, 27.0]),
  ];

  const dbxplt = xnoise.DBXPLT(3, 3, 3, 3, X, Y, D, 0.0, 0.02, 0.65, 'ft', 30, 30, 1, 5, true, {
    NCOLOR: 8,
  });
  assert.ok(dbxplt.grid);
  assert.equal(dbxplt.segments.length, 20);
  assert.equal(dbxplt.chosenY, 0.0);

  const D2 = [
    new Float64Array([31.0, 32.0, 33.0]),
    new Float64Array([34.0, 35.0, 36.0]),
    new Float64Array([37.0, 38.0, 39.0]),
  ];
  const dbcplt = xnoise.DBCPLT(3, 3, 3, 3, X, Y, D2, 0.02, 0.65, 'ft', 30, 30, 5, 10, true, {
    NCOLOR: 8,
  });
  assert.ok(dbcplt.grid);
  assert.ok(dbcplt.contours.some((contour) => contour.emphasized));
  assert.equal(dbcplt.airplane.length, 3);
});

test('error paths throw for unsupported modes and invalid arguments', () => {
  const state = createRepresentativeState();

  assert.throws(() => xnoise.NOISE(state, { mode: 'invalid' }), /unsupported mode/i);
  assert.throws(() => xnoise.NOISE(state, { mode: 'footprint' }), /GALT is required/i);
  assert.throws(
    () => xnoise.PSPLIN(new Float64Array([0.0, 1.0]), new Float64Array(2), new Float64Array([0.0, 1.0]), 2),
    /Data not periodic/i,
  );
  assert.throws(
    () => xnoise.PTRACE(0.0, 0.0, -1.0, 2, state.II, state.XI, state.DXI, state.AOC, state.CH, state.GAM, state.ADV, state.RAD, state.VEL, state.VSO, state.RHO, 5, 6),
    /NT > NTMAX/i,
  );
  assert.throws(() => xnoise.SFT(new Float64Array(2), new Float64Array(2), 1, undefined, undefined, -1), /NF must be/i);
  assert.throws(() => xnoise.SCALIT(2, 5.0, 0.0), /scalar input is only valid/i);
});
