'use strict';

const xrotor = require('../js/xrotor.js');
const xoper = require('../js/xoper.js');
const xdesi = require('../js/xdesi.js');
const xnoise = require('../js/xnoise.js');
const { SPLINE, SEVAL } = require('../js/spline.js');

const defaults = require('./config.cjs');

function validate(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Rotor configuration must be an object.');
  const c = { ...defaults };
  for (const key of Object.keys(defaults)) if (input[key] !== undefined) c[key] = input[key];
  const bounds = {
    blades: [1, 12], radius: [0.05, 20], hub: [0, 0.8],
    rootChord: [0.001, 5], tipChord: [0.001, 5], pitch: [1, 75],
    rpm: [10, 30000], velocity: [0.01, 250], density: [0.01, 1500],
    soundSpeed: [100, 1800], viscosity: [1e-7, 0.1], stations: [5, 80],
    iterations: [1, 150], ductVelocity: [0.5, 2], target: [0.1, 1e7], designCl: [0.1, 1.2],
  };
  for (const [key, [lo, hi]] of Object.entries(bounds)) {
    c[key] = Number(c[key]);
    if (!Number.isFinite(c[key]) || c[key] < lo || c[key] > hi) throw new Error(`${key} must be between ${lo} and ${hi}.`);
  }
  for (const key of ['blades', 'stations', 'iterations']) if (!Number.isInteger(c[key])) throw new Error(`${key} must be a whole number.`);
  if (!['graded', 'potential', 'vortex'].includes(c.formulation)) throw new Error('Unknown wake formulation.');
  if (!['thrust', 'power'].includes(c.targetType)) throw new Error('Unknown design target.');
  c.name = String(c.name).slice(0, 80).trim() || 'Untitled rotor';
  for (const key of ['free', 'duct']) if (typeof c[key] !== 'boolean') throw new Error(`${key} must be true or false.`);
  if (input.geometry !== undefined) {
    const g = input.geometry;
    if (!Array.isArray(g) || g.length < 3 || g.length > 100) throw new Error('Geometry requires 3 to 100 radial stations.');
    c.geometry = g.map((row, i) => {
      if (!row || !['r', 'chord', 'pitch'].every(key => typeof row[key] === 'number' && Number.isFinite(row[key]))) throw new Error('Invalid blade station.');
      if (row.r <= 0 || row.r > 1 || row.chord <= 0 || row.chord > 5 || Math.abs(row.pitch) > 180 || (i && row.r <= g[i - 1].r)) throw new Error('Blade stations must have increasing radii and positive chords.');
      return { r: row.r, chord: row.chord, pitch: row.pitch };
    });
  }
  return c;
}

function makeState(input) {
  const c = validate(input);
  const state = xrotor.createState();
  xrotor.SETDEF(state);
  Object.assign(state, {
    NAME: c.name, II: c.stations, IINF: c.stations + Math.trunc(c.stations / 2),
    NBLDS: c.blades, RAD: c.radius, XI0: c.hub, XW0: c.hub, XITIP: 1,
    VEL: c.velocity, RHO: c.density, VSO: c.soundSpeed, RMU: c.viscosity,
    ADV: c.velocity / (c.radius * c.rpm * xoper.PI / 30),
    FAST: c.formulation === 'graded', VRTX: c.formulation === 'vortex',
    FREE: c.free, DUCT: c.duct, URDUCT: c.ductVelocity, NITERA: c.iterations,
    NITERD: c.iterations, ADWFCTR: 1, LOPRINI: true, TERSE: false,
  });
  xrotor.SETX(state);
  let radii, chord, pitch, chordD, pitchD;
  if (c.geometry) {
    radii = Float64Array.from(c.geometry, row => row.r);
    chord = Float64Array.from(c.geometry, row => row.chord);
    pitch = Float64Array.from(c.geometry, row => row.pitch);
    chordD = SPLINE(chord, new Float64Array(chord.length), radii, chord.length);
    pitchD = SPLINE(pitch, new Float64Array(pitch.length), radii, pitch.length);
  }
  const helix = 0.75 * Math.tan(c.pitch * xoper.PI / 180);
  for (let i = 0; i < state.II; i += 1) {
    const r = state.XI[i];
    const t = (r - c.hub) / (1 - c.hub);
    state.CH[i] = (c.geometry ? SEVAL(r, chord, chordD, radii, chord.length) : c.rootChord + (c.tipChord - c.rootChord) * t) / c.radius;
    state.BETA[i] = c.geometry ? SEVAL(r, pitch, pitchD, radii, pitch.length) * xoper.PI / 180 : Math.atan2(helix, r);
    state.BETA0[i] = state.BETA[i];
    if (state.CH[i] <= 0) throw new Error('Interpolated chord must be positive.');
  }
  return { state, config: c };
}

function resultOf(state, result, config, elapsed) {
  // The console default skips every other station; the GUI needs the full grid.
  const output = xrotor.OUTPUT(state, -1);
  const stations = output.rows.map((row, i) => ({
    r: state.XI[i], chord: state.CH[i] * state.RAD, pitch: state.BETA[i] * 180 / xoper.PI,
    cl: state.CL[i], cd: state.CD[i], circulation: state.GAM[i], mach: row.MACH,
    reynolds: state.RE[i], axial: state.VIND[0][i] * state.VEL, stalled: state.STALL[i],
  }));
  if (!Object.values(output.summary).every(value => value === null || Number.isFinite(value)) ||
      !stations.every(row => Object.values(row).every(value => typeof value === 'boolean' || Number.isFinite(value)))) {
    throw new Error('The solver produced a non-finite result. Check the geometry and operating conditions.');
  }
  return {
    config, summary: output.summary, stations, converged: Boolean(result.converged),
    history: result.history || [], rms: state.RMS, elapsed,
    model: output.solutionType, stalled: stations.filter(s => s.stalled).length,
    geometry: stations.map(({ r, chord, pitch }) => ({ r, chord, pitch })),
  };
}

function calculate(input, mode = 'operate') {
  const start = performance.now();
  const { state, config } = makeState(input);
  let result;
  if (mode === 'design') {
    Object.assign(state, {
      RADDES: config.radius, R0DES: config.hub * config.radius, RWDES: config.hub * config.radius,
      VELDES: config.velocity, ADVDES: state.ADV, RPMDES: config.rpm,
      DEST: config.targetType === 'thrust', DESP: config.targetType === 'power',
      TDDES: config.targetType === 'thrust' ? config.target : 0,
      PDDES: config.targetType === 'power' ? config.target : 0,
      LDESINI: true, CLDES0: config.designCl,
    });
    state.CLDES.fill(config.designCl, 0, state.II);
    result = xdesi.DESGEN(state);
    if (result.error) throw new Error(result.error);
  } else {
    result = xoper.APER(state, 4, 2, true);
  }
  return { state, result: resultOf(state, result, config, performance.now() - start) };
}

function solve(input, mode) { return calculate(input, mode).result; }

function sweep(input, options = {}, progress = () => {}) {
  const c = validate(input);
  const from = Number(options.from ?? c.rpm * 0.7);
  const to = Number(options.to ?? c.rpm * 1.3);
  const count = Number(options.count ?? 9);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 10 || to > 30000 || to <= from || !Number.isInteger(count) || count < 3 || count > 31) throw new Error('Enter an increasing RPM range and 3 to 31 points.');
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const rpm = from + (to - from) * i / (count - 1);
    try {
      const result = solve({ ...c, rpm });
      points.push({ rpm, converged: result.converged, thrust: result.summary.TDIM, power: result.summary.PDIM, efficiency: result.summary.EFFTOT });
    } catch (error) { points.push({ rpm, converged: false, error: error.message }); }
    progress({ completed: i + 1, total: count });
  }
  return points;
}

function noise(input, observer = {}) {
  const { state, result } = calculate(input);
  if (!result.converged) throw new Error('Noise requires a converged operating point.');
  const position = [observer.x ?? 0, observer.y ?? 0, observer.z ?? -30].map(Number);
  if (!position.every(Number.isFinite) || Math.hypot(...position) < 2 * state.RAD) throw new Error('Place the observer at least one rotor diameter from the hub.');
  const aoc = Number(observer.aoc ?? 0.08);
  if (!Number.isFinite(aoc) || aoc < 0 || aoc > 0.4) throw new Error('Section area / chord squared must be between 0 and 0.4.');
  const n = xnoise.NOISE(state, { mode: 'pressure', UNITL: 1, XYZOBS: position, AOC0: aoc, NT: 80 });
  const bpf = state.NBLDS * result.summary.RPM / 60;
  return {
    spl: Number.isFinite(n.DECIB[0]) ? n.DECIB[0] : null, bpf,
    time: Array.from(n.TIME), pressure: Array.from(n.PRES), warnings: n.warnings,
    harmonics: Array.from({ length: 20 }, (_, i) => ({ frequency: bpf * (i + 1), db: Number.isFinite(n.DECIB[i + 1]) ? n.DECIB[i + 1] : null })),
  };
}

module.exports = { defaults, validate, makeState, solve, sweep, noise };
