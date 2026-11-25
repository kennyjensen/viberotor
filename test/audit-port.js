'use strict';

// Standalone audit probes; a failed comparison sets a nonzero exit code.
// Run with: node test/audit-port.js
const xrotor = require('../js/xrotor.js');
const xoper = require('../js/xoper.js');
const xbend = require('../js/xbend.js');
const xdesi = require('../js/xdesi.js');
const { runAper } = require('./helpers/fortran-xoper.js');
const { buildDoubleReference, runStructural, runDesign, loadFields, designSensitivityFields } = require('./helpers/fortran-port-audit.js');
const { structuralState, designState, operatingState } = require('./helpers/port-audit-state.js');

let failures = 0;
let comparisons = 0;

function compare(actual, expected, absTol = 1e-6, relTol = 1e-6) {
  comparisons += 1;
  return Number.isFinite(actual) && Number.isFinite(expected)
    && Math.abs(actual - expected) <= Math.max(absTol, relTol * Math.abs(expected));
}

function report(label, pass, details = {}) {
  if (!pass) failures += 1;
  console.log(JSON.stringify({ label, pass, ...details }));
}

function structuralProbe() {
  const reference = runStructural();
  for (const realVelocity of [false, true]) {
    const state = structuralState();
    if (realVelocity) state.CSCALC = (i, s) => xoper.CSCALC(s, i);
    xbend.STLOAD(state);
    let pass = true;
    const differences = [];
    for (let i = 0; i < state.II; i += 1) {
      for (const field of loadFields) {
        const actual = state[field][i];
        const expected = reference[field][i];
        if (!compare(actual, expected)) {
          pass = false;
          differences.push({ field, station: i + 1, actual, expected });
        }
      }
    }
    report(realVelocity ? 'STLOAD with real CSCALC control' : 'STLOAD production default', pass, { differences });
  }
  for (const command of ['BEND', 'OPER', 'AERO']) {
    try {
      xrotor.XROTOR(structuralState(), { command, subcommand: command === 'AERO' ? 'DISP' : 'HELP' });
      report(`XROTOR ${command} dispatch`, true);
    } catch (error) {
      report(`XROTOR ${command} dispatch`, false, { error: error.message });
    }
  }
  try {
    xbend.BEND(structuralState(), { command: 'CLR' });
    report('BEND shared rotor state', true);
  } catch (error) {
    report('BEND shared rotor state', false, { error: error.message });
  }
}

function designProbe() {
  const expected = runDesign();
  const expectedDouble = runDesign(40, { real8: true });
  const state = designState();
  const result = xdesi.DEITER(state, 2);
  report('DEITER convergence', result.converged && expected.CONV && expectedDouble.CONV);
  for (const field of ['RMS', 'RLX', 'DEFF', 'TTOT', 'PTOT', ...designSensitivityFields]) {
    const singlePass = compare(state[field], expected[field], 4e-6, 4e-6);
    const doublePass = compare(state[field], expectedDouble[field], 1e-10, 1e-10);
    report(`DEITER shared ${field}`, singlePass && doublePass, {
      actual: state[field], expected: expected[field], expectedDouble: expectedDouble[field], converged: result.converged,
      lastIteration: result.history.at(-1)[field],
    });
  }
}

function operatingProbe() {
  const doubleBinary = buildDoubleReference();
  for (const ii of [5, 20, 50]) {
    for (const mode of ['graded', 'potential', 'vortex', 'duct']) {
      if (mode === 'vortex' && ii === 50) continue;
      for (const free of [false, true]) {
        const state = operatingState(ii, mode, free);
        const expected = runAper(state, 4, 2, true);
        const expectedDouble = runAper(state, 4, 2, true, doubleBinary);
        const result = xoper.APER(state, 4, 2, true);
        let pass = result.converged && expected.CONV && state.IWTYP === expected.IWTYP;
        let acceptedSinglePass = pass;
        let doublePass = result.converged && expectedDouble.CONV && state.IWTYP === expectedDouble.IWTYP;
        let maxDoubleDifference = 0;
        const differences = [];
        let maxSingleDifference = 0;
        for (const field of ['ADV', 'ADW', 'TTOT', 'PTOT', 'QTOT']) {
          maxSingleDifference = Math.max(maxSingleDifference, Math.abs(state[field] - expected[field]));
          doublePass = compare(state[field], expectedDouble[field], 1e-10, 1e-10) && doublePass;
          maxDoubleDifference = Math.max(maxDoubleDifference, Math.abs(state[field] - expectedDouble[field]));
          if (!compare(state[field], expected[field])) {
            pass = false;
            acceptedSinglePass = false;
            differences.push({ field, actual: state[field], expected: expected[field] });
          }
        }
        for (const field of ['BETA', 'GAM', 'CL', 'CD', 'CM']) {
          for (let i = 0; i < ii; i += 1) {
            // REAL(4) tip lift cancellation reaches 3.86e-6 in this sweep;
            // REAL(8) agrees below 5e-15. Reuse the airfoil CL absolute bound.
            acceptedSinglePass = compare(state[field][i], expected[field][i], field === 'CL' ? 5e-6 : 1e-6, 1e-6) && acceptedSinglePass;
            maxSingleDifference = Math.max(maxSingleDifference, Math.abs(state[field][i] - expected[field][i]));
            doublePass = compare(state[field][i], expectedDouble[field][i], 1e-10, 1e-10) && doublePass;
            maxDoubleDifference = Math.max(maxDoubleDifference, Math.abs(state[field][i] - expectedDouble[field][i]));
            if (!compare(state[field][i], expected[field][i])) {
              pass = false;
              differences.push({ field, station: i + 1, actual: state[field][i], expected: expected[field][i] });
            }
          }
        }
        report(`APER ${mode} II=${ii} FREE=${free}`, acceptedSinglePass && doublePass, {
          convergedJS: result.converged, convergedFortran: expected.CONV,
          singlePass: pass, acceptedSinglePass, doublePass, maxDoubleDifference, maxSingleDifference,
          differences: differences.slice(0, 8), differenceCount: differences.length,
        });
      }
    }
  }
}

structuralProbe();
designProbe();
operatingProbe();
console.log(JSON.stringify({ comparisons, failures }));
process.exitCode = failures ? 1 : 0;
