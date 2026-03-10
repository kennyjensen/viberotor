'use strict';

const fs = require('node:fs');

const { SPLINE, SEVAL } = require('./spline.js');
const { PI } = require('./xoper.js');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isArrayLike(value) {
  return Array.isArray(value) || ArrayBuffer.isView(value);
}

function ensureVector(value, length, name) {
  assert(isArrayLike(value), `${name}: expected an array-like value`);
  assert(value.length >= length, `${name}: expected length >= ${length}`);
  return value;
}

function makeString(value, fallback = '') {
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

function getXrotor() {
  return require('./xrotor.js');
}

function parseLines(text) {
  return String(text).split(/\r?\n/);
}

function parseStationToken(value, label) {
  const parsed = Number(value);
  assert(Number.isFinite(parsed), `${label}: expected a finite number`);
  return parsed;
}

function normalizeStation(station) {
  if (typeof station === 'number') {
    return { rOverR: station, aolDeg: 0.0 };
  }
  if (Array.isArray(station)) {
    assert(station.length >= 1, 'stations: expected [rOverR, aolDeg] tuples');
    return {
      rOverR: parseStationToken(station[0], 'stations[].rOverR'),
      aolDeg: station.length >= 2 ? parseStationToken(station[1], 'stations[].aolDeg') : 0.0,
    };
  }
  assert(station && typeof station === 'object', 'stations: expected numeric, tuple, or object entries');
  const rValue = station.rOverR ?? station.radius ?? station.r;
  assert(rValue !== undefined, 'stations[].rOverR is required');
  return {
    rOverR: parseStationToken(rValue, 'stations[].rOverR'),
    aolDeg: parseStationToken(station.aolDeg ?? station.aol ?? station.angleOffsetDeg ?? 0.0, 'stations[].aolDeg'),
  };
}

function parseStationsFromText(text) {
  const stations = [];
  for (const rawLine of parseLines(text)) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }
    const parts = line.split(/\s+/);
    assert(parts.length >= 1, `invalid station line: ${rawLine}`);
    stations.push({
      rOverR: parseStationToken(parts[0], 'station rOverR'),
      aolDeg: parts.length >= 2 ? parseStationToken(parts[1], 'station aolDeg') : 0.0,
    });
  }
  return stations;
}

function loadStations(options = {}) {
  if (options.stations !== undefined) {
    return Array.from(options.stations, normalizeStation);
  }
  if (options.radii !== undefined) {
    return Array.from(options.radii, (radius) => normalizeStation(Number(radius)));
  }
  if (options.text !== undefined) {
    return parseStationsFromText(options.text);
  }
  const fileName = makeString(options.stationFileName ?? options.inputFileName ?? options.fileName, '').trim();
  assert(fileName.length > 0, 'stationFileName is required when stations/text are not provided');
  return parseStationsFromText(fs.readFileSync(fileName, 'utf8'));
}

function buildSplineTables(state) {
  const n = state.II;
  assert(n > 0, 'INTE: II must be positive');
  ensureVector(state.CH, n, 'CH');
  ensureVector(state.BETA, n, 'BETA');
  ensureVector(state.BETA0, n, 'BETA0');
  ensureVector(state.CL, n, 'CL');
  ensureVector(state.T, n, 'T');
  ensureVector(state.XI, n, 'XI');
  let betaSource = state.BETA;
  let betaMagnitude = 0.0;
  for (let i = 0; i < n; i += 1) {
    betaMagnitude = Math.max(betaMagnitude, Math.abs(state.BETA[i]));
  }
  if (betaMagnitude === 0.0) {
    betaSource = state.BETA0;
  }
  const t1 = new Float64Array(n);
  const t2 = new Float64Array(n);
  const t3 = new Float64Array(n);
  const t4 = new Float64Array(n);
  const t5 = new Float64Array(n);
  const t6 = new Float64Array(n);
  SPLINE(state.CH, t1, state.T, n);
  SPLINE(betaSource, t2, state.T, n);
  SPLINE(state.CL, t3, state.T, n);
  SPLINE(state.CH, t4, state.XI, n);
  SPLINE(betaSource, t5, state.XI, n);
  SPLINE(state.CL, t6, state.XI, n);
  return { t1, t2, t3, t4, t5, t6, betaSource };
}

function evaluateAtRadius(state, splines, rOverR) {
  const xrotor = getXrotor();
  if (rOverR >= state.XI0) {
    const xt = xrotor.TINVRT(state, rOverR);
    return {
      CH: SEVAL(xt, state.CH, splines.t1, state.T, state.II),
      BETA: SEVAL(xt, splines.betaSource, splines.t2, state.T, state.II),
      CL: SEVAL(xt, state.CL, splines.t3, state.T, state.II),
    };
  }
  return {
    CH: SEVAL(rOverR, state.CH, splines.t4, state.XI, state.II),
    BETA: SEVAL(rOverR, splines.betaSource, splines.t5, state.XI, state.II),
    CL: SEVAL(rOverR, state.CL, splines.t6, state.XI, state.II),
  };
}

function evaluateBetaAtEffectiveRadius(state, splines, xmod) {
  const xrotor = getXrotor();
  if (xmod >= state.XI0) {
    const xt = xrotor.TINVRT(state, xmod);
    return SEVAL(xt, splines.betaSource, splines.t2, state.T, state.II);
  }
  return SEVAL(xmod, splines.betaSource, splines.t5, state.XI, state.II);
}

function evaluateChordAtRadius(state, splines, radius) {
  const xrotor = getXrotor();
  if (radius >= state.XI0) {
    const xt = xrotor.TINVRT(state, radius);
    return SEVAL(xt, state.CH, splines.t1, state.T, state.II);
  }
  return SEVAL(radius, state.CH, splines.t4, state.XI, state.II);
}

function validateStations(state, stations) {
  assert(stations.length > 0, 'INTE: no stations specified');
  let previousRadius = -Infinity;
  for (let i = 0; i < stations.length; i += 1) {
    const station = stations[i];
    assert(
      station.rOverR >= 0.0 && station.rOverR <= state.XITIP,
      'INTE: station radii must be between 0 and tip radius',
    );
    assert(station.rOverR > previousRadius, 'INTE: station radii must monotonically increase');
    previousRadius = station.rOverR;
  }
}

function buildInte1Rows(state, stations, splines, options = {}) {
  const scaleFactor = options.scaleFactor ?? 1.0;
  const rows = [];
  for (let ir = 0; ir < stations.length; ir += 1) {
    const station = stations[ir];
    const sample = evaluateAtRadius(state, splines, station.rOverR);
    const cback = (0.75 - state.XPITCH) * sample.CH;
    const dx = ((cback * Math.cos(sample.BETA)) ** 2) / station.rOverR;
    const xmod = Math.min(0.99999, station.rOverR + dx);
    const betmod = evaluateBetaAtEffectiveRadius(state, splines, xmod);
    let cmod = sample.CH;

    if (ir > 0) {
      const xmid = 0.5 * (stations[ir - 1].rOverR + station.rOverR);
      const cmid = evaluateChordAtRadius(state, splines, xmid);
      const dcdx = (rows[ir - 1].cOverR - sample.CH) / (stations[ir - 1].rOverR - station.rOverR);
      const cext = cmid + dcdx * (station.rOverR - xmid);
      cmod = Math.max(cmod, cext);
    }
    if (ir < stations.length - 1) {
      const xmid = 0.5 * (stations[ir + 1].rOverR + station.rOverR);
      const cmid = evaluateChordAtRadius(state, splines, xmid);
      const nextSample = evaluateAtRadius(state, splines, stations[ir + 1].rOverR);
      const dcdx = (nextSample.CH - sample.CH) / (stations[ir + 1].rOverR - station.rOverR);
      const cext = cmid + dcdx * (station.rOverR - xmid);
      cmod = Math.max(cmod, cext);
    }

    const radiusMeters = station.rOverR * state.RAD;
    const chordMeters = sample.CH * state.RAD;
    const radiusIn = radiusMeters * 100.0 / 2.54;
    const chordIn = chordMeters * 100.0 / 2.54;
    const cmodIn = cmod * state.RAD * 100.0 / 2.54;
    const betaOlDeg = (betmod * 180.0) / PI;

    rows.push({
      index: ir + 1,
      rOverR: station.rOverR,
      cOverR: sample.CH,
      radiusMeters,
      chordMeters,
      radiusIn,
      chordIn,
      betaBaseRad: sample.BETA,
      betaBaseDeg: (sample.BETA * 180.0) / PI,
      betaRad: betmod + station.aolDeg * PI / 180.0,
      betaDeg: betaOlDeg + station.aolDeg,
      aolDeg: station.aolDeg,
      betaOlDeg,
      cmodOverR: cmod,
      cmodIn,
      CL: sample.CL,
      dynamicPressure: 0.5 * state.RHO * state.VEL ** 2 * (1.0 + (station.rOverR / state.ADV) ** 2),
      radius: radiusMeters * scaleFactor,
      chord: chordMeters * scaleFactor,
      beta0Deg: (sample.BETA * 180.0) / PI,
    });
  }
  return rows;
}

function buildInte2Rows(state, stations, splines, options = {}) {
  const scaleFactor = options.scaleFactor ?? 1.0;
  const rows = [];
  const xocte = 0.70;
  for (let ir = 0; ir < stations.length; ir += 1) {
    const station = stations[ir];
    const sample = evaluateAtRadius(state, splines, station.rOverR);
    const radiusMeters = station.rOverR * state.RAD;
    const chordMeters = sample.CH * state.RAD;
    rows.push({
      index: ir + 1,
      rOverR: station.rOverR,
      cOverR: sample.CH,
      radiusMeters,
      chordMeters,
      radiusIn: radiusMeters * 100.0 / 2.54,
      chordIn: chordMeters * 100.0 / 2.54,
      betaBaseRad: sample.BETA,
      betaBaseDeg: (sample.BETA * 180.0) / PI,
      betaRad: sample.BETA + station.aolDeg * PI / 180.0,
      betaDeg: (sample.BETA * 180.0) / PI + station.aolDeg,
      aolDeg: station.aolDeg,
      xteIn: xocte * chordMeters * 100.0 / 2.54,
      CL: sample.CL,
      dynamicPressure: 0.5 * state.RHO * state.VEL ** 2 * (1.0 + (station.rOverR / state.ADV) ** 2),
      radius: radiusMeters * scaleFactor,
      chord: chordMeters * scaleFactor,
      beta0Deg: (sample.BETA * 180.0) / PI,
    });
  }
  return rows;
}

function formatInte1Text(state, rows) {
  const lines = [
    ' =========================================================',
    '   i  r/R    c/R    radius   chord  beta    aOL   betaOL  cmod      CL           q',
    '                     (in)    (in)   (deg)  (deg)  (deg)   (in)',
  ];
  for (const row of rows) {
    lines.push(
      [
        String(row.index).padStart(4),
        row.rOverR.toFixed(3).padStart(6),
        row.cOverR.toFixed(4).padStart(8),
        row.radiusIn.toFixed(3).padStart(9),
        row.chordIn.toFixed(3).padStart(9),
        row.betaDeg.toFixed(2).padStart(8),
        row.aolDeg.toFixed(2).padStart(8),
        row.betaOlDeg.toFixed(2).padStart(9),
        row.cmodIn.toFixed(3).padStart(9),
        row.CL.toFixed(4).padStart(9),
        row.dynamicPressure.toFixed(1).padStart(13),
      ].join(''),
    );
  }
  lines.push(' =========================================================');
  return `${lines.join('\n')}\n`;
}

function formatInte2Text(state, rows) {
  const lines = [
    ` ${makeString(state.NAME, '').trimEnd()}`,
    '',
    '   i   r/R     radius   chord     beta     aOL     xTE',
    '                (in)     (in)     (deg)   (deg)    (in)',
  ];
  for (const row of rows) {
    lines.push(
      [
        String(row.index).padStart(4),
        row.rOverR.toFixed(4).padStart(8),
        row.radiusIn.toFixed(4).padStart(10),
        row.chordIn.toFixed(4).padStart(10),
        row.betaDeg.toFixed(4).padStart(11),
        row.aolDeg.toFixed(3).padStart(9),
        row.xteIn.toFixed(4).padStart(10),
      ].join(''),
    );
  }
  return `${lines.join('\n')}\n`;
}

function maybeWriteOutput(state, text, options = {}) {
  const save = options.save === undefined ? false : Boolean(options.save);
  const fileName = makeString(options.outputFileName ?? options.saveFileName ?? options.outFileName, '').trim();
  if (!save) {
    return { written: false, fileName: fileName || null };
  }
  assert(fileName.length > 0, 'outputFileName is required when save is true');
  fs.writeFileSync(fileName, text, 'utf8');
  state.SAVFIL = fileName;
  return { written: true, fileName };
}

function runInte(state, mode, options = {}) {
  const stations = loadStations(options);
  validateStations(state, stations);
  state.GREEK = false;
  const splines = buildSplineTables(state);
  const rows = mode === 'INTE1'
    ? buildInte1Rows(state, stations, splines, options)
    : buildInte2Rows(state, stations, splines, options);
  const text = mode === 'INTE1' ? formatInte1Text(state, rows) : formatInte2Text(state, rows);
  const output = maybeWriteOutput(state, text, options);
  return {
    mode,
    rows,
    text,
    ...output,
  };
}

function INTE1(state, options = {}) {
  return runInte(state, 'INTE1', options);
}

function INTE2(state, options = {}) {
  return runInte(state, 'INTE2', options);
}

module.exports = {
  INTE1,
  INTE2,
};
