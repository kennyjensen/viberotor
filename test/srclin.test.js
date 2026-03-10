'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const srclin = require('../js/srclin.js');
const { compileFortranDriver, runSrclin, runSrcvel } = require('./helpers/fortran-xnoise.js');

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

test.before(() => {
  compileFortranDriver();
});

test('SRCLIN matches the original axisymmetric source-strength solve', () => {
  const ZB = new Float64Array([-1.2, -0.6, 0.0, 0.7, 1.4]);
  const RB = new Float64Array([0.35, 0.55, 0.72, 0.58, 0.32]);

  const actual = srclin.SRCLIN(ZB.length, ZB, RB, new Float64Array(ZB.length - 1));
  const expected = runSrclin({ NB: ZB.length, ZB, RB }).SRC;

  assertVectorClose(actual, expected, 'SRCLIN', 2e-5, 2e-6);
});

test('SRCVEL matches the original point-source velocity evaluation', () => {
  const ZB = new Float64Array([-1.2, -0.6, 0.0, 0.7, 1.4]);
  const RB = new Float64Array([0.35, 0.55, 0.72, 0.58, 0.32]);
  const expectedSrc = runSrclin({ NB: ZB.length, ZB, RB }).SRC;

  const actual = srclin.SRCVEL(ZB.length, ZB, expectedSrc, 0.4, 0.85);
  const expected = runSrcvel({ NB: ZB.length, ZB, SRC: expectedSrc, Z: 0.4, R: 0.85 });

  assertClose(actual.U, expected.U, 'SRCVEL U', 2e-5, 2e-6);
  assertClose(actual.V, expected.V, 'SRCVEL V', 2e-5, 2e-6);
});

test('srclin preserves the original local-array overflow guard', () => {
  assert.throws(
    () => srclin.SRCLIN(201, new Float64Array(201), new Float64Array(201), new Float64Array(200)),
    /Local array overflow/i,
  );
});
