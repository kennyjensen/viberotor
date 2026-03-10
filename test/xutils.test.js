'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const xutils = require('../js/xutils.js');
const {
  compileFortranDriver,
  runBaksub,
  runGauss,
  runLudcmp,
  runSetexp,
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

function cloneMatrix(values) {
  return values.map((row) => Float64Array.from(row));
}

test.before(() => {
  compileFortranDriver();
});

test('SETEXP matches Fortran for stretched, uniform, and N=3 special cases', () => {
  {
    const S = new Float64Array([0.0, 0.12, 0.0, 0.0, 0.0, 0.0]);
    const actual = xutils.SETEXP(S.slice(), 1.75, S.length);
    const expected = runSetexp({ NN: S.length, SMAX: 1.75, S }).S;
    assertVectorClose(actual, expected, 'SETEXP stretched', 2e-6, 2e-6);
  }

  {
    const S = new Float64Array([0.0, 0.25, 0.0, 0.0, 0.0]);
    const actual = xutils.SETEXP(S.slice(), 1.0, S.length);
    const expected = runSetexp({ NN: S.length, SMAX: 1.0, S }).S;
    assertVectorClose(actual, expected, 'SETEXP uniform', 2e-6, 2e-6);
  }

  {
    const S = new Float64Array([1.0, 1.4, 0.0]);
    const actual = xutils.SETEXP(S.slice(), 2.25, S.length);
    const expected = runSetexp({ NN: S.length, SMAX: 2.25, S }).S;
    assertVectorClose(actual, expected, 'SETEXP n=3', 2e-6, 2e-6);
  }
});

test('GAUSS matches Fortran for pivoting and multiple right-hand sides', () => {
  const Z = [
    new Float64Array([0.02, 1.4, -0.3, 0.5]),
    new Float64Array([1.1, -0.2, 0.8, -0.4]),
    new Float64Array([0.3, 0.6, 1.5, 0.7]),
    new Float64Array([-0.5, 0.9, 0.2, 1.2]),
  ];
  const R = [
    new Float64Array([1.0, -0.5]),
    new Float64Array([0.3, 0.8]),
    new Float64Array([-0.2, 1.1]),
    new Float64Array([0.7, -0.4]),
  ];

  const actual = xutils.GAUSS(4, 4, cloneMatrix(Z), cloneMatrix(R), 2);
  const expected = runGauss({ NSIZ: 4, NN: 4, NRHS: 2, Z, R });

  assertMatrixClose(actual.Z, expected.Z, 'GAUSS Z', 2e-6, 2e-6);
  assertMatrixClose(actual.R, expected.R, 'GAUSS R', 2e-6, 2e-6);
});

test('LUDCMP and BAKSUB match Fortran LU factorization and solve behavior', () => {
  const A = [
    new Float64Array([0.4, 1.2, -0.6, 0.5]),
    new Float64Array([1.1, -0.7, 0.8, 0.3]),
    new Float64Array([0.2, 0.9, 1.6, -0.4]),
    new Float64Array([-0.3, 0.5, 0.7, 1.4]),
  ];
  const B = new Float64Array([0.8, -0.1, 1.2, 0.4]);

  const actualLu = xutils.LUDCMP(4, 4, cloneMatrix(A), new Int32Array(4));
  const expectedLu = runLudcmp({ NSIZ: 4, N: 4, A });

  assertMatrixClose(actualLu.A, expectedLu.A, 'LUDCMP A', 2e-6, 2e-6);
  assertVectorClose(actualLu.INDX, expectedLu.INDX, 'LUDCMP INDX', 0.0, 0.0);

  const actualB = xutils.BAKSUB(4, 4, cloneMatrix(expectedLu.A), Int32Array.from(expectedLu.INDX), B.slice());
  const expectedB = runBaksub({
    NSIZ: 4,
    N: 4,
    A: expectedLu.A,
    INDX: expectedLu.INDX,
    B,
  }).B;

  assertVectorClose(actualB, expectedB, 'BAKSUB', 2e-6, 2e-6);
});

test('xutils preserves important original error behavior', () => {
  assert.throws(
    () => xutils.SETEXP(new Float64Array([0.0, 1.0]), 2.0, 2),
    /Cannot fill array/i,
  );
  assert.throws(
    () => xutils.LUDCMP(251, 251, Array.from({ length: 251 }, () => new Float64Array(251)), new Int32Array(251)),
    /array overflow/i,
  );
});
