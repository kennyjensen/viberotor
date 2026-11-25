'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const xoper = require('../js/xoper.js');
const { operatingState } = require('./helpers/port-audit-state.js');
const { runAper } = require('./helpers/fortran-xoper.js');
const { buildSingleReference, buildDoubleReference } = require('./helpers/fortran-port-audit.js');

let singleBinary;
let doubleBinary;
test.before(() => {
  // Separate outputs from xoper.test.js, which can compile concurrently.
  singleBinary = buildSingleReference();
  doubleBinary = buildDoubleReference();
});

function close(actual, expected, label, absolute, relative) {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected), `${label}: nonfinite result`);
  assert.ok(Math.abs(actual - expected) <= Math.max(absolute, relative * Math.abs(expected)), `${label}: ${actual} != ${expected}`);
}

for (const ii of [5, 20, 50]) {
  for (const mode of ['graded', 'potential', 'vortex', 'duct']) {
    if (mode === 'vortex' && ii === 50) continue;
    for (const free of [false, true]) {
      test(`APER ${mode}, II=${ii}, FREE=${free} matches both Fortran precisions`, () => {
        const state = operatingState(ii, mode, free);
        const single = runAper(state, 4, 2, true, singleBinary);
        const double = runAper(state, 4, 2, true, doubleBinary);
        assert.equal(xoper.APER(state, 4, 2, true).converged, true);
        for (const [label, reference] of [['single', single], ['double', double]]) {
          assert.equal(reference.CONV, state.CONV);
          assert.equal(reference.IWTYP, state.IWTYP);
          const tolerance = label === 'double' ? 1e-10 : 1e-6;
          for (const field of ['ADV', 'ADW', 'TTOT', 'PTOT', 'QTOT']) {
            close(state[field], reference[field], `${label}.${field}`, tolerance, tolerance);
          }
          for (const field of ['BETA', 'GAM', 'CL', 'CD', 'CM']) {
            // Single precision loses up to 3.86e-6 in tip CL for this sweep;
            // the double reference agrees to 4.33e-15. The airfoil tests
            // already allow 5e-6 absolute error in GETCLCDCM outputs.
            const absolute = field === 'CL' && label === 'single' ? 5e-6 : tolerance;
            for (let i = 0; i < ii; i += 1) close(state[field][i], reference[field][i], `${label}.${field}[${i}]`, absolute, tolerance);
          }
        }
      });
    }
  }
}
