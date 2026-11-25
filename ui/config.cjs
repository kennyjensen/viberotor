'use strict';

module.exports = Object.freeze({
  name: 'Three-blade baseline', blades: 3, radius: 1.4, hub: 0.2,
  rootChord: 0.26, tipChord: 0.12, pitch: 32, rpm: 900, velocity: 45,
  density: 1.225, soundSpeed: 340, viscosity: 1.789e-5, stations: 30,
  formulation: 'graded', free: true, duct: false, ductVelocity: 1,
  iterations: 60, targetType: 'thrust', target: 600, designCl: 0.6,
});
