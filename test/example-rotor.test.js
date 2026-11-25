'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parse = require('../ui/example-rotor.cjs');
const runs = path.resolve(__dirname, '../third_party/Xrotor/runs');

test('example reader preserves source geometry and uncommon operating inputs', () => {
  const load = file => parse(fs.readFileSync(path.join(runs, file), 'utf8'));
  const f1d = load('prop/F1D.prop');
  assert.equal(f1d.hub, 0);
  assert.deepEqual(f1d.geometry[0], { r: 0.026168, chord: 0.017808 * 0.3, pitch: 93.391 });
  const duct = load('ducted/duct.prop');
  assert.equal(duct.duct, true);
  assert.equal(duct.velocity, 0.01);
  assert.equal(duct.blades, 6);
  assert.ok(Math.abs(duct.rpm - 16000) < 0.1);
  assert.equal(load('prop/ecruzer.prop').density, 1000);
});
