'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const vortex = require('../js/vortex.js');
const { compileFortranDriver, runVorsegvel, runVrtxco } = require('./helpers/fortran-xnoise.js');

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

function assertTensor3Close(actual, expected, label, absTol = 1e-6, relTol = 1e-6) {
  assert.equal(actual.length, expected.length, `${label}: plane count mismatch`);
  for (let k = 0; k < actual.length; k += 1) {
    assertMatrixClose(actual[k], expected[k], `${label}[${k}]`, absTol, relTol);
  }
}

test.before(() => {
  compileFortranDriver();
});

test('VORSEGVEL matches Fortran for a general vortex segment', () => {
  const A = new Float64Array([0.8, -0.35, 0.6]);
  const B = new Float64Array([1.4, 0.5, -0.2]);

  const actual = vortex.VORSEGVEL(A, B);
  const expected = runVorsegvel({ A, B });

  assertVectorClose(actual.UVW, expected.UVW, 'VORSEGVEL UVW', 2e-6, 2e-6);
  assertMatrixClose(actual.UVW_A, expected.UVW_A, 'VORSEGVEL UVW_A', 2e-6, 2e-6);
  assertMatrixClose(actual.UVW_B, expected.UVW_B, 'VORSEGVEL UVW_B', 2e-6, 2e-6);
});

test('VORSEGVEL matches Fortran for the zero-length branch', () => {
  const A = new Float64Array([0.0, 0.0, 0.0]);
  const B = new Float64Array([1.2, -0.3, 0.7]);

  const actual = vortex.VORSEGVEL(A, B);
  const expected = runVorsegvel({ A, B });

  assertVectorClose(actual.UVW, expected.UVW, 'VORSEGVEL zero UVW', 0.0, 0.0);
  assertMatrixClose(actual.UVW_A, expected.UVW_A, 'VORSEGVEL zero UVW_A', 0.0, 0.0);
  assertMatrixClose(actual.UVW_B, expected.UVW_B, 'VORSEGVEL zero UVW_B', 0.0, 0.0);
});

test('VRTXCO matches Fortran in duct mode', () => {
  const IMAX = 4;
  const II = 3;
  const NBLDS = 3;
  const XI = new Float64Array([0.35, 0.62, 0.88, 0.0]);
  const XV = new Float64Array([0.3, 0.55, 0.78, 1.0]);
  const GAM = new Float64Array([0.9, 0.5, 0.2, 0.0]);

  const actual = vortex.VRTXCO(IMAX, II, NBLDS, true, 0.09, XI, XV, GAM, 0.6);
  const expected = runVrtxco({
    IMAX,
    II,
    NBLDS,
    LDUCT: true,
    RAKE: 0.09,
    XI,
    XV,
    GAM,
    ADW: 0.6,
  });

  assert.equal(actual.NTHET, expected.NTHET);
  assert.equal(actual.spacingOverflow, expected.spacingOverflow);
  assertTensor3Close(actual.VIND_GAM.map((plane) => plane.slice(0, II).map((row) => row.slice(0, II))), expected.VIND_GAM, 'VRTXCO duct VIND_GAM', 2e-6, 2e-6);
  assertMatrixClose(actual.VIND_ADW.map((row) => row.slice(0, II)), expected.VIND_ADW, 'VRTXCO duct VIND_ADW', 2e-6, 2e-6);
});

test('VRTXCO matches Fortran for the open-wake discrete integration', () => {
  const IMAX = 4;
  const II = 3;
  const NBLDS = 2;
  const XI = new Float64Array([0.36, 0.58, 0.82, 0.0]);
  const XV = new Float64Array([0.28, 0.5, 0.74, 1.0]);
  const GAM = new Float64Array([0.85, 0.48, 0.22, 0.0]);

  const actual = vortex.VRTXCO(IMAX, II, NBLDS, false, 0.11, XI, XV, GAM, 0.55);
  const expected = runVrtxco({
    IMAX,
    II,
    NBLDS,
    LDUCT: false,
    RAKE: 0.11,
    XI,
    XV,
    GAM,
    ADW: 0.55,
  });

  assert.equal(actual.NTHET, expected.NTHET);
  assert.equal(actual.spacingOverflow, expected.spacingOverflow);
  assertTensor3Close(actual.VIND_GAM.map((plane) => plane.slice(0, II).map((row) => row.slice(0, II))), expected.VIND_GAM, 'VRTXCO open VIND_GAM', 5e-5, 2e-5);
  assertMatrixClose(actual.VIND_ADW.map((row) => row.slice(0, II)), expected.VIND_ADW, 'VRTXCO open VIND_ADW', 5e-5, 2e-5);
});

test('VRTXCO matches Fortran when the theta-spacing array overflows', () => {
  const IMAX = 2;
  const II = 1;
  const NBLDS = 1;
  const XI = new Float64Array([0.55, 0.0]);
  const XV = new Float64Array([0.5, 1.0]);
  const GAM = new Float64Array([0.35, 0.0]);

  const actual = vortex.VRTXCO(IMAX, II, NBLDS, false, 0.0, XI, XV, GAM, 0.01);
  const expected = runVrtxco({
    IMAX,
    II,
    NBLDS,
    LDUCT: false,
    RAKE: 0.0,
    XI,
    XV,
    GAM,
    ADW: 0.01,
  });

  assert.equal(actual.NTHET, expected.NTHET);
  assert.equal(actual.spacingOverflow, expected.spacingOverflow);
  assert.equal(actual.spacingOverflow, true);
  assertTensor3Close(actual.VIND_GAM.map((plane) => plane.slice(0, II).map((row) => row.slice(0, II))), expected.VIND_GAM, 'VRTXCO overflow VIND_GAM', 1e-4, 5e-5);
  assertMatrixClose(actual.VIND_ADW.map((row) => row.slice(0, II)), expected.VIND_ADW, 'VRTXCO overflow VIND_ADW', 1e-4, 5e-5);
});
