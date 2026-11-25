'use strict';

const { RDLINE } = require('../js/xio.js');
const { PI } = require('../js/xoper.js');
const { SPLINE, SEVAL } = require('../js/spline.js');

// Read the modern restart records without running LOAD's analysis or respacing
// the source geometry. Only import fields supported by both workbench backends.
function exampleRotor(text) {
  const lines = text.split(/\r?\n/), cursor = { index: 0 };
  const read = () => RDLINE(lines, cursor).trim();
  const numbers = count => {
    const values = read().split(/\s+/).map(Number);
    if (values.length !== count || !values.every(Number.isFinite)) throw new Error('Invalid XROTOR example record.');
    return values;
  };
  if (!read().startsWith('XROTOR VERSION:')) throw new Error('Expected a modern XROTOR example.');
  const name = read();
  const [density, soundSpeed, viscosity] = numbers(4);
  const [radius, velocity, advance] = numbers(4);
  const [hub] = numbers(2);
  const [sections] = numbers(1);
  for (let i = 0; i < sections; i += 1) {
    numbers(1); numbers(4); numbers(4); numbers(3); numbers(2);
  }
  const [free, duct] = read().split(/\s+/).map(flag => flag === 'T');
  const [stations, blades] = numbers(2);
  const geometry = Array.from({ length: stations }, () => {
    const [r, chord, pitch] = numbers(4);
    return { r, chord: chord * radius, pitch };
  });
  const ductVelocityRecord = read();
  const ductVelocity = ductVelocityRecord === 'END' ? 1 : Number(ductVelocityRecord);
  const radii = Float64Array.from(geometry, row => row.r);
  const pitches = Float64Array.from(geometry, row => row.pitch);
  const derivatives = SPLINE(pitches, new Float64Array(stations), radii, stations);
  return {
    name, blades, radius, hub, geometry, stations, density, soundSpeed, viscosity,
    velocity, rpm: 30 * velocity / (PI * radius * advance), free, duct, ductVelocity,
    rootChord: geometry[0].chord, tipChord: geometry.at(-1).chord,
    pitch: SEVAL(0.75, pitches, derivatives, radii, stations),
  };
}

module.exports = exampleRotor;
