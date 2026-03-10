'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const modify = require('../js/modify.js');
const { SPLINE } = require('../js/spline.js');
const { compileFortranDriver, runSort, runCrsmod } = require('./helpers/fortran-modify.js');

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

test.before(() => {
  compileFortranDriver();
});

test('SORT matches Fortran including duplicate-pair elimination', () => {
  const S = new Float64Array([0.70, 0.20, 0.20, 0.40, 0.10, 0.10, 0.60]);
  const W = new Float64Array([7.0, 2.0, 3.0, 4.0, 5.0, 6.0, 1.0]);

  const actualS = S.slice();
  const actualW = W.slice();
  const actualNW = modify.SORT(S.length, actualS, actualW);
  const expected = runSort({ NW: S.length, S, W });

  assert.equal(actualNW, expected.NW, 'SORT NW');
  assertVectorClose(actualS.slice(0, actualNW), expected.S, 'SORT S', 2e-6, 2e-6);
  assertVectorClose(actualW.slice(0, actualNW), expected.W, 'SORT W', 2e-6, 2e-6);
});

test('CRSMOD matches Fortran for a free-form edit with unsorted cursor input', () => {
  const X = new Float64Array([0.10, 0.22, 0.36, 0.50, 0.67, 0.83, 0.97]);
  const baseY = new Float64Array([0.80, 0.55, 0.42, 0.30, 0.22, 0.15, 0.10]);
  const YP = SPLINE(baseY.slice(), new Float64Array(baseY.length), X, X.length);
  const XOFF = 0.05;
  const XSF = 1.70;
  const YOFF = -0.10;
  const YSF = 2.30;
  const events = [
    plotEvent(0.72, 0.24, XOFF, XSF, YOFF, YSF),
    plotEvent(0.28, 0.60, XOFF, XSF, YOFF, YSF),
    plotEvent(0.52, 0.44, XOFF, XSF, YOFF, YSF),
    plotEvent(0.84, 0.18, XOFF, XSF, YOFF, YSF),
    plotEvent(0.84, 0.26, XOFF, XSF, YOFF, YSF),
    plotEvent(0.84, 0.34, XOFF, XSF, YOFF, YSF),
  ];

  const actualY = baseY.slice();
  const actual = modify.CRSMOD(
    X.length,
    X,
    actualY,
    YP,
    XOFF,
    XSF,
    YOFF,
    YSF,
    0.02,
    12,
    false,
    { events },
  );
  const expected = runCrsmod({
    N: X.length,
    X,
    Y: baseY,
    YP,
    XOFF,
    XSF,
    YOFF,
    YSF,
    SSIZ: 0.02,
    NSPLT: 12,
    LSLOPE: false,
    events,
  });

  assert.equal(actual.IMOD1, expected.IMOD1, 'CRSMOD free IMOD1');
  assert.equal(actual.IMOD2, expected.IMOD2, 'CRSMOD free IMOD2');
  assertVectorClose(actualY, expected.Y, 'CRSMOD free Y', 2e-6, 2e-6);
  assert.equal(actual.aborted, false);
  assert.equal(actual.modified, true);
  assert.ok(actual.previewCurve.length > 0);
});

test('CRSMOD matches Fortran for a slope-locked edit with zoom and unzoom keys', () => {
  const X = new Float64Array([0.00, 0.18, 0.33, 0.52, 0.71, 0.89, 1.00]);
  const baseY = new Float64Array([0.00, 0.20, 0.55, 0.40, 0.30, 0.28, 0.25]);
  const YP = SPLINE(baseY.slice(), new Float64Array(baseY.length), X, X.length);
  const XOFF = -0.15;
  const XSF = 1.40;
  const YOFF = -0.25;
  const YSF = 1.80;
  const events = [
    { x: 0.0, y: 0.0, key: 'z' },
    plotEvent(-0.15, 0.90, XOFF, XSF, YOFF, YSF),
    { x: 0.0, y: 0.0, key: 'u' },
    plotEvent(0.25, 0.60, XOFF, XSF, YOFF, YSF),
    plotEvent(0.60, 0.10, XOFF, XSF, YOFF, YSF),
    plotEvent(1.20, -0.30, XOFF, XSF, YOFF, YSF),
    plotEvent(1.20, -0.25, XOFF, XSF, YOFF, YSF),
    plotEvent(1.20, -0.20, XOFF, XSF, YOFF, YSF),
  ];

  const actualY = baseY.slice();
  const actual = modify.CRSMOD(
    X.length,
    X,
    actualY,
    YP,
    XOFF,
    XSF,
    YOFF,
    YSF,
    0.03,
    10,
    true,
    { events },
  );
  const expected = runCrsmod({
    N: X.length,
    X,
    Y: baseY,
    YP,
    XOFF,
    XSF,
    YOFF,
    YSF,
    SSIZ: 0.03,
    NSPLT: 10,
    LSLOPE: true,
    events,
  });

  assert.equal(actual.IMOD1, expected.IMOD1, 'CRSMOD slope IMOD1');
  assert.equal(actual.IMOD2, expected.IMOD2, 'CRSMOD slope IMOD2');
  assertVectorClose(actualY, expected.Y, 'CRSMOD slope Y', 2e-6, 2e-6);
  assert.equal(actual.replotCount, 2);
  assert.equal(actual.aborted, false);
  assert.equal(actual.symbols.filter((symbol) => symbol.kind === 'circle').length, 2);
});

test('CRSMOD aborts before modifying the curve', () => {
  const X = new Float64Array([0.0, 0.2, 0.5, 0.8, 1.0]);
  const baseY = new Float64Array([0.1, 0.4, 0.3, 0.2, 0.15]);
  const YP = SPLINE(baseY.slice(), new Float64Array(baseY.length), X, X.length);
  const events = [{ x: 0.0, y: 0.0, key: 'q' }];

  const actualY = baseY.slice();
  const actual = modify.CRSMOD(X.length, X, actualY, YP, 0.0, 1.0, 0.0, 1.0, 0.02, 8, false, { events });
  const expected = runCrsmod({
    N: X.length,
    X,
    Y: baseY,
    YP,
    XOFF: 0.0,
    XSF: 1.0,
    YOFF: 0.0,
    YSF: 1.0,
    SSIZ: 0.02,
    NSPLT: 8,
    LSLOPE: false,
    events,
  });

  assert.equal(actual.IMOD1, expected.IMOD1, 'CRSMOD abort IMOD1');
  assert.equal(actual.IMOD2, expected.IMOD2, 'CRSMOD abort IMOD2');
  assertVectorClose(actualY, expected.Y, 'CRSMOD abort Y', 2e-8, 2e-8);
  assert.equal(actual.aborted, true);
  assert.equal(actual.modified, false);
});

test('CRSMOD preserves the original degenerate duplicate-input behavior', () => {
  const X = new Float64Array([0.0, 0.25, 0.5, 0.75, 1.0]);
  const baseY = new Float64Array([0.3, 0.5, 0.4, 0.35, 0.2]);
  const YP = SPLINE(baseY.slice(), new Float64Array(baseY.length), X, X.length);
  const events = [
    plotEvent(0.40, 0.25, 0.0, 1.0, 0.0, 1.0),
    plotEvent(0.40, 0.30, 0.0, 1.0, 0.0, 1.0),
    plotEvent(0.40, 0.35, 0.0, 1.0, 0.0, 1.0),
    plotEvent(0.40, 0.40, 0.0, 1.0, 0.0, 1.0),
  ];

  const actualY = baseY.slice();
  const actual = modify.CRSMOD(X.length, X, actualY, YP, 0.0, 1.0, 0.0, 1.0, 0.02, 8, false, { events });
  const expected = runCrsmod({
    N: X.length,
    X,
    Y: baseY,
    YP,
    XOFF: 0.0,
    XSF: 1.0,
    YOFF: 0.0,
    YSF: 1.0,
    SSIZ: 0.02,
    NSPLT: 8,
    LSLOPE: false,
    events,
  });

  assert.equal(actual.IMOD1, expected.IMOD1, 'CRSMOD degenerate IMOD1');
  assert.equal(actual.IMOD2, expected.IMOD2, 'CRSMOD degenerate IMOD2');
  assertVectorClose(actualY, expected.Y, 'CRSMOD degenerate Y', 2e-8, 2e-8);
  assert.equal(actual.modified, false);
  assert.match(actual.reason, /Need at least 2 points/);
});

test('CRSMOD handles numeric key codes and abort after the first committed point', () => {
  const X = new Float64Array([0.0, 0.25, 0.5, 0.75, 1.0]);
  const baseY = new Float64Array([0.2, 0.3, 0.4, 0.3, 0.2]);
  const YP = SPLINE(baseY.slice(), new Float64Array(baseY.length), X, X.length);
  const events = [
    { x: 1.5, y: 0.45, key: 0 },
    { x: 0.0, y: 0.0, key: 'q' },
  ];

  const actualY = baseY.slice();
  const actual = modify.CRSMOD(X.length, X, actualY, YP, 0.0, 1.0, 0.0, 1.0, 0.02, 8, false, { events });

  assert.equal(actual.aborted, true);
  assert.equal(actual.modified, false);
  assert.equal(actual.KK, 1);
  assert.equal(actual.symbols.length, 1);
  assertClose(actual.symbols[0].x, 1.0, 'CRSMOD numeric-key clamp x', 0.0, 0.0);
  assertVectorClose(actualY, baseY, 'CRSMOD numeric-key abort Y', 0.0, 0.0);
});

test('CRSMOD throws if the cursor-event stream ends before termination', () => {
  const X = new Float64Array([0.0, 0.4, 0.7, 1.0]);
  const baseY = new Float64Array([0.1, 0.5, 0.35, 0.2]);
  const YP = SPLINE(baseY.slice(), new Float64Array(baseY.length), X, X.length);

  assert.throws(
    () => modify.CRSMOD(X.length, X, baseY.slice(), YP, 0.0, 1.0, 0.0, 1.0, 0.02, 8, false, {
      events: [{ x: 0.3, y: 0.4, key: '' }],
    }),
    /insufficient cursor events/i,
  );
});

test('CRSMOD slope-lock clamps the terminating point to the lower bound', () => {
  const X = new Float64Array([0.0, 0.2, 0.45, 0.7, 1.0]);
  const baseY = new Float64Array([0.0, 0.25, 0.5, 0.35, 0.2]);
  const YP = SPLINE(baseY.slice(), new Float64Array(baseY.length), X, X.length);
  const events = [
    plotEvent(0.30, 0.45, 0.0, 1.0, 0.0, 1.0),
    plotEvent(0.15, 0.40, 0.0, 1.0, 0.0, 1.0),
    plotEvent(-0.10, 0.30, 0.0, 1.0, 0.0, 1.0),
    plotEvent(-0.10, 0.25, 0.0, 1.0, 0.0, 1.0),
    plotEvent(-0.10, 0.20, 0.0, 1.0, 0.0, 1.0),
  ];

  const actual = modify.CRSMOD(X.length, X, baseY.slice(), YP, 0.0, 1.0, 0.0, 1.0, 0.02, 8, true, { events });

  assert.equal(actual.aborted, false);
  assertClose(actual.W1[0], 0.0, 'CRSMOD lower-clamp sorted first x', 0.0, 0.0);
});
