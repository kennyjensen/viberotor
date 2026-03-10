'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const spline = require('../js/spline.js');
const {
  compileFortranDriver,
  runCurv,
  runCurvs,
  runD2val,
  runDeval,
  runDsevlin,
  runInters,
  runNearpt,
  runScalc,
  runSeval,
  runSevall,
  runSegspl,
  runSinvrt,
  runSpline,
  runSplina,
  runSplind,
  runSsevlin,
  runSevlin,
  runTrisol,
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

function assertArrayOfObjectsClose(actual, expected, key, label, absTol = 1e-6, relTol = 1e-6) {
  assert.equal(actual.length, expected.length, `${label}: length mismatch`);
  for (let i = 0; i < actual.length; i += 1) {
    assertClose(actual[i][key], expected[i], `${label}[${i}].${key}`, absTol, relTol);
  }
}

test.before(() => {
  compileFortranDriver();
});

test('TRISOL parity for standalone spline module', () => {
  const A = new Float64Array([3.0, 4.0, 5.0, 6.0, 5.5]);
  const B = new Float64Array([0.0, -0.2, 0.4, 0.6, 0.5]);
  const C = new Float64Array([1.0, 0.5, -0.1, 0.3, 0.0]);
  const D = new Float64Array([2.0, -1.0, 0.5, 3.0, -0.75]);

  const actual = spline.TRISOL(A.slice(), B.slice(), C.slice(), D.slice(), D.length);
  const expected = runTrisol({ KK: D.length, A, B, C, D }).D;

  assertVectorClose(actual, expected, 'TRISOL', 2e-6, 2e-6);
});

test('SPLINE, SEVAL, DEVAL, D2VAL, and SEVALL match Fortran', () => {
  const S = new Float64Array([0.0, 0.15, 0.33, 0.61, 0.84, 1.0]);
  const X = new Float64Array([0.1, 0.7, -0.2, 0.9, 0.35, 0.5]);
  const SS = new Float64Array([-0.05, 0.0, 0.2, 0.5, 0.95, 1.1]);

  const actualXS = spline.SPLINE(X.slice(), new Float64Array(X.length), S, S.length);
  const expectedXS = runSpline({ N: X.length, X, S }).XS;
  assertVectorClose(actualXS, expectedXS, 'SPLINE', 2e-6, 2e-6);

  const actualSeval = Float64Array.from(SS, (ss) => spline.SEVAL(ss, X, actualXS, S, S.length));
  const expectedSeval = runSeval({ N: X.length, M: SS.length, X, XS: expectedXS, S, SS }).VALUES;
  assertVectorClose(actualSeval, expectedSeval, 'SEVAL', 2e-6, 2e-6);

  const actualDeval = Float64Array.from(SS, (ss) => spline.DEVAL(ss, X, actualXS, S, S.length));
  const expectedDeval = runDeval({ N: X.length, M: SS.length, X, XS: expectedXS, S, SS }).VALUES;
  assertVectorClose(actualDeval, expectedDeval, 'DEVAL', 2e-6, 2e-6);

  const actualD2val = Float64Array.from(SS, (ss) => spline.D2VAL(ss, X, actualXS, S, S.length));
  const expectedD2val = runD2val({ N: X.length, M: SS.length, X, XS: expectedXS, S, SS }).VALUES;
  assertVectorClose(actualD2val, expectedD2val, 'D2VAL', 2e-5, 2e-6);

  const actualSevall = Array.from(SS, (ss) => spline.SEVALL(ss, X, actualXS, S, S.length));
  const expectedSevall = runSevall({ N: X.length, M: SS.length, X, XS: expectedXS, S, SS });
  assertArrayOfObjectsClose(actualSevall, expectedSevall.XX, 'XX', 'SEVALL XX', 2e-6, 2e-6);
  assertArrayOfObjectsClose(actualSevall, expectedSevall.XXS, 'XXS', 'SEVALL XXS', 2e-6, 2e-6);
  assertArrayOfObjectsClose(actualSevall, expectedSevall.XXSS, 'XXSS', 'SEVALL XXSS', 2e-5, 2e-6);
});

test('SPLIND matches Fortran for zero 2nd, zero 3rd, specified derivative, and N=2 special case', () => {
  const S = new Float64Array([0.0, 0.2, 0.45, 0.7, 1.0]);
  const X = new Float64Array([0.0, 0.4, 0.1, 0.8, 1.2]);

  const zero2Actual = spline.SPLIND(X.slice(), new Float64Array(X.length), S, S.length, 999.0, 999.0);
  const zero2Expected = runSplind({ N: X.length, X, S, XS1: 999.0, XS2: 999.0 }).XS;
  assertVectorClose(zero2Actual, zero2Expected, 'SPLIND zero2', 2e-6, 2e-6);

  const zero3Actual = spline.SPLIND(X.slice(), new Float64Array(X.length), S, S.length, -999.0, -999.0);
  const zero3Expected = runSplind({ N: X.length, X, S, XS1: -999.0, XS2: -999.0 }).XS;
  assertVectorClose(zero3Actual, zero3Expected, 'SPLIND zero3', 2e-6, 2e-6);

  const fixedActual = spline.SPLIND(X.slice(), new Float64Array(X.length), S, S.length, 0.25, -0.1);
  const fixedExpected = runSplind({ N: X.length, X, S, XS1: 0.25, XS2: -0.1 }).XS;
  assertVectorClose(fixedActual, fixedExpected, 'SPLIND fixed', 2e-6, 2e-6);

  const X2 = new Float64Array([0.0, 1.0]);
  const S2 = new Float64Array([0.0, 0.5]);
  const actual2 = spline.SPLIND(X2.slice(), new Float64Array(2), S2, 2, -999.0, -999.0);
  const expected2 = runSplind({ N: 2, X: X2, S: S2, XS1: -999.0, XS2: -999.0 }).XS;
  assertVectorClose(actual2, expected2, 'SPLIND n=2', 2e-6, 2e-6);
});

test('SPLINA matches Fortran and handles singleton inputs', () => {
  const S = new Float64Array([0.0, 0.3, 0.55, 0.8, 1.0]);
  const X = new Float64Array([0.0, 0.5, 0.6, 0.3, 0.1]);

  const actual = spline.SPLINA(X.slice(), new Float64Array(X.length), S, S.length);
  const expected = runSplina({ N: X.length, X, S }).XS;
  assertVectorClose(actual, expected, 'SPLINA', 2e-6, 2e-6);

  const singleton = spline.SPLINA(new Float64Array([3.25]), new Float64Array(1), new Float64Array([0.0]), 1);
  assert.equal(singleton[0], 0.0);
});

test('CURV and CURVS match Fortran on a splined planar curve', () => {
  const X = new Float64Array([0.0, 0.5, 1.0, 1.5, 2.0]);
  const Y = new Float64Array([0.0, 0.4, 0.1, 0.8, 1.2]);
  const S = spline.SCALC(X, Y, new Float64Array(X.length), X.length);
  const XS = spline.SPLINE(X.slice(), new Float64Array(X.length), S, X.length);
  const YS = spline.SPLINE(Y.slice(), new Float64Array(Y.length), S, Y.length);
  const SS = new Float64Array([S[0], 0.25 * S[S.length - 1], 0.6 * S[S.length - 1], S[S.length - 1]]);

  const actualCurv = Float64Array.from(SS, (ss) => spline.CURV(ss, X, XS, Y, YS, S, X.length));
  const expectedCurv = runCurv({ N: X.length, M: SS.length, X, XS, Y, YS, S, SS }).VALUES;
  assertVectorClose(actualCurv, expectedCurv, 'CURV', 2e-5, 2e-6);

  const actualCurvs = Float64Array.from(SS, (ss) => spline.CURVS(ss, X, XS, Y, YS, S, X.length));
  const expectedCurvs = runCurvs({ N: X.length, M: SS.length, X, XS, Y, YS, S, SS }).VALUES;
  assertVectorClose(actualCurvs, expectedCurvs, 'CURVS', 2e-4, 2e-5);
});

test('SINVRT and NEARPT match Fortran', () => {
  const X = new Float64Array([0.0, 0.4, 0.8, 1.2, 1.8]);
  const Y = new Float64Array([0.0, 0.3, 0.1, 0.6, 1.0]);
  const S = spline.SCALC(X, Y, new Float64Array(X.length), X.length);
  const XS = spline.SPLINE(X.slice(), new Float64Array(X.length), S, X.length);
  const YS = spline.SPLINE(Y.slice(), new Float64Array(Y.length), S, Y.length);

  const actualInverse = spline.SINVRT(0.35 * S[S.length - 1], 0.75, X, XS, S, X.length);
  const expectedInverse = runSinvrt({
    N: X.length,
    XI: 0.75,
    SI: 0.35 * S[S.length - 1],
    X,
    XS,
    S,
  }).SI;
  assertClose(actualInverse.SI, expectedInverse, 'SINVRT', 2e-5, 2e-6);

  const actualNear = spline.NEARPT(0.9, 0.35, 0.45 * S[S.length - 1], X, XS, Y, YS, S, X.length);
  const expectedNear = runNearpt({
    N: X.length,
    XPNT: 0.9,
    YPNT: 0.35,
    SNEAR: 0.45 * S[S.length - 1],
    X,
    XP: XS,
    Y,
    YP: YS,
    S,
  }).SNEAR;
  assertClose(actualNear.SNEAR, expectedNear, 'NEARPT', 1e-4, 2e-6);
});

test('SCALC and SEGSPL match Fortran', () => {
  const X = new Float64Array([0.0, 1.0, 2.0, 3.0, 3.5]);
  const Y = new Float64Array([0.0, 0.5, 0.5, 1.5, 2.0]);

  const actualS = spline.SCALC(X, Y, new Float64Array(X.length), X.length);
  const expectedS = runScalc({ N: X.length, X, Y }).S;
  assertVectorClose(actualS, expectedS, 'SCALC', 2e-6, 2e-6);

  const segX = new Float64Array([0.0, 0.5, 1.0, 1.4, 2.0, 2.6]);
  const segS = new Float64Array([0.0, 0.4, 0.9, 0.9, 1.4, 2.0]);
  const actualXS = spline.SEGSPL(segX.slice(), new Float64Array(segX.length), segS, segX.length);
  const expectedXS = runSegspl({ N: segX.length, X: segX, S: segS }).XS;
  assertVectorClose(actualXS, expectedXS, 'SEGSPL', 2e-6, 2e-6);
});

test('INTERS matches Fortran for two intersecting splined curves', () => {
  const X1 = new Float64Array([0.0, 1.0, 2.0]);
  const Y1 = new Float64Array([0.0, 1.0, 2.0]);
  const S1 = spline.SCALC(X1, Y1, new Float64Array(3), 3);
  const XS1 = spline.SPLINE(X1.slice(), new Float64Array(3), S1, 3);
  const YS1 = spline.SPLINE(Y1.slice(), new Float64Array(3), S1, 3);

  const X2 = new Float64Array([0.0, 1.0, 2.0]);
  const Y2 = new Float64Array([2.0, 1.0, 0.0]);
  const S2 = spline.SCALC(X2, Y2, new Float64Array(3), 3);
  const XS2 = spline.SPLINE(X2.slice(), new Float64Array(3), S2, 3);
  const YS2 = spline.SPLINE(Y2.slice(), new Float64Array(3), S2, 3);

  const actual = spline.INTERS(0.7 * S1[S1.length - 1], 0.45 * S2[S2.length - 1], X1, XS1, Y1, YS1, S1, 3, X2, XS2, Y2, YS2, S2, 3);
  const expected = runInters({
    N1: 3,
    N2: 3,
    SS1: 0.7 * S1[S1.length - 1],
    SS2: 0.45 * S2[S2.length - 1],
    X1,
    XS1,
    Y1,
    YS1,
    S1,
    X2,
    XS2,
    Y2,
    YS2,
    S2,
  });

  assert.equal(actual.OK, expected.OK);
  assertClose(actual.SS1, expected.SS1, 'INTERS SS1', 2e-5, 2e-6);
  assertClose(actual.SS2, expected.SS2, 'INTERS SS2', 2e-5, 2e-6);
});

test('SEVLIN, SSEVLIN, and DSEVLIN match Fortran', () => {
  const X = new Float64Array([0.0, 0.5, 1.5, 1.0, 2.0]);
  const S = new Float64Array([0.0, 0.25, 0.75, 1.0, 1.6]);
  const SS = new Float64Array([-0.1, 0.2, 0.8, 1.4]);

  const actualSevlin = Array.from(SS, (ss) => spline.SEVLIN(ss, X, S, X.length));
  const expectedSevlin = runSevlin({ N: X.length, M: SS.length, X, S, SS });
  assertArrayOfObjectsClose(actualSevlin, expectedSevlin.XX, 'XX', 'SEVLIN XX', 2e-6, 2e-6);
  assertArrayOfObjectsClose(actualSevlin, expectedSevlin.XXS, 'XXS', 'SEVLIN XXS', 2e-6, 2e-6);

  const actualSsevlin = Float64Array.from(SS, (ss) => spline.SSEVLIN(ss, X, S, X.length));
  const expectedSsevlin = runSsevlin({ N: X.length, M: SS.length, X, S, SS }).VALUES;
  assertVectorClose(actualSsevlin, expectedSsevlin, 'SSEVLIN', 2e-6, 2e-6);

  const actualDsevlin = Float64Array.from(SS, (ss) => spline.DSEVLIN(ss, X, S, X.length));
  const expectedDsevlin = runDsevlin({ N: X.length, M: SS.length, X, S, SS }).VALUES;
  assertVectorClose(actualDsevlin, expectedDsevlin, 'DSEVLIN', 2e-6, 2e-6);
});

test('spline module preserves key error behaviors', () => {
  assert.throws(
    () => spline.SPLINE(new Float64Array(1001), new Float64Array(1001), new Float64Array(1001), 1001),
    /array overflow/i,
  );
  assert.throws(
    () => spline.SPLIND(new Float64Array(1001), new Float64Array(1001), new Float64Array(1001), 1001, 999.0, 999.0),
    /array overflow/i,
  );
  assert.throws(
    () => spline.SEGSPL(new Float64Array([0.0, 1.0, 2.0]), new Float64Array(3), new Float64Array([0.0, 0.0, 1.0]), 3),
    /First input point duplicated/i,
  );
  assert.throws(
    () => spline.SEGSPL(new Float64Array([0.0, 1.0, 2.0]), new Float64Array(3), new Float64Array([0.0, 1.0, 1.0]), 3),
    /Last  input point duplicated|Last input point duplicated/i,
  );
});
