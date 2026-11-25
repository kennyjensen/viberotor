/*! SPDX-License-Identifier: GPL-2.0-or-later
 * Original Fortran copyright (C) 2011 Mark Drela. JavaScript port: 2026-03-10.
 */
'use strict';

const fs = require('node:fs');

const xoper = require('./xoper.js');
const { SPLINE, SEVAL } = require('./spline.js');

const PI = xoper.PI;
const LX = 91;
const KX = 81;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

function fixedAsciiBuffer(value, length) {
  const buffer = Buffer.alloc(length, 0x20);
  Buffer.from(makeString(value, '').slice(0, length), 'ascii').copy(buffer);
  return buffer;
}

function recordBuffer(payload) {
  const header = Buffer.alloc(4);
  const trailer = Buffer.alloc(4);
  header.writeInt32LE(payload.length, 0);
  trailer.writeInt32LE(payload.length, 0);
  return Buffer.concat([header, payload, trailer]);
}

function float32Record(values) {
  const payload = Buffer.alloc(4 * values.length);
  for (let i = 0; i < values.length; i += 1) {
    payload.writeFloatLE(Number(values[i]), 4 * i);
  }
  return recordBuffer(payload);
}

function int32Record(values) {
  const payload = Buffer.alloc(4 * values.length);
  for (let i = 0; i < values.length; i += 1) {
    payload.writeInt32LE(Math.trunc(values[i]), 4 * i);
  }
  return recordBuffer(payload);
}

function stringRecord(value, length) {
  return recordBuffer(fixedAsciiBuffer(value, length));
}

function readRecord(buffer, offset) {
  assert(offset + 8 <= buffer.length, 'JMAP dump: truncated record header');
  const byteLength = buffer.readInt32LE(offset);
  const start = offset + 4;
  const end = start + byteLength;
  assert(end + 4 <= buffer.length, 'JMAP dump: truncated record payload');
  const trailer = buffer.readInt32LE(end);
  assert(trailer === byteLength, 'JMAP dump: mismatched record markers');
  return {
    payload: buffer.subarray(start, end),
    nextOffset: end + 4,
  };
}

function readFloat32Vector(payload) {
  assert(payload.length % 4 === 0, 'JMAP dump: invalid float record size');
  const values = new Float64Array(payload.length / 4);
  for (let i = 0; i < values.length; i += 1) {
    values[i] = payload.readFloatLE(4 * i);
  }
  return values;
}

function readInt32Vector(payload) {
  assert(payload.length % 4 === 0, 'JMAP dump: invalid int record size');
  const values = new Int32Array(payload.length / 4);
  for (let i = 0; i < values.length; i += 1) {
    values[i] = payload.readInt32LE(4 * i);
  }
  return values;
}

function writeJMAPDump(fileName, dump) {
  const parts = [];
  parts.push(stringRecord(dump.NAME, 32));
  parts.push(float32Record([dump.RE6OverRJ, dump.AMACHOverRJ]));
  parts.push(int32Record([dump.NRJ, dump.NCP]));
  parts.push(int32Record(dump.KLOW));
  parts.push(int32Record(dump.KUPP));
  parts.push(float32Record(dump.RJ));
  parts.push(float32Record(dump.CP));
  for (let k = 0; k < dump.NCP; k += 1) {
    const column = new Float64Array(dump.NRJ);
    for (let l = 0; l < dump.NRJ; l += 1) {
      column[l] = dump.EF[l][k];
    }
    parts.push(float32Record(column));
  }
  for (let k = 0; k < dump.NCP; k += 1) {
    const column = new Float64Array(dump.NRJ);
    for (let l = 0; l < dump.NRJ; l += 1) {
      column[l] = dump.BE[l][k];
    }
    parts.push(float32Record(column));
  }
  fs.writeFileSync(fileName, Buffer.concat(parts));
}

function parseJMAPDump(input) {
  const buffer = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  let offset = 0;

  let record = readRecord(buffer, offset);
  const name = record.payload.toString('ascii').replace(/\s+$/u, '');
  offset = record.nextOffset;

  record = readRecord(buffer, offset);
  const scalars = readFloat32Vector(record.payload);
  offset = record.nextOffset;

  record = readRecord(buffer, offset);
  const shape = readInt32Vector(record.payload);
  offset = record.nextOffset;
  const nrj = shape[0];
  const ncp = shape[1];

  record = readRecord(buffer, offset);
  const klow = readInt32Vector(record.payload);
  offset = record.nextOffset;

  record = readRecord(buffer, offset);
  const kupp = readInt32Vector(record.payload);
  offset = record.nextOffset;

  record = readRecord(buffer, offset);
  const rj = readFloat32Vector(record.payload);
  offset = record.nextOffset;

  record = readRecord(buffer, offset);
  const cp = readFloat32Vector(record.payload);
  offset = record.nextOffset;

  const ef = Array.from({ length: nrj }, () => new Float64Array(ncp));
  const be = Array.from({ length: nrj }, () => new Float64Array(ncp));

  for (let k = 0; k < ncp; k += 1) {
    record = readRecord(buffer, offset);
    const column = readFloat32Vector(record.payload);
    offset = record.nextOffset;
    assert(column.length === nrj, 'JMAP dump: invalid EF column length');
    for (let l = 0; l < nrj; l += 1) {
      ef[l][k] = column[l];
    }
  }

  for (let k = 0; k < ncp; k += 1) {
    record = readRecord(buffer, offset);
    const column = readFloat32Vector(record.payload);
    offset = record.nextOffset;
    assert(column.length === nrj, 'JMAP dump: invalid BE column length');
    for (let l = 0; l < nrj; l += 1) {
      be[l][k] = column[l];
    }
  }

  assert(offset === buffer.length, 'JMAP dump: trailing bytes');

  return {
    NAME: name,
    RE6OverRJ: scalars[0],
    AMACHOverRJ: scalars[1],
    NRJ: nrj,
    NCP: ncp,
    KLOW: klow,
    KUPP: kupp,
    RJ: rj,
    CP: cp,
    EF: ef,
    BE: be,
  };
}

function normalizeSweep(options = {}) {
  const rj1 = Number(options.rj1 ?? options.RJ1 ?? options.minJ);
  const rj2 = Number(options.rj2 ?? options.RJ2 ?? options.maxJ);
  const rjinc = Number(options.rjinc ?? options.RJINC ?? options.jIncrement);
  const cp1 = Number(options.cp1 ?? options.CP1 ?? options.minCp);
  const cp2 = Number(options.cp2 ?? options.CP2 ?? options.maxCp);
  const cpinc = Number(options.cpinc ?? options.CPINC ?? options.cpIncrement);
  assert(Number.isFinite(rj1) && Number.isFinite(rj2) && Number.isFinite(rjinc), 'JMAP: invalid J sweep values');
  assert(Number.isFinite(cp1) && Number.isFinite(cp2) && Number.isFinite(cpinc), 'JMAP: invalid Cp sweep values');
  return { rj1, rj2, rjinc, cp1, cp2, cpinc };
}

function JMAP(state, options = {}) {
  const { rj1, rj2, rjinc, cp1, cp2, cpinc } = normalizeSweep(options);
  state.GREEK = false;

  if (rjinc === 0.0) {
    return { cancelled: 'J increment is zero' };
  }

  let nrj = Math.trunc((rj2 - rj1) / rjinc + 1.01);
  if (nrj > LX) {
    nrj = LX;
  }

  if (cpinc === 0.0) {
    return { cancelled: 'Cp increment is zero' };
  }

  let ncp = Math.trunc((cp2 - cp1) / cpinc + 1.01);
  if (ncp > KX) {
    ncp = KX;
  }

  const fileName = makeString(options.fileName ?? options.outputFileName ?? state.FNAME, '').trim() || 'jmap.dat';
  state.FNAME = fileName;

  const velsav = state.VEL;
  const advsav = state.ADV;
  const betsav = new Float64Array(state.II);
  for (let i = 0; i < state.II; i += 1) {
    betsav[i] = state.BETA[i];
  }

  const rj = new Float64Array(nrj);
  const cp = new Float64Array(ncp);
  const klow = new Int32Array(nrj);
  const kupp = new Int32Array(nrj);
  const ef = Array.from({ length: nrj }, () => new Float64Array(ncp));
  const be = Array.from({ length: nrj }, () => new Float64Array(ncp));

  for (let l = 0; l < nrj; l += 1) {
    rj[l] = rj1 + rjinc * l;
  }
  for (let k = 0; k < ncp; k += 1) {
    cp[k] = cp1 + cpinc * k;
  }

  const wr = state.VEL / state.ADV;
  const re6 = state.RHO * wr * state.RAD / state.RMU * 1.0e-6;
  const amach = wr / state.VSO;

  const betaSpline = new Float64Array(state.II);
  SPLINE(state.BETA, betaSpline, state.T, state.II);
  const b75 = SEVAL(getXrotor().TINVRT(state, 0.75), state.BETA, betaSpline, state.T, state.II);

  for (let l = 0; l < nrj; l += 1) {
    state.ADV = rj[l] / PI;
    state.VEL = state.ADV * state.VSO * amach;
    klow[l] = 0;
    kupp[l] = 0;

    if (state.VEL / state.VSO > 0.95) {
      continue;
    }

    const bzero = Math.atan2(state.ADV, 0.75) + 0.09;
    const db = bzero - b75;
    for (let i = 0; i < state.II; i += 1) {
      state.BETA[i] = betsav[i] + db;
    }

    for (let k = 0; k < ncp; k += 1) {
      state.PSPEC = cp[k] * 4.0 / (PI * state.ADV) ** 3;
      state.PSPEC *= state.RHO * state.VEL ** 3 * state.RAD ** 2;
      xoper.APER(state, 3, 1, k === 0);

      if (state.CONV && state.TTOT / state.PTOT > 0.0) {
        if (klow[l] === 0) {
          klow[l] = k + 1;
        }
      } else if (klow[l] > 0) {
        break;
      }

      ef[l][k] = state.TTOT / state.PTOT;
      be[l][k] = state.BETA[state.II - 1];
      kupp[l] = k + 1;
    }
  }

  for (let i = 0; i < state.II; i += 1) {
    state.BETA[i] = betsav[i];
  }

  for (let l = 0; l < nrj; l += 1) {
    for (let k = 0; k < ncp; k += 1) {
      be[l][k] = be[l][k] * 180.0 / PI;
    }
  }

  const rjsav = advsav * PI;
  const dump = {
    NAME: state.NAME,
    RE6OverRJ: re6 / rjsav,
    AMACHOverRJ: amach / rjsav,
    NRJ: nrj,
    NCP: ncp,
    KLOW: klow,
    KUPP: kupp,
    RJ: rj,
    CP: cp,
    EF: ef,
    BE: be,
  };

  writeJMAPDump(fileName, dump);

  return {
    fileName,
    written: true,
    RE6: re6,
    AMACH: amach,
    VELSAV: velsav,
    ADVSAV: advsav,
    KLOW: klow,
    KUPP: kupp,
    RJ: rj,
    CP: cp,
    EF: ef,
    BE: be,
    dump,
  };
}

module.exports = {
  JMAP,
  writeJMAPDump,
  parseJMAPDump,
};
