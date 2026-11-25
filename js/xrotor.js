'use strict';

const fs = require('node:fs');

const xoper = require('./xoper.js');
const xaero = require('./xaero.js');
const xio = require('./xio.js');
const xdesi = require('./xdesi.js');
const xmodi = require('./xmodi.js');
const xbend = require('./xbend.js');
const xnoise = require('./xnoise.js');
const xinte = require('./xinte.js');
const xjmap = require('./xjmap.js');
const { SPLINE, SEVAL } = require('./spline.js');
const { SRCVEL } = require('./srclin.js');

const IX = xoper.IX;
const IXP = xoper.IXP;
const PI = xoper.PI;

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

function copyFloat64(length, source = []) {
  const out = new Float64Array(length);
  const limit = Math.min(length, source.length ?? 0);
  for (let i = 0; i < limit; i += 1) {
    out[i] = source[i];
  }
  return out;
}

function makeString(value, fallback = '') {
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

function parseText(text) {
  return text.split(/\r?\n/);
}

function parseLogicalToken(token) {
  const normalized = String(token).trim().replace(/\./g, '').toUpperCase();
  if (normalized === 'T' || normalized === 'TRUE' || normalized === '1' || normalized === 'Y' || normalized === 'YES') {
    return true;
  }
  if (normalized === 'F' || normalized === 'FALSE' || normalized === '0' || normalized === 'N' || normalized === 'NO') {
    return false;
  }
  throw new Error(`invalid logical token: ${token}`);
}

function parseNumberLine(line, expectedCount) {
  const values = String(line)
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map(Number);
  if (values.length < expectedCount || values.some((value) => Number.isNaN(value))) {
    throw new Error(`invalid numeric line: ${line}`);
  }
  return values;
}

function buildState(overrides = {}) {
  const state = Object.assign(xoper.createState(overrides), xbend.createStructuralState(overrides));
  state.VERSION = overrides.VERSION ?? 7.55;
  state.DT = overrides.DT ?? 0.0;
  state.IDEV = overrides.IDEV ?? 1;
  state.IDEVRP = overrides.IDEVRP ?? 2;
  state.IPSLU = overrides.IPSLU ?? 0;
  state.NCOLOR = overrides.NCOLOR ?? 64;
  state.LPLOT = overrides.LPLOT === undefined ? false : Boolean(overrides.LPLOT);
  state.LGRID = overrides.LGRID === undefined ? true : Boolean(overrides.LGRID);
  state.LLAND = overrides.LLAND === undefined ? true : Boolean(overrides.LLAND);
  state.LCURS = overrides.LCURS === undefined ? true : Boolean(overrides.LCURS);
  state.LSLOPE = overrides.LSLOPE === undefined ? false : Boolean(overrides.LSLOPE);
  state.XYOFF = copyFloat64(2, overrides.XYOFF);
  state.XYFAC = copyFloat64(2, overrides.XYFAC);
  state.RADDES = overrides.RADDES ?? 0.0;
  state.VELDES = overrides.VELDES ?? 0.0;
  state.ADVDES = overrides.ADVDES ?? 0.0;
  state.RPMDES = overrides.RPMDES ?? 0.0;
  state.R0DES = overrides.R0DES ?? 0.0;
  state.RWDES = overrides.RWDES ?? 0.0;
  state.TDDES = overrides.TDDES ?? 0.0;
  state.PDDES = overrides.PDDES ?? 0.0;
  state.TDES = overrides.TDES ?? 0.0;
  state.PDES = overrides.PDES ?? 0.0;
  state.CLDES0 = overrides.CLDES0 ?? 0.0;
  state.XV = copyFloat64(IXP, overrides.XV ?? state.XV);
  return state;
}

function createState(overrides = {}) {
  return buildState(overrides);
}

function ATMO(ALSPEC, VSOALT = 0.0, RHOALT = 0.0, RMUALT = 0.0) {
  const ALT = [
    0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0,
    10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0, 17.0, 18.0, 19.0,
    20.0, 21.0, 22.0, 23.0, 24.0, 25.0, 26.0, 27.0, 28.0, 29.0,
    30.0, 31.0, 32.0, 33.0, 34.0, 35.0, 36.0, 37.0, 38.0, 39.0,
    40.0, 45.0, 60.0, 75.0,
  ];
  const VSO = [
    340.0, 336.0, 332.0, 329.0, 325.0, 320.0, 316.0, 312.0, 308.0, 304.0,
    299.0, 295.0, 295.0, 295.0, 295.0, 295.0, 295.0, 295.0, 295.0, 295.0,
    295.0, 295.8, 296.4, 297.1, 297.8, 298.5, 299.1, 299.8, 300.5, 301.1,
    301.8, 302.5, 303.1, 305.0, 306.8, 308.7, 310.5, 312.3, 314.0, 316.0,
    318.0, 355.0, 372.0, 325.0,
  ];
  const RHO = [
    1.226, 1.112, 1.007, 0.909, 0.820, 0.737, 0.660, 0.589, 0.526, 0.467,
    0.413, 0.364, 0.311, 0.265, 0.227, 0.194, 0.163, 0.141, 0.121, 0.103,
    0.0880, 0.0749, 0.0637, 0.0543, 0.0463, 0.0395, 0.0338, 0.0288, 0.0246, 0.0210,
    0.0180, 0.0154, 0.0132, 0.0113, 0.0096, 0.0082, 0.0070, 0.0060, 0.0052, 0.0044,
    0.0040, 0.0020, 3.9e-4, 8.0e-5,
  ];
  const RMU = [
    1.780, 1.749, 1.717, 1.684, 1.652, 1.619, 1.586, 1.552, 1.517, 1.482,
    1.447, 1.418, 1.418, 1.418, 1.418, 1.418, 1.418, 1.418, 1.418, 1.418,
    1.418, 1.427, 1.433, 1.438, 1.444, 1.449, 1.454, 1.460, 1.465, 1.471,
    1.476, 1.481, 1.487, 1.502, 1.512, 1.532, 1.546, 1.561, 1.580, 1.600,
    1.700, 1.912, 2.047, 1.667,
  ];

  if (ALSPEC === -1.0) {
    return {
      VSOALT: 1500.0,
      RHOALT: 1000.0,
      RMUALT: 1.15e-3,
      underwater: true,
    };
  }

  for (let i = 1; i < ALT.length; i += 1) {
    if (ALSPEC > ALT[i]) {
      continue;
    }

    const dalt = ALT[i] - ALT[i - 1];
    const dvso = VSO[i] - VSO[i - 1];
    const drho = RHO[i] - RHO[i - 1];
    const drmu = RMU[i] - RMU[i - 1];
    const alfrac = (ALSPEC - ALT[i - 1]) / dalt;

    VSOALT = VSO[i - 1] + dvso * alfrac;
    RHOALT = RHO[i - 1] + drho * alfrac;
    RMUALT = (RMU[i - 1] + drmu * alfrac) * 1.0e-5;

    return {
      VSOALT,
      RHOALT,
      RMUALT,
      underwater: false,
      orbit: false,
    };
  }

  return {
    VSOALT: VSO[VSO.length - 1],
    RHOALT: RHO[RHO.length - 1],
    RMUALT: RMU[RMU.length - 1] * 1.0e-5,
    underwater: false,
    orbit: true,
  };
}

function FLOSHO(LU, VSO, RHO, RMU) {
  void LU;
  const R = 287.0;
  const GAM = 1.4;
  const RNU = RMU / RHO;
  const P = (RHO * VSO ** 2) / GAM;
  const T = P / (RHO * R);
  return { VSO, RHO, RMU, RNU, P, T };
}

function SETDEF(state) {
  state.RAKE = 0.0;
  state.VEL = 1.0;
  state.ALT = 0.0;
  {
    const atmo = ATMO(state.ALT);
    state.VSO = atmo.VSOALT;
    state.RHO = atmo.RHOALT;
    state.RMU = atmo.RMUALT;
  }

  const A0 = 0.0;
  const DCLDA = 6.28;
  const CLMAX = 1.5;
  const CLMIN = -0.5;
  const DCL_STALL = 0.1;
  const DCLDA_STALL = 0.1;
  const CMCON = -0.1;
  const CDMIN = 0.013;
  const CLDMIN = 0.5;
  const DCDCL2 = 0.004;
  const REREF = 200000.0;
  const REXP = -0.4;
  const MCRIT = 0.8;
  state.NAERO = 1;
  xaero.PUTAERO(
    state,
    state.NAERO,
    0.0,
    A0,
    CLMAX,
    CLMIN,
    DCLDA,
    DCLDA_STALL,
    DCL_STALL,
    CDMIN,
    CLDMIN,
    DCDCL2,
    CMCON,
    MCRIT,
    REREF,
    REXP,
  );
  for (let i = 0; i < IX; i += 1) {
    state.IAERO[i] = 1;
  }

  state.XPITCH = 0.3;
  state.II = 30;
  state.INCR = 2;
  state.IXSPAC = 2;
  state.VRTX = false;
  state.FAST = false;
  state.FREE = true;
  state.DUCT = false;
  state.TERSE = false;
  state.LLAND = true;
  state.LGRID = true;
  state.LVNORM = true;
  state.PAR = 0.6;
  state.CSIZE = 0.014;
  return state;
}

function GETDEF(state, options = {}) {
  const fileName = options.fileName ?? 'xrotor.def';
  let text;
  try {
    text = options.text ?? fs.readFileSync(fileName, 'utf8');
  } catch {
    SETDEF(state);
    return { status: 'missing', fileName };
  }

  const lines = parseText(text).map((line) => line.trim()).filter((line) => line.length > 0);
  try {
    let cursor = 0;
    [state.RHO, state.VSO, state.RMU] = parseNumberLine(lines[cursor += 0], 3);
    parseNumberLine(lines[cursor += 1], 2);
    parseNumberLine(lines[cursor += 1], 3);
    parseNumberLine(lines[cursor += 1], 2);
    parseNumberLine(lines[cursor += 1], 3);
    parseNumberLine(lines[cursor += 1], 1);
    [state.XPITCH] = parseNumberLine(lines[cursor += 1], 1);
    [state.II, state.INCR, state.IXSPAC] = parseNumberLine(lines[cursor += 1], 3).map((value) => Math.trunc(value));
    {
      const tokens = lines[cursor += 1].split(/\s+/);
      state.FAST = parseLogicalToken(tokens[0]);
      state.FREE = parseLogicalToken(tokens[1]);
      state.DUCT = parseLogicalToken(tokens[2]);
    }
    {
      const tokens = lines[cursor += 1].split(/\s+/);
      state.TERSE = parseLogicalToken(tokens[0]);
      state.LLAND = parseLogicalToken(tokens[1]);
      state.LGRID = parseLogicalToken(tokens[2]);
    }
    [state.LVNORM] = lines[cursor += 1].split(/\s+/).filter(Boolean).map(parseLogicalToken);
    [state.PAR, state.CSIZE] = parseNumberLine(lines[cursor += 1], 2);
    return { status: 'ok', fileName };
  } catch {
    SETDEF(state);
    return { status: 'error', fileName };
  }
}

function WRTDEF(state, options = {}) {
  const fileName = options.fileName ?? 'xrotor.def';
  const mode = options.mode ?? 'overwrite';
  const section = xaero.GETAERO(state, 1);
  const lines = [
    [state.RHO, state.VSO, state.RMU].join(' '),
    [section.DCLDA, section.A0].join(' '),
    [section.CDMIN, section.DCDCL2, section.CLDMIN].join(' '),
    [section.REREF, section.REXP].join(' '),
    [section.CLMAX, section.CLMIN, section.DCL_STALL].join(' '),
    [section.CMCON].join(' '),
    [state.XPITCH].join(' '),
    [state.II, state.INCR, state.IXSPAC].join(' '),
    [state.FAST ? 'T' : 'F', state.FREE ? 'T' : 'F', state.DUCT ? 'T' : 'F'].join(' '),
    [state.TERSE ? 'T' : 'F', state.LLAND ? 'T' : 'F', state.LGRID ? 'T' : 'F'].join(' '),
    [state.LVNORM ? 'T' : 'F'].join(' '),
    [state.PAR, state.CSIZE].join(' '),
  ];
  const text = `${lines.join('\n')}\n`;

  if (mode !== 'skip') {
    fs.writeFileSync(fileName, text, 'utf8');
  }

  return { fileName, text, written: mode !== 'skip' };
}

function SETX(state) {
  assert(state.II > 0, 'SETX: II must be positive');
  state.DT = (0.5 * PI) / state.II;
  let xm = state.XI0;
  state.XV[0] = state.XI0;

  for (let i = 1; i <= state.II; i += 1) {
    state.T[i - 1] = state.DT * (i - 0.5);
    const tp = state.DT * i;

    let xp;
    if (state.IXSPAC === 2) {
      state.XI[i - 1] = Math.sqrt(state.XITIP * Math.sin(state.T[i - 1]) ** 2 + (state.XI0 * Math.cos(state.T[i - 1])) ** 2);
      xp = Math.sqrt(state.XITIP * Math.sin(tp) ** 2 + (state.XI0 * Math.cos(tp)) ** 2);
    } else {
      state.XI[i - 1] = 0.5 * (1.0 - Math.cos(2.0 * state.T[i - 1])) * (state.XITIP - state.XI0) + state.XI0;
      xp = 0.5 * (1.0 - Math.cos(2.0 * tp)) * (state.XITIP - state.XI0) + state.XI0;
    }

    state.XI[i - 1] = 0.5 * (xp + xm);
    state.DXI[i - 1] = xp - xm;
    xm = xp;
    state.XV[i] = xp;
  }

  state.XV[state.II] = state.XITIP;
  return { XI: state.XI, DXI: state.DXI, XV: state.XV, T: state.T };
}

function TINVRT(state, XX) {
  let tt = Math.atan2(XX, Math.sqrt(state.XITIP ** 2 - XX ** 2));

  for (let iter = 1; iter <= 40; iter += 1) {
    const st = Math.sin(tt);
    const ct = Math.cos(tt);
    let rez;
    let drdt;

    if (state.IXSPAC === 2) {
      rez = (state.XITIP * st) ** 2 + (state.XI0 * ct) ** 2 - XX ** 2;
      drdt = 2.0 * (state.XITIP ** 2 - state.XI0 ** 2) * st * ct;
    } else {
      rez = 0.5 * (1.0 - Math.cos(2.0 * tt)) * (state.XITIP - state.XI0) + state.XI0 - XX;
      drdt = (state.XITIP - state.XI0) * Math.sin(2.0 * tt);
    }

    tt = tt - rez / drdt;
    if (Math.abs(rez) <= 1.0e-5) {
      return tt;
    }
  }

  return tt;
}

function UVADD(state, XIW) {
  let WA = 0.0;
  let WT = 0.0;

  if (state.NADD <= 1) {
    return { WA, WT };
  }

  const rdim = XIW * state.RAD;
  if (rdim >= state.RADD[0] && rdim <= state.RADD[state.NADD - 1]) {
    WA = SEVAL(rdim, state.UADD, state.UADDR, state.RADD, state.NADD) / state.VEL;
    WT = SEVAL(rdim, state.VADD, state.VADDR, state.RADD, state.NADD) / state.VEL;
  }

  return { WA, WT };
}

function NACELL(state, FNAME1 = '', options = {}) {
  assert(state.RAD !== 0.0, 'NACELL: Must define rotor geometry first');

  const fileName = makeString(FNAME1 || options.fileName, '');
  const upper = fileName.toUpperCase();
  state.CONV = false;

  if (upper.startsWith('CONST')) {
    const ucons = options.constantUbody ?? 0.0;
    const vcons = options.constantVbody ?? 0.0;
    for (let i = 0; i < state.II; i += 1) {
      state.UBODY[i] = ucons;
      state.VBODY[i] = vcons;
    }
    state.XW0 = 0.0;
    xoper.XWINIT(state);
    return {
      mode: 'CONST',
      XW0: state.XW0,
      UBODY: state.UBODY,
      VBODY: state.VBODY,
      body: {
        ZPROP: 0.0,
        AWAKE: 0.0,
        ZBODY: new Float64Array([0.0, 1.0]),
        RBODY: new Float64Array([0.0, 0.0]),
      },
    };
  }

  let text;
  try {
    text = options.text ?? fs.readFileSync(fileName, 'utf8');
  } catch {
    for (let i = 0; i < state.II; i += 1) {
      state.UBODY[i] = 0.0;
    }
    return { error: 'Nacelle data file OPEN error', UBODY: state.UBODY };
  }

  try {
    const lines = parseText(text).map((line) => line.trim()).filter((line) => line.length > 0);
    const [zpropIn, awakeIn] = parseNumberLine(lines[0], 2);
    let zprop = zpropIn;
    let awake = awakeIn < 0.0 ? PI * awakeIn ** 2 : awakeIn;
    const zbody = [];
    const abody = [];
    for (let i = 1; i < lines.length; i += 1) {
      const [z, a] = parseNumberLine(lines[i], 2);
      zbody.push(z / state.RAD - zprop / state.RAD);
      const area = a < 0.0 ? PI * a ** 2 : a;
      abody.push(area / state.RAD ** 2);
    }
    awake /= state.RAD ** 2;
    const rbody = new Float64Array(zbody.length);
    const source = new Float64Array(Math.max(zbody.length - 1, 0));
    for (let i = 0; i < zbody.length; i += 1) {
      rbody[i] = Math.sqrt(abody[i] / PI);
    }
    if (source.length > 0) {
      source[0] = 0.0;
      for (let i = 1; i < source.length; i += 1) {
        source[i] = abody[i] - abody[i - 1];
      }
    }
    for (let i = 0; i < state.II; i += 1) {
      const velocity = SRCVEL(zbody.length, zbody, source, 0.0, state.XI[i]);
      state.UBODY[i] = velocity.U;
      state.VBODY[i] = velocity.V;
    }
    state.XW0 = Math.sqrt(awake / PI);
    xoper.XWINIT(state);
    return {
      fileName,
      XW0: state.XW0,
      UBODY: state.UBODY,
      VBODY: state.VBODY,
      body: {
        ZPROP: zprop / state.RAD,
        AWAKE: awake,
        ZBODY: Float64Array.from(zbody),
        ABODY: Float64Array.from(abody),
        RBODY: rbody,
        SOURCE: source,
      },
    };
  } catch {
    for (let i = 0; i < state.II; i += 1) {
      state.UBODY[i] = 0.0;
    }
    return { error: 'Nacelle data file READ error', UBODY: state.UBODY };
  }
}

function ARBI(state, options = {}) {
  const stations = options.stations ?? [];
  assert(stations.length >= 3, 'ARBI: must have 3 or more stations');

  state.CONV = false;
  state.NBLDS = Math.trunc(options.NBLDS ?? state.NBLDS);
  state.VEL = options.VEL ?? state.VEL;
  const sgnrad = options.SGNRAD ?? options.RAD ?? state.RAD;
  state.RAD = Math.abs(sgnrad);
  const root = options.ROOT ?? 0.0;
  assert(state.RAD > root, 'ARBI: tip radius must exceed hub radius');
  state.XI0 = root / state.RAD;
  state.XW0 = state.XI0;
  state.XITIP = 1.0;
  SETX(state);
  xoper.XWINIT(state);

  const nst = stations.length;
  const w1 = new Float64Array(nst);
  const w2 = new Float64Array(nst);
  const w3 = new Float64Array(nst);
  for (let n = 0; n < nst; n += 1) {
    let radius = stations[n].r;
    let chord = stations[n].chord;
    const betaDeg = stations[n].betaDeg;
    if (sgnrad < 0.0) {
      radius /= state.RAD;
      chord /= state.RAD;
    }
    assert(radius >= state.XI0 && radius <= state.XITIP, 'ARBI: radii must be between root and tip');
    if (n > 0) {
      assert(radius > w1[n - 1], 'ARBI: radii must monotonically increase');
    }
    w1[n] = radius;
    w2[n] = chord;
    w3[n] = (betaDeg * PI) / 180.0;
  }

  for (let n = 0; n < nst; n += 1) {
    w1[n] = TINVRT(state, w1[n]);
  }
  const w4 = new Float64Array(nst);
  const w5 = new Float64Array(nst);
  SPLINE(w2, w4, w1, nst);
  SPLINE(w3, w5, w1, nst);

  for (let i = 0; i < state.II; i += 1) {
    state.CH[i] = Math.abs(SEVAL(state.T[i], w2, w4, w1, nst));
    state.BETA[i] = SEVAL(state.T[i], w3, w5, w1, nst);
    state.BETA0[i] = state.BETA[i];
    state.UBODY[i] = 0.0;
  }

  if (state.NAME === '') {
    state.NAME = 'Arbitrary blade';
  }
  const is = Math.trunc(state.II / 2) + 1;
  const ang = state.BETA[is - 1];
  state.ADV = Math.max(0.1, state.XI[is - 1] * Math.sin(ang) / Math.cos(ang));
  state.ADW = state.ADV;
  xaero.SETIAERO(state);

  return {
    CH: state.CH,
    BETA: state.BETA,
    ADV: state.ADV,
    ADW: state.ADW,
    XI: state.XI,
  };
}

function REINIT(state, options = {}) {
  const is = Math.trunc(state.II / 2) + 1;
  const ang = state.BETA[is - 1];
  const rpm = options.rpm ?? state.VEL / (state.RAD * state.ADV * PI / 30.0);
  void ang;
  state.ADV = Math.max(0.1, state.VEL / (rpm * state.RAD * PI / 30.0));
  state.ADW = state.ADV;

  if (options.restoreAngles) {
    for (let i = 0; i < state.II; i += 1) {
      state.BETA0[i] = state.BETA[i];
    }
  }

  const result = xoper.APER(state, 4, 2, true);
  return {
    ...result,
    output: state.CONV ? OUTPUT(state, state.LUWRIT) : null,
  };
}

function INTE(state, options = {}) {
  return xinte.INTE1(state, options);
}

function INTF(state, options = {}) {
  return xinte.INTE2(state, options);
}

function JMAP(state, options = {}) {
  return xjmap.JMAP(state, options);
}

function OPFILE(LU, FNAME, options = {}) {
  void LU;
  const fileName = makeString(FNAME || options.fileName, '').trim();
  assert(fileName.length > 0, 'OPFILE: missing output filename');
  const exists = fs.existsSync(fileName);
  const mode = options.mode ?? (exists ? 'overwrite' : 'new');
  let resolved = fileName;
  if (mode === 'new' && exists) {
    resolved = makeString(options.newFileName, '').trim();
    assert(resolved.length > 0, 'OPFILE: missing new output filename');
  }
  return { fileName: resolved, mode, exists };
}

function OUTPUT(state, LU = state.LUWRIT) {
  const iadd = LU === state.LUWRIT ? state.INCR : 1;
  const tdim = state.TTOT * state.RHO * state.VEL ** 2 * state.RAD ** 2;
  const qdim = state.QTOT * state.RHO * state.VEL ** 2 * state.RAD ** 3;
  const pdim = state.PTOT * state.RHO * state.VEL ** 3 * state.RAD ** 2;
  const tvdim = state.TVIS * state.RHO * state.VEL ** 2 * state.RAD ** 2;
  const pvdim = state.PVIS * state.RHO * state.VEL ** 3 * state.RAD ** 2;
  const efftot = state.TTOT / state.PTOT;
  const rpm = state.VEL / (state.RAD * state.ADV * PI / 30.0);
  const dia = 2.0 * state.RAD;
  const tnacel = (state.TWAK - state.TINV) * state.RHO * state.VEL ** 2 * state.RAD ** 2;
  const w1 = new Float64Array(state.II);
  SPLINE(state.CH, w1, state.XI, state.II);
  const ch34 = SEVAL(0.75, state.CH, w1, state.XI, state.II);
  const sigma = (state.NBLDS * ch34) / PI;
  const tc = tdim / (0.5 * state.RHO * state.VEL ** 2 * PI * state.RAD ** 2);
  const pc = pdim / (0.5 * state.RHO * state.VEL ** 3 * PI * state.RAD ** 2);
  const en = rpm / 60.0;
  const ct = tdim / (state.RHO * en ** 2 * dia ** 4);
  const cp = pdim / (state.RHO * en ** 3 * dia ** 5);
  const effind = state.TWAK / state.PWAK;
  const tclim = Math.max(-1.0, tc);
  const eideal = 2.0 / (1.0 + Math.sqrt(tclim + 1.0));

  let helicopter = null;
  if (state.ADV < 0.1) {
    const cth = ct / 7.7516;
    helicopter = {
      CTH: cth,
      CPH: cp / 24.352,
      CTOS: cth / sigma,
      FOM: (0.7979 * Math.abs(ct) ** 1.5) / cp,
    };
  }

  let solutionType = 'Unknown';
  if (state.DUCT) {
    if (state.IWTYP === 1 || state.IWTYP === 3) solutionType = 'Ducted Graded Momentum';
    if (state.IWTYP === 2) solutionType = 'Ducted Potential';
  } else {
    if (state.IWTYP === 1) solutionType = 'Free Tip Graded Momentum';
    if (state.IWTYP === 2) solutionType = 'Free Tip Potential';
    if (state.IWTYP === 3) solutionType = 'Free Tip Vortex Wake';
  }

  let reexp = 1.0;
  let remax = 0.0;
  for (let i = 0; i < state.II; i += 1) {
    remax = Math.max(remax, state.RE[i]);
  }
  if (remax >= 1.0e6) {
    reexp = 6.0;
  } else if (remax >= 1.0e3) {
    reexp = 3.0;
  }

  const rows = [];
  if (!state.TERSE) {
    for (let i = 1; i <= state.II; i += iadd) {
      const { WA, WT } = UVADD(state, state.XI[i - 1]);
      const vw = state.VWAK[i - 1];
      const vaw = (vw * state.XW[i - 1]) / state.ADW;
      const utotw = state.URDUCT;
      const cw = state.XI[i - 1] / state.ADV - WT - vw;
      const sw = utotw + WA + vaw;
      const effi = (cw / sw) * state.ADV / state.XW[i - 1];
      const c = xoper.CSCALC(state, i);
      rows.push({
        index: i,
        rOverR: state.XI[i - 1],
        cOverR: state.CH[i - 1],
        betaDeg: (state.BETA[i - 1] * 180.0) / PI,
        CL: state.CL[i - 1],
        stall: state.STALL[i - 1],
        CD: state.CD[i - 1],
        RE: state.RE[i - 1],
        RE_DISPLAY: state.RE[i - 1] / 10 ** reexp,
        RE_EXP: reexp,
        MACH: (c.W * state.VEL) / state.VSO,
        EFFI: effi,
        EFFP: state.EFFP[i - 1],
        UBODY: state.UBODY[i - 1],
      });
    }
  }

  return {
    converged: state.CONV,
    solutionType,
    wake: {
      ADW: state.ADW,
      URDUCT: state.DUCT ? state.URDUCT : null,
      externalSlipstream: state.NADD > 1,
      reverseFarSlipstream: state.ADW < 0.5 * state.ADV,
    },
    summary: {
      NBLDS: state.NBLDS,
      RAD: state.RAD,
      ADV: state.ADV,
      TDIM: tdim,
      PDIM: pdim,
      QDIM: qdim,
      EFFTOT: efftot,
      VEL: state.VEL,
      RPM: rpm,
      EFFIND: effind,
      EIDEAL: eideal,
      TC: tc,
      TNACEL: tnacel,
      HUB_RADIUS: state.XI0 * state.RAD,
      XW0_RADIUS: state.XW0 * state.RAD,
      TVDIM: tvdim,
      PVDIM: pvdim,
      RHO: state.RHO,
      VSO: state.VSO,
      RMU: state.RMU,
      SIGMA: sigma,
      CT: ct,
      CP: cp,
      J: state.ADV * PI,
      PC: pc,
    },
    helicopter,
    rows,
  };
}

function RESPACI(state, IINEW) {
  if (IINEW === state.II) {
    return { II: state.II, converged: state.CONV };
  }

  state.CONV = false;
  const w1 = state.XI.slice(0, state.II);
  const w2 = state.CH.slice(0, state.II);
  const w4 = state.BETA.slice(0, state.II);
  const w6 = state.UBODY.slice(0, state.II);
  const w3 = new Float64Array(state.II);
  const w5 = new Float64Array(state.II);
  const w7 = new Float64Array(state.II);
  SPLINE(w2, w3, w1, state.II);
  SPLINE(w4, w5, w1, state.II);
  SPLINE(w6, w7, w1, state.II);

  const iix = state.II;
  state.II = IINEW;
  SETX(state);
  xoper.XWINIT(state);

  for (let i = 0; i < state.II; i += 1) {
    state.CH[i] = SEVAL(state.XI[i], w2, w3, w1, iix);
    state.BETA[i] = SEVAL(state.XI[i], w4, w5, w1, iix);
    state.UBODY[i] = SEVAL(state.XI[i], w6, w7, w1, iix);
    state.BETA0[i] = state.BETA[i];
  }
  state.IINF = state.II + Math.trunc(state.II / 2);

  const result = xoper.APER(state, 4, 2, true);
  state.RADDES = state.RAD;
  state.VELDES = state.VEL;
  state.ADVDES = 0.0;
  state.RPMDES = state.VEL / (state.RAD * state.ADV) * 30.0 / PI;
  state.R0DES = state.XI0 * state.RAD;
  state.RWDES = state.XW0 * state.RAD;
  state.TDDES = state.TTOT * state.RHO * state.VEL ** 2 * state.RAD ** 2;
  state.PDDES = state.PTOT * state.RHO * state.VEL ** 3 * state.RAD ** 2;
  state.DEST = false;
  state.DESP = true;
  for (let i = 0; i < state.II; i += 1) {
    state.CLDES[i] = state.CL[i];
  }
  state.CLDES0 = 0.0;
  state.LROTOR = true;

  return {
    II: state.II,
    converged: result.converged,
    output: state.CONV ? OUTPUT(state, state.LUWRIT) : null,
  };
}

function CPROJ(state) {
  let AX0 = 0.0;
  let AX1 = 0.0;
  let AT1 = 0.0;
  let AT2 = 0.0;

  for (let i = 0; i < state.II; i += 1) {
    const VT = state.VIND[2][i];
    const VA = state.VIND[0][i];
    const CI = state.XI[i] / state.ADV - VT;
    const SI = 1.0 + VA;
    const W = Math.sqrt(CI * CI + SI * SI);
    const XX = state.XI[i] / state.ADV;
    AX0 += state.CH[i] * (1.0 / W) * state.DXI[i];
    AX1 += state.CH[i] * (1.0 / W) * state.DXI[i] * state.XI[i];
    AT1 += state.CH[i] * (XX / W) * state.DXI[i] * state.XI[i];
    AT2 += state.CH[i] * (XX / W) * state.DXI[i] * state.XI[i] ** 2;
  }

  return { AX0, AX1, AT1, AT2 };
}

function GETVEL(state, FNAME1 = '', options = {}) {
  const fileName = makeString(FNAME1 || options.fileName, '').trim();
  let text;
  try {
    text = options.text ?? fs.readFileSync(fileName, 'utf8');
  } catch {
    return { error: 'File read error' };
  }

  const rows = [];
  try {
    for (const line of parseText(text)) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }
      const values = trimmed.split(/\s+/).map(Number);
      if (values.length < 3 || values.some((value) => Number.isNaN(value))) {
        throw new Error('bad line');
      }
      rows.push({ r: values[0], u: values[1], v: values[2] });
    }
  } catch {
    return { error: 'File read error' };
  }

  if (rows.length < 2) {
    return { error: 'New wake velocities not read' };
  }

  state.NADD = rows.length;
  const uwt = options.axialWeight ?? 1.0;
  const vwt = options.tangentialWeight ?? 1.0;
  for (let i = 0; i < rows.length; i += 1) {
    state.RADD[i] = rows[i].r;
    state.UADD[i] = uwt * rows[i].u;
    state.VADD[i] = vwt * rows[i].v;
  }
  SPLINE(state.UADD, state.UADDR, state.RADD, state.NADD);
  SPLINE(state.VADD, state.VADDR, state.RADD, state.NADD);

  return {
    NADD: state.NADD,
    rows: rows.map((row, i) => ({
      r: state.RADD[i],
      u: state.UADD[i],
      v: state.VADD[i],
    })),
  };
}

function SAVVEL(state, FNAME1 = '', options = {}) {
  assert(state.RAD !== 0.0 && state.CONV, 'SAVVEL: Must define operating point first.');

  const rows = [];
  const blds = state.NBLDS;
  for (let i = 1; i <= state.II; i += 1) {
    const VT = (blds * state.GAM[i - 1]) / (4.0 * PI * state.XI[i - 1]);
    const VA = (VT * state.XI[i - 1]) / state.ADW;
    let UDUCT = 0.0;
    let VADUCT_VA = 1.0;
    if (state.DUCT) {
      UDUCT = state.URDUCT - 1.0;
      VADUCT_VA = 2.0 * state.URDUCT;
    }
    const VD = VA * (VADUCT_VA - 1.0);
    const UTOT = 1.0 + UDUCT + state.UBODY[i - 1];
    const { WA, WT } = UVADD(state, state.XI[i - 1]);
    const CI = state.XI[i - 1] / state.ADV - WT - VT;
    const SI = UTOT + WA + VA + VD;
    rows.push({
      r: state.XI[i - 1] * state.RAD,
      u: 2.0 * (SI - (UTOT + WA)) * state.VEL,
      v: -2.0 * (CI - (state.XI[i - 1] / state.ADV - WT)) * state.VEL,
    });
  }

  const text = `${rows.map((row) => `${row.r} ${row.u} ${row.v}`).join('\n')}\n`;
  const fileName = makeString(FNAME1 || options.fileName, '').trim();
  if (fileName.length > 0) {
    fs.writeFileSync(fileName, text, 'utf8');
  }
  return { fileName, rows, text };
}

function INIT(state, options = {}) {
  state.GREEK = false;
  state.IDEV = 1;
  state.IDEVRP = 2;
  state.IPSLU = 0;
  state.SCRNFR = 0.70;
  state.SIZE = 10.0;
  state.XPAGE = 11.0;
  state.YPAGE = 8.5;
  state.XMARG = 0.0;
  state.YMARG = 0.0;
  state.LEGEND = false;
  state.NCOLOR = 64;
  state.LSLOPE = false;
  state.URDUCT = 1.0;
  SETDEF(state);
  GETDEF(state, options);
  if (state.DUCT) {
    state.URDUCT = 1.0;
  }
  state.XINF = 3.0;
  state.NN = 32;
  state.IINF = state.II + Math.trunc(state.II / 2);
  state.CONV = false;
  state.LPLOT = false;
  state.WIND = false;
  state.LSTRUC = false;
  state.NAME = ' ';
  state.SAVFIL = ' ';
  state.GEE = 9.81;
  state.ADWFCTR = 1.0;
  assert(state.II <= IX, 'INIT: Array overflow. IX too small');
  state.XITIP = 1.0;
  for (let i = 0; i < state.II; i += 1) {
    state.UBODY[i] = 0.0;
  }
  state.NADD = 0;
  state.NCASE = 0;
  state.KCASE = 0;
  state.NITERD = 40;
  state.NITERA = 40;
  state.LDESINI = false;
  state.LOPRINI = true;
  state.LPWRVAR = false;
  state.NPWRVAR = 0;
  state.LROTOR = false;
  for (let i = 0; i < IX; i += 1) {
    state.IAERO[i] = 0;
  }
  state.XYOFF[0] = 0.0;
  state.XYOFF[1] = 0.0;
  state.XYFAC[0] = 0.0;
  state.XYFAC[1] = 0.0;
  return state;
}

function XROTOR(state, action = {}, hooks = {}) {
  const command = String(action.command ?? '').toUpperCase();
  if (command === 'AERO') {
    return hooks.AERO ? hooks.AERO(state, action) : xaero.AERO(state, {
      ...action,
      command: action.subcommand ?? action.aeroCommand ?? action.action ?? 'DISP',
    });
  }
  if (command === 'NAME') {
    if (action.value !== undefined) {
      state.NAME = makeString(action.value, state.NAME);
    }
    return { NAME: state.NAME };
  }
  if (command === 'ATMO') {
    state.ALT = action.value ?? state.ALT;
    const atmo = ATMO(state.ALT);
    state.VSO = atmo.VSOALT;
    state.RHO = atmo.RHOALT;
    state.RMU = atmo.RMUALT;
    return FLOSHO(state.LUWRIT, state.VSO, state.RHO, state.RMU);
  }
  if (command === 'VSOU') {
    state.VSO = action.value ?? state.VSO;
    state.ALT = 999.0;
    return { VSO: state.VSO };
  }
  if (command === 'DENS') {
    state.RHO = action.value ?? state.RHO;
    state.ALT = 999.0;
    return { RHO: state.RHO };
  }
  if (command === 'VISC') {
    state.RMU = action.value ?? state.RMU;
    state.ALT = 999.0;
    return { RMU: state.RMU };
  }
  if (command === 'DUCT') {
    state.DUCT = !state.DUCT;
    if (state.DUCT) {
      state.URDUCT = action.value ?? state.URDUCT;
    } else {
      state.URDUCT = 1.0;
    }
    return { DUCT: state.DUCT, URDUCT: state.URDUCT };
  }
  if (command === 'VRAT') {
    assert(state.DUCT, 'XROTOR: select duct option first');
    state.URDUCT = action.value ?? state.URDUCT;
    return { URDUCT: state.URDUCT };
  }
  if (command === 'II') {
    const iiNew = Math.trunc(action.value ?? state.II);
    if (state.LROTOR) {
      return RESPACI(state, iiNew);
    }
    state.II = iiNew;
    return { II: state.II };
  }
  if (command === 'INCR') {
    state.INCR = Math.trunc(action.value ?? state.INCR);
    return { INCR: state.INCR };
  }
  if (command === 'REIN') {
    return state.LROTOR ? REINIT(state, action) : { converged: false };
  }
  if (command === 'NACE') {
    return NACELL(state, action.fileName ?? action.value ?? '', action);
  }
  if (command === 'ARBI') {
    return ARBI(state, action);
  }
  if (command === 'DESI') {
    if (hooks.DESI) {
      return hooks.DESI(state, action);
    }
    return xdesi.DESI(state, {
      ...action,
      subcommand: action.subcommand ?? action.desiCommand ?? action.action,
    }, hooks);
  }
  if (command === 'MODI') {
    if (hooks.MODI) {
      return hooks.MODI(state, action);
    }
    return xmodi.MODI(state, {
      ...action,
      subcommand: action.subcommand ?? action.modiCommand ?? action.action,
    }, hooks);
  }
  if (command === 'OPER') {
    return hooks.OPER ? hooks.OPER(state, action) : xoper.OPER(state, {
      ...action,
      command: action.subcommand ?? action.operCommand ?? action.action ?? 'DISP',
    }, hooks);
  }
  if (command === 'BEND') {
    return hooks.BEND ? hooks.BEND(state, action) : xbend.BEND(state, {
      ...action,
      command: action.subcommand ?? action.bendCommand ?? action.action ?? 'HELP',
    });
  }
  if (command === 'INTE') {
    return INTE(state, action);
  }
  if (command === 'INTF') {
    if (hooks.INTF) {
      return hooks.INTF(state, action);
    }
    return INTF(state, action);
  }
  if (command === 'SAVE') {
    return hooks.SAVE ? hooks.SAVE(state, action) : xio.SAVE(state, action.fileName ?? action.value ?? '', action);
  }
  if (command === 'SAVO') {
    return hooks.SAVO ? hooks.SAVO(state, action) : xio.SAVEOLD(state, action.fileName ?? action.value ?? '', action);
  }
  if (command === 'LOAD') {
    return hooks.LOAD ? hooks.LOAD(state, action) : xio.LOAD(state, action.fileName ?? action.value ?? '', action);
  }
  if (command === 'WDEF') {
    return WRTDEF(state, action);
  }
  if (command === 'VPUT') {
    return SAVVEL(state, action.fileName ?? action.value ?? '', action);
  }
  if (command === 'VGET') {
    return GETVEL(state, action.fileName ?? action.value ?? '', action);
  }
  if (command === 'VCLR') {
    state.NADD = 0;
    return { NADD: 0 };
  }
  if (command === 'RESE') {
    return INIT(state, action);
  }
  if (command === 'JMAP') {
    if (hooks.JMAP) {
      return hooks.JMAP(state, action);
    }
    return JMAP(state, action);
  }
  if (command === 'NOIS') {
    return hooks.NOIS ? hooks.NOIS(state, action) : xnoise.NOISE(state, action);
  }
  if (command === 'WIND') {
    state.WIND = !state.WIND;
    return { WIND: state.WIND };
  }
  if (command === 'HARD') {
    return { hasPlot: state.LPLOT };
  }
  if (command === 'PLOP') {
    return {
      IDEV: state.IDEV,
      IDEVRP: state.IDEVRP,
      IPSLU: state.IPSLU,
      SIZE: state.SIZE,
      PAR: state.PAR,
      XMARG: state.XMARG,
      YMARG: state.YMARG,
      XPAGE: state.XPAGE,
      YPAGE: state.YPAGE,
      CSIZE: state.CSIZE,
      SCRNFR: state.SCRNFR,
      LCURS: state.LCURS,
      LLAND: state.LLAND,
      LSLOPE: state.LSLOPE,
    };
  }
  if (command === 'DISP') {
    return OUTPUT(state, state.LUWRIT);
  }
  if (hooks[command]) {
    return hooks[command](state, action);
  }
  throw new Error(`XROTOR: unsupported command ${command}`);
}

module.exports = {
  IX,
  IXP,
  PI,
  createState,
  INIT,
  SETDEF,
  GETDEF,
  WRTDEF,
  ATMO,
  FLOSHO,
  NACELL,
  ARBI,
  REINIT,
  INTE,
  INTF,
  JMAP,
  SETX,
  TINVRT,
  OPFILE,
  OUTPUT,
  RESPACI,
  CPROJ,
  GETVEL,
  SAVVEL,
  UVADD,
  XROTOR,
};
