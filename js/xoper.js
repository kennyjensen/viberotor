'use strict';

const fs = require('node:fs');

const { GAUSS } = require('./xutils.js');
const { TRISOL, SEVAL, DEVAL, SPLINA, SPLINE } = require('./spline.js');
const { GETCLCDCM, GETALF } = require('./xaero.js');
const { VRTXCO } = require('./vortex.js');

const IX = 100;
const IXP = IX + 1;
const NAX = 20;
const NDX = 14;
const NPARX = 12;
const ICASX = 100;
const IQ = IX + 5;
const PI = 3.141592654;

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

function ensureMatrix(value, rows, cols, name) {
  assert(Array.isArray(value), `${name}: expected an array of rows`);
  assert(value.length >= rows, `${name}: expected at least ${rows} rows`);
  for (let i = 0; i < rows; i += 1) {
    ensureVector(value[i], cols, `${name}[${i}]`);
  }
  return value;
}

function ensureTensor3(value, depth, rows, cols, name) {
  assert(Array.isArray(value), `${name}: expected an array of planes`);
  assert(value.length >= depth, `${name}: expected at least ${depth} planes`);
  for (let i = 0; i < depth; i += 1) {
    ensureMatrix(value[i], rows, cols, `${name}[${i}]`);
  }
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

function copyInt32(length, source = []) {
  const out = new Int32Array(length);
  const limit = Math.min(length, source.length ?? 0);
  for (let i = 0; i < limit; i += 1) {
    out[i] = Math.trunc(source[i]);
  }
  return out;
}

function copyBool(length, source = []) {
  const out = new Array(length).fill(false);
  const limit = Math.min(length, source.length ?? 0);
  for (let i = 0; i < limit; i += 1) {
    out[i] = Boolean(source[i]);
  }
  return out;
}

function allocateMatrix(rows, cols) {
  return Array.from({ length: rows }, () => new Float64Array(cols));
}

function allocateTensor3(depth, rows, cols) {
  return Array.from({ length: depth }, () => allocateMatrix(rows, cols));
}

function allocateAeroData() {
  return Array.from({ length: NDX }, () => new Float64Array(NAX));
}

function allocateCaseData() {
  return Array.from({ length: NPARX + 1 }, () => new Float64Array(ICASX));
}

function copyAeroData(source) {
  const out = allocateAeroData();
  if (!source) {
    return out;
  }
  for (let row = 0; row < Math.min(NDX, source.length); row += 1) {
    const current = source[row];
    if (!current) {
      continue;
    }
    for (let col = 0; col < Math.min(NAX, current.length); col += 1) {
      out[row][col] = current[col];
    }
  }
  return out;
}

function copyCaseData(source) {
  const out = allocateCaseData();
  if (!source) {
    return out;
  }
  for (let row = 0; row < Math.min(NPARX + 1, source.length); row += 1) {
    const current = source[row];
    if (!current) {
      continue;
    }
    for (let col = 0; col < Math.min(ICASX, current.length); col += 1) {
      out[row][col] = current[col];
    }
  }
  return out;
}

function makeString(value, fallback = '') {
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

function inferGeometry(state) {
  if (state.II > 0 && state.XI0 === 0.0) {
    const firstXV = state.XV[0];
    if (firstXV !== 0.0) {
      state.XI0 = firstXV;
    }
  }
  if (state.II > 0 && state.XITIP === 0.0) {
    const tipXV = state.XV[state.II];
    if (tipXV !== 0.0) {
      state.XITIP = tipXV;
    } else {
      state.XITIP = 1.0;
    }
  }
  if (state.XW0 === 0.0) {
    state.XW0 = state.XI0;
  }
  return state;
}

function createState(overrides = {}) {
  const state = {
    CONV: Boolean(overrides.CONV),
    GREEK: Boolean(overrides.GREEK),
    TERSE: Boolean(overrides.TERSE),
    VRTX: Boolean(overrides.VRTX),
    FAST: overrides.FAST === undefined ? true : Boolean(overrides.FAST),
    FREE: Boolean(overrides.FREE),
    DUCT: Boolean(overrides.DUCT),
    LSTRUC: Boolean(overrides.LSTRUC),
    WIND: Boolean(overrides.WIND),
    DEST: Boolean(overrides.DEST),
    DESP: Boolean(overrides.DESP),
    LDESINI: Boolean(overrides.LDESINI),
    LOPRINI: Boolean(overrides.LOPRINI),
    LROTOR: Boolean(overrides.LROTOR),
    LVNORM: Boolean(overrides.LVNORM),
    LPWRVAR: Boolean(overrides.LPWRVAR),
    LEGEND: Boolean(overrides.LEGEND),
    STALL: copyBool(IX, overrides.STALL),
    SAVFIL: makeString(overrides.SAVFIL),
    FNAME: makeString(overrides.FNAME),
    NAME: makeString(overrides.NAME),
    LUREAD: overrides.LUREAD ?? 5,
    LUWRIT: overrides.LUWRIT ?? 6,
    LUTEMP: overrides.LUTEMP ?? 0,
    LUSAVE: overrides.LUSAVE ?? 0,
    RHO: overrides.RHO ?? 1.225,
    RMU: overrides.RMU ?? 1.789e-5,
    VSO: overrides.VSO ?? 340.0,
    VEL: overrides.VEL ?? 1.0,
    RAD: overrides.RAD ?? 1.0,
    GEE: overrides.GEE ?? 9.81,
    ALT: overrides.ALT ?? 0.0,
    II: overrides.II ?? 0,
    IINF: overrides.IINF ?? 0,
    INCR: overrides.INCR ?? 1,
    NN: overrides.NN ?? 0,
    NBLDS: overrides.NBLDS ?? 2,
    IXSPAC: overrides.IXSPAC ?? 1,
    NITERD: overrides.NITERD ?? 0,
    NITERA: overrides.NITERA ?? 10,
    IAERO: copyInt32(IX, overrides.IAERO),
    CH: copyFloat64(IX, overrides.CH),
    BETA: copyFloat64(IX, overrides.BETA),
    BETA0: copyFloat64(IX, overrides.BETA0),
    T: copyFloat64(IX, overrides.T),
    DBETA: overrides.DBETA ?? 0.0,
    XI: copyFloat64(IX, overrides.XI),
    DXI: copyFloat64(IX, overrides.DXI),
    XI0: overrides.XI0 ?? 0.0,
    XITIP: overrides.XITIP ?? 0.0,
    XINF: overrides.XINF ?? 0.0,
    XPITCH: overrides.XPITCH ?? 0.0,
    XV: copyFloat64(IX, overrides.XV),
    RAKE: overrides.RAKE ?? 0.0,
    NADD: overrides.NADD ?? 0,
    RADD: copyFloat64(IX, overrides.RADD),
    UADD: copyFloat64(IX, overrides.UADD),
    VADD: copyFloat64(IX, overrides.VADD),
    UADDR: copyFloat64(IX, overrides.UADDR),
    VADDR: copyFloat64(IX, overrides.VADDR),
    UBODY: copyFloat64(IX, overrides.UBODY),
    VBODY: copyFloat64(IX, overrides.VBODY),
    URDUCT: overrides.URDUCT ?? 1.0,
    CL: copyFloat64(IX, overrides.CL),
    CD: copyFloat64(IX, overrides.CD),
    CM: copyFloat64(IX, overrides.CM),
    RE: copyFloat64(IX, overrides.RE),
    EFFP: copyFloat64(IX, overrides.EFFP),
    GAM: copyFloat64(IX, overrides.GAM),
    DTII: copyFloat64(IX, overrides.DTII),
    DPII: copyFloat64(IX, overrides.DPII),
    DTVI: copyFloat64(IX, overrides.DTVI),
    DPVI: copyFloat64(IX, overrides.DPVI),
    DTWI: copyFloat64(IX, overrides.DTWI),
    DPWI: copyFloat64(IX, overrides.DPWI),
    NAERO: overrides.NAERO ?? 0,
    XIAERO: copyFloat64(NAX, overrides.XIAERO),
    AERODATA: copyAeroData(overrides.AERODATA),
    CASPAR: copyCaseData(overrides.CASPAR),
    NCASE: overrides.NCASE ?? 0,
    KCASE: overrides.KCASE ?? 0,
    IWTYP: overrides.IWTYP ?? 0,
    ADV: overrides.ADV ?? 1.0,
    ADW: overrides.ADW ?? 1.0,
    ADWFCTR: overrides.ADWFCTR ?? 1.0,
    RMS: overrides.RMS ?? 0.0,
    RLX: overrides.RLX ?? 1.0,
    EFFINV: overrides.EFFINV ?? 0.0,
    TSPEC: overrides.TSPEC ?? 0.0,
    PSPEC: overrides.PSPEC ?? 0.0,
    QSPEC: overrides.QSPEC ?? 0.0,
    TTOT: overrides.TTOT ?? 0.0,
    PTOT: overrides.PTOT ?? 0.0,
    QTOT: overrides.QTOT ?? 0.0,
    TINV: overrides.TINV ?? 0.0,
    PINV: overrides.PINV ?? 0.0,
    TWAK: overrides.TWAK ?? 0.0,
    PWAK: overrides.PWAK ?? 0.0,
    TVIS: overrides.TVIS ?? 0.0,
    PVIS: overrides.PVIS ?? 0.0,
    GRESMX: overrides.GRESMX ?? 0.0,
    FRESMX: overrides.FRESMX ?? 0.0,
    ARESMX: overrides.ARESMX ?? 0.0,
    TI_ADV: overrides.TI_ADV ?? 0.0,
    PI_ADV: overrides.PI_ADV ?? 0.0,
    TI_ADW: overrides.TI_ADW ?? 0.0,
    PI_ADW: overrides.PI_ADW ?? 0.0,
    TW_ADV: overrides.TW_ADV ?? 0.0,
    PW_ADV: overrides.PW_ADV ?? 0.0,
    TW_ADW: overrides.TW_ADW ?? 0.0,
    PW_ADW: overrides.PW_ADW ?? 0.0,
    TV_ADV: overrides.TV_ADV ?? 0.0,
    PV_ADV: overrides.PV_ADV ?? 0.0,
    TV_ADW: overrides.TV_ADW ?? 0.0,
    PV_ADW: overrides.PV_ADW ?? 0.0,
    TV_DBE: overrides.TV_DBE ?? 0.0,
    PV_DBE: overrides.PV_DBE ?? 0.0,
    TI_GAM: copyFloat64(IX, overrides.TI_GAM),
    PI_GAM: copyFloat64(IX, overrides.PI_GAM),
    TW_GAM: copyFloat64(IX, overrides.TW_GAM),
    PW_GAM: copyFloat64(IX, overrides.PW_GAM),
    TV_GAM: copyFloat64(IX, overrides.TV_GAM),
    PV_GAM: copyFloat64(IX, overrides.PV_GAM),
    NPWRVAR: overrides.NPWRVAR ?? 0,
    RPMVAR: copyFloat64(IX, overrides.RPMVAR),
    PWRVAR: copyFloat64(IX, overrides.PWRVAR),
    XPWRVAR: copyFloat64(IX, overrides.XPWRVAR),
    VWAK: copyFloat64(IX, overrides.VWAK),
    VW_GAM: allocateMatrix(IX, IX),
    VW_ADW: copyFloat64(IX, overrides.VW_ADW),
    VW_ADV: copyFloat64(IX, overrides.VW_ADV),
    VIND: allocateMatrix(3, IX),
    VIND_GAM: allocateTensor3(3, IX, IX),
    VIND_ADW: allocateMatrix(3, IX),
    XW0: overrides.XW0 ?? 0.0,
    XWTIP: overrides.XWTIP ?? 0.0,
    XW: copyFloat64(IX, overrides.XW),
    XW_GAM: allocateMatrix(IX, IX),
    XW_ADW: copyFloat64(IX, overrides.XW_ADW),
    XW_ADV: copyFloat64(IX, overrides.XW_ADV),
    DXW: copyFloat64(IX, overrides.DXW),
    DXW_GAM: allocateMatrix(IX, IX),
    DXW_ADW: copyFloat64(IX, overrides.DXW_ADW),
    DXW_ADV: copyFloat64(IX, overrides.DXW_ADV),
    DGAM: copyFloat64(IX, overrides.DGAM),
    RES: copyFloat64(IQ, overrides.RES),
    DADV: overrides.DADV ?? 0.0,
    DADW: overrides.DADW ?? 0.0,
    DBET: overrides.DBET ?? 0.0,
    DEFF: overrides.DEFF ?? 0.0,
    DQ: copyFloat64(IQ, overrides.DQ),
    DGAMOLD: copyFloat64(IX, overrides.DGAMOLD),
    SIZE: overrides.SIZE ?? 1.0,
    SCRNFR: overrides.SCRNFR ?? 1.0,
    PAR: overrides.PAR ?? 1.0,
    CSIZE: overrides.CSIZE ?? 1.0,
    CLDES: copyFloat64(IX, overrides.CLDES),
  };

  if (overrides.VW_GAM) {
    for (let i = 0; i < Math.min(IX, overrides.VW_GAM.length); i += 1) {
      const row = overrides.VW_GAM[i];
      for (let j = 0; j < Math.min(IX, row.length); j += 1) {
        state.VW_GAM[i][j] = row[j];
      }
    }
  }
  if (overrides.VIND) {
    for (let k = 0; k < Math.min(3, overrides.VIND.length); k += 1) {
      const row = overrides.VIND[k];
      for (let i = 0; i < Math.min(IX, row.length); i += 1) {
        state.VIND[k][i] = row[i];
      }
    }
  }
  if (overrides.VIND_GAM) {
    for (let k = 0; k < Math.min(3, overrides.VIND_GAM.length); k += 1) {
      const plane = overrides.VIND_GAM[k];
      for (let i = 0; i < Math.min(IX, plane.length); i += 1) {
        const row = plane[i];
        for (let j = 0; j < Math.min(IX, row.length); j += 1) {
          state.VIND_GAM[k][i][j] = row[j];
        }
      }
    }
  }
  if (overrides.VIND_ADW) {
    for (let k = 0; k < Math.min(3, overrides.VIND_ADW.length); k += 1) {
      const row = overrides.VIND_ADW[k];
      for (let i = 0; i < Math.min(IX, row.length); i += 1) {
        state.VIND_ADW[k][i] = row[i];
      }
    }
  }
  if (overrides.XW_GAM) {
    for (let i = 0; i < Math.min(IX, overrides.XW_GAM.length); i += 1) {
      const row = overrides.XW_GAM[i];
      for (let j = 0; j < Math.min(IX, row.length); j += 1) {
        state.XW_GAM[i][j] = row[j];
      }
    }
  }
  if (overrides.DXW_GAM) {
    for (let i = 0; i < Math.min(IX, overrides.DXW_GAM.length); i += 1) {
      const row = overrides.DXW_GAM[i];
      for (let j = 0; j < Math.min(IX, row.length); j += 1) {
        state.DXW_GAM[i][j] = row[j];
      }
    }
  }

  inferGeometry(state);
  return state;
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

function parseText(text) {
  return text.split(/\r?\n/);
}

function GETPVAR(LU, NDIM, N, XRPM, XPWR, options = {}) {
  const text = options.text ?? fs.readFileSync(options.fileName, 'utf8');
  const lines = parseText(text);
  const xrpm = XRPM ?? new Float64Array(NDIM);
  const xpwr = XPWR ?? new Float64Array(NDIM);
  let count = 0;

  for (let i = 1; i < lines.length && count < NDIM; i += 1) {
    const line = lines[i].trim();
    if (line.length === 0) {
      continue;
    }
    const values = line.split(/\s+/).map(Number);
    if (values.length < 2 || values.some((value) => Number.isNaN(value))) {
      return { N: 0, XRPM: xrpm, XPWR: xpwr, error: 'File read error' };
    }
    xrpm[count] = values[0];
    xpwr[count] = values[1];
    count += 1;
  }

  return { N: count, XRPM: xrpm, XPWR: xpwr };
}

function SHOCAS(LU, NDIM, N, PAR, RAD, NAME) {
  assert(NDIM >= 11, 'SHOCAS: NDIM too small for PAR array');

  const rows = [];
  for (let i = 0; i < N; i += 1) {
    const adv = PAR[1][i];
    const vel = PAR[2][i];
    const bet = (PAR[3][i] * 180.0) / PI;
    const alt = PAR[4][i];
    const rho = PAR[5][i];
    const rmu = PAR[6][i] * 1.0e5;
    const vso = PAR[7][i];
    const convflg = PAR[8][i];
    const pow = PAR[8][i] * 0.001;
    const thr = PAR[9][i];
    const trq = PAR[10][i];
    const eff = PAR[11][i];
    const rpm = vel / (RAD * adv) * 30.0 / PI;
    rows.push({
      index: i + 1,
      ADV: adv,
      BET: bet,
      VEL: vel,
      RPM: rpm,
      RHO: rho,
      RMU1E5: rmu,
      VSO: vso,
      ALT: alt,
      POW: convflg === 999.0 ? null : pow,
      THR: convflg === 999.0 ? null : thr,
      TRQ: convflg === 999.0 ? null : trq,
      EFF: convflg === 999.0 ? null : eff,
    });
  }

  return { NAME, rows };
}

function GETCAS(LU, NDIM, NCAS, PAR, options = {}) {
  assert(NDIM >= 11, 'GETCAS: NDIM too small for PAR array');
  const text = options.text ?? fs.readFileSync(options.fileName, 'utf8');
  const lines = parseText(text);
  const caseName = lines[0] ?? '';
  const out = PAR ?? allocateCaseData();
  let count = 0;

  for (let i = 3; i < lines.length && count < ICASX; i += 1) {
    const line = lines[i].trim();
    if (line.length === 0) {
      continue;
    }
    const values = line.split(/\s+/).map(Number);
    if (values.some((value) => Number.isNaN(value)) || (values.length !== 9 && values.length !== 13)) {
      return { NCAS: 0, PAR: out, NAME: caseName, error: 'File read error' };
    }
    const adv = values[1];
    const bet = values[2] * PI / 180.0;
    const vel = values[3];
    const rho = values[5];
    const rmu = values[6] / 1.0e5;
    const vso = values[7];
    const alt = values[8];
    let pow = 999.0;
    let thr = 999.0;
    let trq = 999.0;
    let eff = 999.0;
    if (values.length === 13) {
      pow = values[9] * 1000.0;
      thr = values[10];
      trq = values[11];
      eff = values[12];
    }
    out[1][count] = adv;
    out[2][count] = vel;
    out[3][count] = bet;
    out[4][count] = alt;
    out[5][count] = rho;
    out[6][count] = rmu;
    out[7][count] = vso;
    out[8][count] = pow;
    out[9][count] = thr;
    out[10][count] = trq;
    out[11][count] = eff;
    count += 1;
  }

  return { NCAS: count, PAR: out, NAME: caseName };
}

function resolveCaseInputs(NINPUT, RINPUT, defaults, optionKeys, options = {}) {
  const values = defaults.slice();
  for (let i = 0; i < Math.min(NINPUT, values.length); i += 1) {
    values[i] = RINPUT[i];
  }
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] === 999.0) {
      const key = optionKeys[i];
      assert(key in options, `SETCAS: missing option ${key}`);
      values[i] = options[key];
    }
  }
  return values;
}

function SETCAS(state, ITYPE, NINPUT, RINPUT, options = {}) {
  let kcase = 0;

  if (ITYPE === 1) {
    kcase = 1;
    const [adv1Raw, adv2Raw, dAdvRaw] = resolveCaseInputs(
      NINPUT,
      RINPUT,
      [999.0, 999.0, 999.0],
      ['ADV1', 'ADV2', 'DADV'],
      options,
    );
    if (adv1Raw === adv2Raw) {
      return { added: 0 };
    }
    const dadv = Math.sign(adv2Raw - adv1Raw || 1.0) * Math.abs(dAdvRaw);
    let np = dadv !== 0.0 ? Math.trunc((adv2Raw - adv1Raw) / dadv + 0.5) + 1 : 1;
    if (np <= 0) {
      return { added: 0 };
    }
    const xans = options.usePowerLine && state.LPWRVAR ? 100.0 : 0.0;
    if (state.NCASE + np > ICASX) {
      np = ICASX - state.NCASE;
    }
    for (let ip = 0; ip < np; ip += 1) {
      const index = state.NCASE;
      state.CASPAR[0][index] = xans + kcase;
      state.CASPAR[1][index] = adv1Raw + dadv * ip;
      state.CASPAR[2][index] = state.VEL;
      state.CASPAR[3][index] = state.BETA[state.II - 1];
      state.CASPAR[4][index] = state.ALT;
      state.CASPAR[5][index] = state.RHO;
      state.CASPAR[6][index] = state.RMU;
      state.CASPAR[7][index] = state.VSO;
      state.CASPAR[8][index] = 999.0;
      state.CASPAR[9][index] = 999.0;
      state.CASPAR[10][index] = 999.0;
      state.CASPAR[11][index] = 999.0;
      state.NCASE += 1;
    }
  } else if (ITYPE === 2) {
    kcase = 2;
    const [rpm1Raw, rpm2Raw, dRpmRaw] = resolveCaseInputs(
      NINPUT,
      RINPUT,
      [999.0, 999.0, 999.0],
      ['RPM1', 'RPM2', 'DRPM'],
      options,
    );
    if (rpm1Raw === rpm2Raw) {
      return { added: 0 };
    }
    const drpm = Math.sign(rpm2Raw - rpm1Raw || 1.0) * Math.abs(dRpmRaw);
    let np = drpm !== 0.0 ? Math.trunc((rpm2Raw - rpm1Raw) / drpm + 0.5) + 1 : 1;
    if (np <= 0) {
      return { added: 0 };
    }
    let xans = options.usePowerLine && state.LPWRVAR ? 100.0 : 0.0;
    const fixed = String(options.fixed ?? '').toUpperCase();
    if (fixed === 'T') {
      xans += 1000.0;
    }
    if (fixed === 'Q') {
      xans += 2000.0;
    }
    if (fixed === 'P') {
      xans += 3000.0;
    }
    if (state.NCASE + np > ICASX) {
      np = ICASX - state.NCASE;
    }
    for (let ip = 0; ip < np; ip += 1) {
      const rpm = rpm1Raw + drpm * ip;
      const index = state.NCASE;
      state.CASPAR[0][index] = xans + kcase;
      state.CASPAR[1][index] = state.VEL / (rpm * state.RAD) * 30.0 / PI;
      state.CASPAR[2][index] = state.VEL;
      state.CASPAR[3][index] = state.BETA[state.II - 1];
      state.CASPAR[4][index] = state.ALT;
      state.CASPAR[5][index] = state.RHO;
      state.CASPAR[6][index] = state.RMU;
      state.CASPAR[7][index] = state.VSO;
      state.CASPAR[8][index] = 999.0;
      state.CASPAR[9][index] = 999.0;
      state.CASPAR[10][index] = 999.0;
      state.CASPAR[11][index] = 999.0;
      state.NCASE += 1;
    }
  } else if (ITYPE === 3) {
    kcase = 3;
    const [bet1Raw, bet2Raw, dBetRaw] = resolveCaseInputs(
      NINPUT,
      RINPUT,
      [999.0, 999.0, 999.0],
      ['BET1', 'BET2', 'DBET'],
      options,
    );
    if (bet1Raw === bet2Raw) {
      return { added: 0 };
    }
    const dbet = Math.sign(bet2Raw - bet1Raw || 1.0) * Math.abs(dBetRaw);
    let np = dbet !== 0.0 ? Math.trunc((bet2Raw - bet1Raw) / dbet + 0.5) + 1 : 1;
    if (np <= 0) {
      return { added: 0 };
    }
    const xans = options.usePowerLine && state.LPWRVAR ? 100.0 : 0.0;
    if (state.NCASE + np > ICASX) {
      np = ICASX - state.NCASE;
    }
    for (let ip = 0; ip < np; ip += 1) {
      const index = state.NCASE;
      state.CASPAR[0][index] = xans + kcase;
      state.CASPAR[1][index] = state.ADV;
      state.CASPAR[2][index] = state.VEL;
      state.CASPAR[3][index] = (bet1Raw + dbet * ip) * PI / 180.0;
      state.CASPAR[4][index] = state.ALT;
      state.CASPAR[5][index] = state.RHO;
      state.CASPAR[6][index] = state.RMU;
      state.CASPAR[7][index] = state.VSO;
      state.CASPAR[8][index] = 999.0;
      state.CASPAR[9][index] = 999.0;
      state.CASPAR[10][index] = 999.0;
      state.CASPAR[11][index] = 999.0;
      state.NCASE += 1;
    }
  } else if (ITYPE === 4) {
    kcase = 4;
    const [vel1Raw, vel2Raw, dVelRaw] = resolveCaseInputs(
      NINPUT,
      RINPUT,
      [999.0, 999.0, 999.0],
      ['VEL1', 'VEL2', 'DVEL'],
      options,
    );
    if (vel1Raw === vel2Raw) {
      return { added: 0 };
    }
    const dvel = Math.sign(vel2Raw - vel1Raw || 1.0) * Math.abs(dVelRaw);
    let np = dvel !== 0.0 ? Math.trunc((vel2Raw - vel1Raw) / dvel + 0.5) + 1 : 1;
    if (np <= 0) {
      return { added: 0 };
    }
    const xans = options.usePowerLine && state.LPWRVAR ? 100.0 : 0.0;
    const mode = String(options.mode ?? 'FP').toUpperCase();
    if (mode === 'CS') {
      kcase = 5;
      if (!options.constantRpm) {
        throw new Error('SETCAS: missing constantRpm for CS mode');
      }
      if (!options.usePowerLine && options.constantPower === undefined && state.PSPEC <= 0.0 && state.PTOT > 0.0) {
        state.PSPEC = state.PTOT * (state.RHO * state.VEL ** 3 * state.RAD ** 2);
      }
      if (!options.usePowerLine && options.constantPower !== undefined) {
        state.PSPEC = options.constantPower;
      }
    }
    if (state.NCASE + np > ICASX) {
      np = ICASX - state.NCASE;
    }
    for (let ip = 0; ip < np; ip += 1) {
      const vvel = vel1Raw + dvel * ip;
      const index = state.NCASE;
      state.CASPAR[0][index] = xans + kcase;
      state.CASPAR[1][index] = (vvel * state.ADV) / state.VEL;
      state.CASPAR[2][index] = vvel;
      state.CASPAR[3][index] = state.BETA[state.II - 1];
      state.CASPAR[4][index] = state.ALT;
      state.CASPAR[5][index] = state.RHO;
      state.CASPAR[6][index] = state.RMU;
      state.CASPAR[7][index] = state.VSO;
      state.CASPAR[8][index] = 999.0;
      state.CASPAR[9][index] = 999.0;
      state.CASPAR[10][index] = 999.0;
      state.CASPAR[11][index] = 999.0;
      state.NCASE += 1;
    }
  }

  state.KCASE = kcase;
  return { added: state.NCASE, KCASE: kcase };
}

function VCALC(state) {
  for (let i = 0; i < state.II; i += 1) {
    let vxsum = 0.0;
    let vysum = 0.0;
    let vzsum = 0.0;
    for (let j = 0; j < state.II; j += 1) {
      vxsum += state.VIND_GAM[0][i][j] * state.GAM[j];
      vysum += state.VIND_GAM[1][i][j] * state.GAM[j];
      vzsum += state.VIND_GAM[2][i][j] * state.GAM[j];
    }
    state.VIND[0][i] = vxsum;
    state.VIND[1][i] = vysum;
    state.VIND[2][i] = vzsum;
  }
  return state.VIND;
}

function GRADMO(IMAX, II, NBLDS, LDUCT, RAKE, XI, XV, GAM, ADW, VIND_GAM, VIND_ADW) {
  const xi = ensureVector(XI, IMAX, 'XI');
  const xv = ensureVector(XV, IMAX, 'XV');
  const gam = ensureVector(GAM, IMAX, 'GAM');
  const vindGam = VIND_GAM ?? allocateTensor3(3, IMAX, IMAX);
  const vindAdw = VIND_ADW ?? allocateMatrix(3, IMAX);
  ensureTensor3(vindGam, 3, IMAX, IMAX, 'VIND_GAM');
  ensureMatrix(vindAdw, 3, IMAX, 'VIND_ADW');
  void RAKE;

  const blds = NBLDS;
  const pi = 4.0 * Math.atan(1.0);
  const xitip = xv[II];

  if (LDUCT) {
    for (let i = 1; i <= II; i += 1) {
      for (let j = 1; j <= II; j += 1) {
        vindGam[0][i - 1][j - 1] = 0.0;
        vindGam[1][i - 1][j - 1] = 0.0;
        vindGam[2][i - 1][j - 1] = 0.0;
      }
      vindGam[2][i - 1][i - 1] = blds / (4.0 * pi * xi[i - 1]);
      vindAdw[2][i - 1] = 0.0;
      vindAdw[1][i - 1] = 0.0;
      vindGam[0][i - 1][i - 1] = (vindGam[2][i - 1][i - 1] * xi[i - 1]) / ADW;
      vindAdw[0][i - 1] = (-vindGam[0][i - 1][i - 1] * gam[i - 1]) / ADW;
    }
  } else {
    const sfac = Math.sqrt(1.0 + 1.0 / ADW ** 2);
    const sfAdw = (0.5 / sfac) * (-2.0 / ADW ** 3);

    for (let i = 1; i <= II; i += 1) {
      for (let j = 1; j <= II; j += 1) {
        vindGam[0][i - 1][j - 1] = 0.0;
        vindGam[1][i - 1][j - 1] = 0.0;
        vindGam[2][i - 1][j - 1] = 0.0;
      }
      vindAdw[0][i - 1] = 0.0;
      vindAdw[1][i - 1] = 0.0;
      vindAdw[2][i - 1] = 0.0;

      const arg = Math.min(20.0, 0.5 * blds * (1.0 - xi[i - 1] / xitip) * sfac);
      const ek = Math.exp(-arg);
      const ekAdw = -ek * 0.5 * blds * (1.0 - xi[i - 1] / xitip) * sfAdw;
      const fk = Math.sqrt(1.0 - ek * ek);
      const fkAdw = (0.5 / fk) * (-2.0 * ek * ekAdw);
      const f = (Math.atan2(fk, ek) * 2.0) / pi;
      const fAdw = ((ek * fkAdw - fk * ekAdw) / (ek * ek + fk * fk)) * 2.0 / pi;

      vindGam[2][i - 1][i - 1] = blds / (4.0 * pi * f * xi[i - 1]);
      vindAdw[2][i - 1] = vindGam[2][i - 1][i - 1] * gam[i - 1] * (-fAdw / f);
      vindGam[0][i - 1][i - 1] = (vindGam[2][i - 1][i - 1] * xi[i - 1]) / ADW;
      vindAdw[0][i - 1] = (vindAdw[2][i - 1] * xi[i - 1]) / ADW - (vindGam[0][i - 1][i - 1] * gam[i - 1]) / ADW;
    }
  }

  return { VIND_GAM: vindGam, VIND_ADW: vindAdw };
}

function HELICO(IMAX, II, NBLDS, LDUCT, RAKE, XI, XV, GAM, ADW, VIND_GAM, VIND_ADW) {
  const IDIM = 150;
  assert(IDIM >= IMAX, 'HELICO: Array overflow. Increase IDIM.');
  const xi = ensureVector(XI, IMAX, 'XI');
  const xv = ensureVector(XV, IMAX, 'XV');
  const gam = ensureVector(GAM, IMAX, 'GAM');
  const vindGam = VIND_GAM ?? allocateTensor3(3, IMAX, IMAX);
  const vindAdw = VIND_ADW ?? allocateMatrix(3, IMAX);
  ensureTensor3(vindGam, 3, IMAX, IMAX, 'VIND_GAM');
  ensureMatrix(vindAdw, 3, IMAX, 'VIND_ADW');
  void RAKE;

  const x = new Float64Array(IDIM + 1);
  const ainv = new Float64Array(IDIM + 1);
  const csav = new Float64Array(IDIM + 1);
  const anGam = Array.from({ length: IDIM + 1 }, () => new Float64Array(IDIM + 1));
  const anAdw = new Float64Array(IDIM + 1);
  const sys = Array.from({ length: 4 }, () => new Float64Array(IDIM + 1));
  const pi = 4.0 * Math.atan(1.0);
  const NN = 128;

  for (let i = 1; i <= II; i += 1) {
    x[i] = xi[i - 1];
  }

  const xi0 = xv[0];
  const xitip = xv[II];
  x[0] = 2.0 * xi0 - xi[0];
  x[II + 1] = 2.0 * xitip - xi[II - 1];

  let iiMax;
  if (LDUCT) {
    iiMax = II + 1;
  } else {
    const xinf = 4.0 * xitip;
    x[II + 2] = 2.0 * xitip - xi[II - 2];
    x[II + 3] = 2.0 * xitip - xi[II - 3];
    x[II + 4] = 2.0 * xitip - xi[II - 4];
    const xfac = (x[II + 4] - x[II + 3]) / (x[II + 3] - x[II + 2]);
    let dx = (x[II + 4] - x[II + 3]) * xfac;
    iiMax = IDIM - 1;
    for (let i = II + 5; i <= IDIM - 1; i += 1) {
      x[i] = x[i - 1] + dx;
      if (x[i] >= xinf) {
        iiMax = i;
        break;
      }
      dx *= xfac;
    }
  }

  for (let i = 1; i <= II; i += 1) {
    for (let j = 1; j <= II; j += 1) {
      vindGam[0][i - 1][j - 1] = 0.0;
      vindGam[1][i - 1][j - 1] = 0.0;
      vindGam[2][i - 1][j - 1] = 0.0;
    }
    vindAdw[0][i - 1] = 0.0;
    vindAdw[1][i - 1] = 0.0;
    vindAdw[2][i - 1] = 0.0;
  }

  const adwInv = 1.0 / ADW ** 2;
  const qbsq = 0.25 * NBLDS ** 2;

  for (let i = 1; i <= iiMax - 1; i += 1) {
    sys[0][i] = (x[i] + x[i - 1]) / (x[i] - x[i - 1]);
    sys[2][i] = (x[i + 1] + x[i]) / (x[i + 1] - x[i]);
    sys[1][i] = qbsq * (1.0 / x[i] + x[i] * adwInv) * (x[i + 1] - x[i - 1]);
    sys[3][i] = qbsq * ((-2.0 * x[i] * adwInv) / ADW) * (x[i + 1] - x[i - 1]);
  }

  sys[0][iiMax] = LDUCT ? -1.0 : 1.0;

  for (let n = 2; n <= NN; n += 2) {
    const rn = n;
    ainv[0] = 1.0;
    csav[0] = -1.0;

    for (let i = 1; i <= iiMax - 1; i += 1) {
      const b = sys[0][i];
      const a = -(sys[0][i] + sys[1][i] * rn ** 2 + sys[2][i]);
      const c = sys[2][i];
      ainv[i] = 1.0 / (a - b * csav[i - 1]);
      csav[i] = c * ainv[i];
    }

    {
      const i = iiMax;
      const b = sys[0][i];
      const a = 1.0;
      ainv[i] = 1.0 / (a - b * csav[i - 1]);
    }

    for (let i = 0; i <= iiMax; i += 1) {
      anGam[i].fill(0.0, 0, II + 1);
    }

    for (let i = 1; i <= II; i += 1) {
      anGam[i][0] = sys[1][i] * rn ** 2 * gam[i - 1];
      anGam[i][i] = sys[1][i] * rn ** 2;
    }

    for (let i = 1; i <= iiMax; i += 1) {
      const im = i - 1;
      const b = sys[0][i];
      const jLast = Math.min(i, II);
      for (let j = 0; j <= jLast; j += 1) {
        anGam[i][j] = (anGam[i][j] - b * anGam[im][j]) * ainv[i];
      }
    }

    for (let i = iiMax - 1; i >= 0; i -= 1) {
      const ip = i + 1;
      for (let j = 0; j <= II; j += 1) {
        anGam[i][j] = anGam[i][j] - csav[i] * anGam[ip][j];
      }
    }

    anAdw[0] = 0.0;
    for (let i = 1; i <= iiMax - 1; i += 1) {
      anAdw[i] = sys[3][i] * rn ** 2 * (gam[i - 1] + anGam[i][0]);
    }
    anAdw[iiMax] = 0.0;

    for (let i = 1; i <= iiMax; i += 1) {
      const im = i - 1;
      const b = sys[0][i];
      anAdw[i] = (anAdw[i] - b * anAdw[im]) * ainv[i];
    }

    for (let i = iiMax - 1; i >= 0; i -= 1) {
      const ip = i + 1;
      anAdw[i] = anAdw[i] - csav[i] * anAdw[ip];
    }

    for (let i = 1; i <= II; i += 1) {
      for (let j = 1; j <= II; j += 1) {
        vindGam[2][i - 1][j - 1] += anGam[i][j];
      }
      vindGam[2][i - 1][i - 1] += 1.0;
      vindAdw[2][i - 1] += anAdw[i];
    }
  }

  if (!LDUCT) {
    let fsum = 0.0;
    for (let n = NN + 2; n <= 4 * NN; n += 2) {
      fsum += (NN / n) ** 2;
    }
    for (let i = 1; i <= II; i += 1) {
      for (let j = 1; j <= II; j += 1) {
        vindGam[2][i - 1][j - 1] += anGam[i][j] * fsum;
      }
      vindGam[2][i - 1][i - 1] += 1.0 * fsum;
      vindAdw[2][i - 1] += anAdw[i] * fsum;
    }
  }

  for (let i = 1; i <= II; i += 1) {
    const bfac = NBLDS / (2.0 * pi * x[i]);
    vindGam[2][i - 1][i - 1] += 0.5;
    for (let j = 1; j <= II; j += 1) {
      vindGam[2][i - 1][j - 1] *= bfac;
    }
    vindAdw[2][i - 1] *= bfac;
  }

  for (let i = 1; i <= II; i += 1) {
    let vsum = 0.0;
    for (let j = 1; j <= II; j += 1) {
      vindGam[0][i - 1][j - 1] = (vindGam[2][i - 1][j - 1] * xi[i - 1]) / ADW;
      vindGam[1][i - 1][j - 1] = 0.0;
      vsum += gam[j - 1] * vindGam[2][i - 1][j - 1];
    }
    vindAdw[0][i - 1] = (vindAdw[2][i - 1] * xi[i - 1]) / ADW - (vsum * xi[i - 1]) / ADW ** 2;
    vindAdw[1][i - 1] = 0.0;
  }

  return { VIND_GAM: vindGam, VIND_ADW: vindAdw };
}

function FILTER(Q, SMLEN, N) {
  const NMAX = 500;
  const q = ensureVector(Q, N, 'Q');
  if (N > NMAX) {
    return q;
  }

  const a = new Float64Array(NMAX);
  const b = new Float64Array(NMAX);
  const c = new Float64Array(NMAX);
  const con = SMLEN ** 2;

  a[0] = 1.0;
  c[0] = 0.0;
  for (let i = 2; i <= N - 1; i += 1) {
    b[i - 1] = -con;
    a[i - 1] = 2.0 * con + 1.0;
    c[i - 1] = -con;
  }
  a[N - 1] = 1.0;
  b[N - 1] = 0.0;

  TRISOL(a, b, c, q, N);
  return q;
}

function CSCALC(
  state,
  I,
  UTOT = 0.0,
  WA = 0.0,
  WT = 0.0,
  VT = 0.0,
  VT_ADW = 0.0,
  VA = 0.0,
  VA_ADW = 0.0,
  VD = 0.0,
  VD_ADW = 0.0,
  CI = 0.0,
  CI_ADV = 0.0,
  CI_VT = 0.0,
  SI = 0.0,
  SI_VA = 0.0,
  W = 0.0,
  W_ADV = 0.0,
  W_VT = 0.0,
  W_VA = 0.0,
  PHI = 0.0,
  P_ADV = 0.0,
  P_VT = 0.0,
  P_VA = 0.0,
) {
  const i = I - 1;

  VT = state.VIND[2][i];
  VT_ADW = state.VIND_ADW[2][i];
  VA = state.VIND[0][i];
  VA_ADW = state.VIND_ADW[0][i];

  let UDUCT = 0.0;
  let VADUCT_VA = 1.0;
  if (state.DUCT) {
    UDUCT = state.URDUCT - 1.0;
    VADUCT_VA = 2.0 * state.URDUCT;
  }

  VD = VA * (VADUCT_VA - 1.0);
  const VD_VA = VADUCT_VA - 1.0;
  VD_ADW = VD_VA * VA_ADW;

  UTOT = 1.0 + UDUCT + state.UBODY[i];
  ({ WA, WT } = UVADD(state, state.XI[i]));

  CI = state.XI[i] / state.ADV - WT - VT;
  CI_ADV = -state.XI[i] / state.ADV ** 2;
  CI_VT = -1.0;

  SI = UTOT + WA + VA + VD;
  SI_VA = 1.0 + VD_VA;

  const wsq = CI * CI + SI * SI;
  W = Math.sqrt(wsq);
  W_ADV = (CI * CI_ADV) / W;
  W_VT = (CI * CI_VT) / W;
  W_VA = (SI * SI_VA) / W;

  PHI = Math.atan2(SI, CI);
  P_ADV = (-SI * CI_ADV) / wsq;
  P_VT = (-SI * CI_VT) / wsq;
  P_VA = (CI * SI_VA) / wsq;

  return {
    UTOT,
    WA,
    WT,
    VT,
    VT_ADW,
    VA,
    VA_ADW,
    VD,
    VD_ADW,
    CI,
    CI_ADV,
    CI_VT,
    SI,
    SI_VA,
    W,
    W_ADV,
    W_VT,
    W_VA,
    PHI,
    P_ADV,
    P_VT,
    P_VA,
  };
}

function ADWCORR(state) {
  const out = new Float64Array(state.II);
  for (let i = 1; i <= state.II; i += 1) {
    const c = CSCALC(state, i);
    out[i - 1] = (state.XI[i - 1] / state.ADV) / (state.XI[i - 1] / state.ADV - c.VT);
  }
  return out;
}

function XWINIT(state) {
  let UDUCT = 0.0;
  if (state.DUCT) {
    UDUCT = state.URDUCT - 1.0;
  }

  let xm = state.XW0;
  for (let i = 1; i <= state.II; i += 1) {
    const urat = 1.0 + UDUCT + state.UBODY[i - 1];
    state.DXW[i - 1] = Math.sqrt(xm ** 2 + 2.0 * urat * state.XI[i - 1] * state.DXI[i - 1]) - xm;
    const xp = xm + state.DXW[i - 1];
    state.XW[i - 1] = 0.5 * (xp + xm);
    state.XW_ADV[i - 1] = 0.0;
    state.XW_ADW[i - 1] = 0.0;
    for (let j = 1; j <= state.II; j += 1) {
      state.XW_GAM[i - 1][j - 1] = 0.0;
    }
    state.VWAK[i - 1] = (state.VIND[2][i - 1] * state.XI[i - 1]) / state.XW[i - 1];
    state.VW_ADV[i - 1] = 0.0;
    state.VW_ADW[i - 1] = (state.VIND_ADW[2][i - 1] * state.XI[i - 1]) / state.XW[i - 1];
    for (let j = 1; j <= state.II; j += 1) {
      state.VW_GAM[i - 1][j - 1] = (state.VIND_GAM[2][i - 1][j - 1] * state.XI[i - 1]) / state.XW[i - 1];
    }
    xm = xp;
  }
  state.XWTIP = xm;
  return { XW: state.XW, DXW: state.DXW, VWAK: state.VWAK };
}

function SETXW(state) {
  let xwm = state.XW0;
  const xwmGam = new Float64Array(IX);
  let xwmAdv = 0.0;
  let xwmAdw = 0.0;
  const zGam = new Float64Array(IX);

  for (let i = 1; i <= state.II; i += 1) {
    const xdx = state.XI[i - 1] * state.DXI[i - 1];
    const c = CSCALC(state, i);

    const dxwo = Math.sqrt(xwm ** 2 + 2.0 * c.UTOT * xdx) - xwm;
    let xwo = xwm + 0.5 * dxwo;

    for (let itx = 1; itx <= 30; itx += 1) {
      const vw = (c.VT * state.XI[i - 1]) / xwo;
      const vwXwo = -vw / xwo;
      const utotw = state.URDUCT;
      const vaw = (vw * xwo) / state.ADW;
      const vawVw = xwo / state.ADW;
      const vawXwo = vw / state.ADW + vawVw * vwXwo;
      const sw = utotw + c.WA + vaw;
      const swXwo = vawXwo;
      const rez = sw * xwo * 2.0 * (xwo - xwm) - c.SI * xdx;
      const rezXwo = sw * 2.0 * (2.0 * xwo - xwm) + swXwo * xwo * 2.0 * (xwo - xwm);
      const delxwo = -rez / rezXwo;

      let rlx = 1.0;
      if (Math.abs(delxwo) > 0.2 * (xwo - xwm)) {
        rlx = (0.2 * (xwo - xwm)) / Math.abs(delxwo);
      }
      xwo = xwo + rlx * delxwo;
      if (Math.abs(delxwo) < 1.0e-6) {
        break;
      }
    }

    const finalDxwo = 2.0 * (xwo - xwm);
    const vw = (c.VT * state.XI[i - 1]) / xwo;
    const vwXwo = -vw / xwo;
    const vwVt = state.XI[i - 1] / xwo;
    const cwVw = -1.0;
    const cwXw = 1.0 / state.ADV;
    const utotw = state.URDUCT;
    const vaw = (vw * xwo) / state.ADW;
    const vawVw = xwo / state.ADW;
    const vawXwo = vw / state.ADW;
    const vawAdw = -vaw / state.ADW;
    const sw = utotw + c.WA + vaw;
    const swXwo = vawXwo + vawVw * vwXwo;
    const swVt = vawVw * vwVt;
    const swAdw = vawAdw;

    let zXwo = sw * 2.0 * (2.0 * xwo - xwm);
    const zXwm = -sw * xwo * 2.0;
    const zSw = xwo * 2.0 * (xwo - xwm);
    const zSi = -xdx;

    zXwo = zSw * swXwo + zXwo;
    const zVt = zSw * swVt;
    const zVa = zSi * c.SI_VA;
    let zAdw = zSw * swAdw;

    const zAdv = zXwm * xwmAdv;
    zAdw = zXwm * xwmAdw + zVt * c.VT_ADW + zVa * c.VA_ADW + zAdw;
    for (let j = 1; j <= state.II; j += 1) {
      zGam[j - 1] = zXwm * xwmGam[j - 1] + zVt * state.VIND_GAM[2][i - 1][j - 1] + zVa * state.VIND_GAM[0][i - 1][j - 1];
    }

    state.XW_ADV[i - 1] = -zAdv / zXwo;
    state.XW_ADW[i - 1] = -zAdw / zXwo;
    for (let j = 1; j <= state.II; j += 1) {
      state.XW_GAM[i - 1][j - 1] = -zGam[j - 1] / zXwo;
    }

    state.VWAK[i - 1] = vw;
    state.VW_ADV[i - 1] = vwXwo * state.XW_ADV[i - 1];
    state.VW_ADW[i - 1] = vwXwo * state.XW_ADW[i - 1] + vwVt * c.VT_ADW;
    for (let j = 1; j <= state.II; j += 1) {
      state.VW_GAM[i - 1][j - 1] = vwXwo * state.XW_GAM[i - 1][j - 1] + vwVt * state.VIND_GAM[2][i - 1][j - 1];
    }

    state.XW[i - 1] = xwo;
    state.DXW[i - 1] = finalDxwo;
    state.DXW_ADV[i - 1] = 2.0 * (state.XW_ADV[i - 1] - xwmAdv);
    state.DXW_ADW[i - 1] = 2.0 * (state.XW_ADW[i - 1] - xwmAdw);
    for (let j = 1; j <= state.II; j += 1) {
      state.DXW_GAM[i - 1][j - 1] = 2.0 * (state.XW_GAM[i - 1][j - 1] - xwmGam[j - 1]);
    }

    xwm = 2.0 * xwo - xwm;
    xwmAdv = 2.0 * state.XW_ADV[i - 1] - xwmAdv;
    xwmAdw = 2.0 * state.XW_ADW[i - 1] - xwmAdw;
    for (let j = 1; j <= state.II; j += 1) {
      xwmGam[j - 1] = 2.0 * state.XW_GAM[i - 1][j - 1] - xwmGam[j - 1];
    }
    void cwVw;
    void cwXw;
  }

  state.XWTIP = xwm;
  return { XW: state.XW, DXW: state.DXW, VWAK: state.VWAK };
}

function TPQ(state, ITYPE) {
  state.TINV = 0.0;
  state.PINV = 0.0;
  state.TWAK = 0.0;
  state.PWAK = 0.0;
  let vaaavg = 0.0;
  let vatavg = 0.0;
  let tmom = 0.0;
  let pmom = 0.0;
  state.TVIS = 0.0;
  state.PVIS = 0.0;
  state.TI_ADV = 0.0;
  state.PI_ADV = 0.0;
  state.TI_ADW = 0.0;
  state.PI_ADW = 0.0;
  state.TW_ADV = 0.0;
  state.PW_ADV = 0.0;
  state.TW_ADW = 0.0;
  state.PW_ADW = 0.0;
  state.TV_ADV = 0.0;
  state.PV_ADV = 0.0;
  state.TV_ADW = 0.0;
  state.PV_ADW = 0.0;
  state.TV_DBE = 0.0;
  state.PV_DBE = 0.0;
  for (let i = 0; i < state.II; i += 1) {
    state.TI_GAM[i] = 0.0;
    state.PI_GAM[i] = 0.0;
    state.TW_GAM[i] = 0.0;
    state.PW_GAM[i] = 0.0;
    state.TV_GAM[i] = 0.0;
    state.PV_GAM[i] = 0.0;
  }

  const cosr = Math.cos(state.RAKE);
  const blds = state.NBLDS;

  for (let i = 1; i <= state.II; i += 1) {
    const bdx = blds * state.DXI[i - 1];
    const xx = state.XI[i - 1] / state.ADV;
    const xxAdv = -xx / state.ADV;
    const c = CSCALC(state, i);

    let ALFA;
    let AL_GI;
    let AL_DBE;
    let AL_ADV;
    let AL_VT;
    let AL_VA;
    let CL_GI;
    let CL_DBE;
    let CL_ADV;
    let CL_VT;
    let CL_VA;
    let CH_GI;
    let CH_ADV;
    let CH_VT;
    let CH_VA;

    if (ITYPE === 1) {
      ALFA = state.BETA[i - 1] - c.PHI;
      AL_GI = 0.0;
      AL_DBE = 1.0;
      AL_ADV = -c.P_ADV;
      AL_VT = -c.P_VT;
      AL_VA = -c.P_VA;

      const rey = state.CH[i - 1] * Math.abs(c.W) * state.RHO * state.VEL * state.RAD / state.RMU;
      const aero = GETCLCDCM(state, i, ALFA, c.W, rey);
      state.CL[i - 1] = aero.CLIFT;
      state.CD[i - 1] = aero.CDRAG;
      state.CM[i - 1] = aero.CMOM;
      state.STALL[i - 1] = aero.STALLF;
      CL_GI = 0.0;
      CL_DBE = aero.CL_ALF * AL_DBE;
      CL_ADV = aero.CL_ALF * AL_ADV + aero.CL_W * c.W_ADV;
      CL_VT = aero.CL_ALF * AL_VT + aero.CL_W * c.W_VT;
      CL_VA = aero.CL_ALF * AL_VA + aero.CL_W * c.W_VA;
      CH_GI = 0.0;
      CH_ADV = 0.0;
      CH_VT = 0.0;
      CH_VA = 0.0;
    } else if (ITYPE === 2) {
      const alf = GETALF(state, i, state.CL[i - 1], c.W);
      ALFA = alf.ALF;
      AL_GI = 0.0;
      AL_DBE = 0.0;
      AL_ADV = alf.ALF_W * c.W_ADV;
      AL_VT = alf.ALF_W * c.W_VT;
      AL_VA = alf.ALF_W * c.W_VA;
      CL_GI = 0.0;
      CL_DBE = 0.0;
      CL_ADV = 0.0;
      CL_VT = 0.0;
      CL_VA = 0.0;

      const chnew = (2.0 * state.GAM[i - 1]) / (c.W * state.CL[i - 1]);
      if (chnew <= 0.0) {
        if (i === 1) {
          state.CH[i - 1] = state.CH[i];
        } else if (i === state.II) {
          state.CH[i - 1] = state.CH[i - 2];
        } else {
          state.CH[i - 1] = 0.5 * (state.CH[i - 2] + state.CH[i]);
        }
        CH_GI = 0.0;
        CH_ADV = 0.0;
        CH_VT = 0.0;
        CH_VA = 0.0;
      } else {
        state.CH[i - 1] = chnew;
        CH_GI = 2.0 / (c.W * state.CL[i - 1]);
        CH_ADV = (-state.CH[i - 1] / c.W) * c.W_ADV;
        CH_VT = (-state.CH[i - 1] / c.W) * c.W_VT;
        CH_VA = (-state.CH[i - 1] / c.W) * c.W_VA;
      }
        state.BETA[i - 1] = ALFA + c.PHI;
        state.BETA0[i - 1] = state.BETA[i - 1];
    } else {
      state.CL[i - 1] = (2.0 * state.GAM[i - 1]) / (c.W * state.CH[i - 1]);
      CL_GI = 2.0 / (c.W * state.CH[i - 1]);
      CL_DBE = 0.0;
      CL_ADV = (-state.CL[i - 1] / c.W) * c.W_ADV;
      CL_VT = (-state.CL[i - 1] / c.W) * c.W_VT;
      CL_VA = (-state.CL[i - 1] / c.W) * c.W_VA;

      const alf = GETALF(state, i, state.CL[i - 1], c.W);
      ALFA = alf.ALF;
      AL_GI = alf.ALF_CL * CL_GI;
      AL_DBE = alf.ALF_CL * CL_DBE;
      AL_ADV = alf.ALF_CL * CL_ADV + alf.ALF_W * c.W_ADV;
      AL_VT = alf.ALF_CL * CL_VT + alf.ALF_W * c.W_VT;
      AL_VA = alf.ALF_CL * CL_VA + alf.ALF_W * c.W_VA;
      CH_GI = 0.0;
      CH_ADV = 0.0;
      CH_VT = 0.0;
      CH_VA = 0.0;
      state.BETA[i - 1] = ALFA + c.PHI;
      state.BETA0[i - 1] = state.BETA[i - 1];
    }

    state.RE[i - 1] = state.CH[i - 1] * Math.abs(c.W) * state.RHO * state.VEL * state.RAD / state.RMU;
    const RE_W = state.CH[i - 1] * state.RHO * state.VEL * state.RAD / state.RMU;
    const RE_CH = Math.abs(c.W) * state.RHO * state.VEL * state.RAD / state.RMU;
    const RE_GI = RE_CH * CH_GI;
    const RE_ADV = RE_CH * CH_ADV + RE_W * c.W_ADV;
    const RE_VT = RE_CH * CH_VT + RE_W * c.W_VT;
    const RE_VA = RE_CH * CH_VA + RE_W * c.W_VA;

    const aero = GETCLCDCM(state, i, ALFA, c.W, state.RE[i - 1]);
    state.CL[i - 1] = aero.CLIFT;
    state.CD[i - 1] = aero.CDRAG;
    state.CM[i - 1] = aero.CMOM;
    state.STALL[i - 1] = aero.STALLF;
    const CD_GI = aero.CD_ALF * AL_GI + aero.CD_REY * RE_GI;
    const CD_ADV = aero.CD_ALF * AL_ADV + aero.CD_REY * RE_ADV + aero.CD_W * c.W_ADV;
    const CD_VT = aero.CD_ALF * AL_VT + aero.CD_REY * RE_VT + aero.CD_W * c.W_VT;
    const CD_VA = aero.CD_ALF * AL_VA + aero.CD_REY * RE_VA + aero.CD_W * c.W_VA;
    const CD_DBE = aero.CD_ALF * AL_DBE;

    let EFF = ((state.CL[i - 1] * c.CI - state.CD[i - 1] * c.SI) / (state.CD[i - 1] * c.CI + state.CL[i - 1] * c.SI)) / xx;
    EFF *= cosr;
    let EFFI = c.CI / (c.SI * xx);
    EFFI *= cosr;
    state.EFFP[i - 1] = EFF / EFFI;

    const HWC = 0.5 * c.W * state.CH[i - 1];
    const HWC_W = 0.5 * state.CH[i - 1];
    const HWC_CH = 0.5 * c.W;

    const COSRV = 1.0;
    const DTV = -HWC * state.CD[i - 1] * c.SI * bdx * COSRV;
    const DTV_CD = -HWC * c.SI * bdx * COSRV;
    const DTV_SI = -HWC * state.CD[i - 1] * bdx * COSRV;
    const DTV_W = -HWC_W * state.CD[i - 1] * c.SI * bdx * COSRV;
    const DTV_CH = -HWC_CH * state.CD[i - 1] * c.SI * bdx * COSRV;
    const DTV_GI = DTV_CD * CD_GI + DTV_CH * CH_GI;
    const DTV_DBE = DTV_CD * CD_DBE;
    const DTV_ADV = DTV_CD * CD_ADV + DTV_CH * CH_ADV + DTV_W * c.W_ADV;
    const DTV_VT = DTV_CD * CD_VT + DTV_CH * CH_VT + DTV_W * c.W_VT;
    const DTV_VA = DTV_CD * CD_VA + DTV_CH * CH_VA + DTV_SI * c.SI_VA + DTV_W * c.W_VA;
    state.TVIS += DTV;
    state.TV_ADV += DTV_ADV;
    // The original TPQ overwrites these two ADW sensitivities per station.
    state.TV_ADW = DTV_VT * c.VT_ADW + DTV_VA * c.VA_ADW;
    state.TV_DBE += DTV_DBE;
    state.TV_GAM[i - 1] += DTV_GI;
    for (let j = 1; j <= state.II; j += 1) {
      state.TV_GAM[j - 1] += DTV_VT * state.VIND_GAM[2][i - 1][j - 1] + DTV_VA * state.VIND_GAM[0][i - 1][j - 1];
    }

    const DPV = HWC * state.CD[i - 1] * c.CI * bdx * xx;
    const DPV_CD = HWC * c.CI * bdx * xx;
    const DPV_CI = HWC * state.CD[i - 1] * bdx * xx;
    const DPV_W = HWC_W * state.CD[i - 1] * c.CI * bdx * xx;
    const DPV_CH = HWC_CH * state.CD[i - 1] * c.CI * bdx * xx;
    const DPV_GI = DPV_CD * CD_GI + DPV_CH * CH_GI;
    const DPV_DBE = DPV_CD * CD_DBE;
    const DPV_ADV = DPV_CD * CD_ADV + DPV_CH * CH_ADV + DPV_CI * c.CI_ADV + DPV_W * c.W_ADV + HWC * state.CD[i - 1] * c.CI * bdx * xxAdv;
    const DPV_VT = DPV_CD * CD_VT + DPV_CH * CH_VT + DPV_CI * c.CI_VT + DPV_W * c.W_VT;
    const DPV_VA = DPV_CD * CD_VA + DPV_CH * CH_VA + DPV_W * c.W_VA;
    state.PVIS += DPV;
    state.PV_ADV += DPV_ADV;
    state.PV_ADW = DPV_VT * c.VT_ADW + DPV_VA * c.VA_ADW;
    state.PV_DBE += DPV_DBE;
    state.PV_GAM[i - 1] += DPV_GI;
    for (let j = 1; j <= state.II; j += 1) {
      state.PV_GAM[j - 1] += DPV_VT * state.VIND_GAM[2][i - 1][j - 1] + DPV_VA * state.VIND_GAM[0][i - 1][j - 1];
    }

    const COSRI = 1.0;
    const DTI = state.GAM[i - 1] * c.CI * bdx * COSRI;
    const DTI_CI = state.GAM[i - 1] * bdx * COSRI;
    const DTI_GI = c.CI * bdx * COSRI;
    const DTI_VT = DTI_CI * c.CI_VT;
    const DTI_ADV = DTI_CI * c.CI_ADV;
    const DTI_ADW = DTI_VT * c.VT_ADW;
    state.TINV += DTI;
    state.TI_ADV += DTI_ADV;
    state.TI_ADW += DTI_ADW;
    state.TI_GAM[i - 1] += DTI_GI;
    for (let j = 1; j <= state.II; j += 1) {
      state.TI_GAM[j - 1] += DTI_VT * state.VIND_GAM[2][i - 1][j - 1];
    }

    const DPI = state.GAM[i - 1] * c.SI * bdx * xx;
    const DPI_SI = state.GAM[i - 1] * bdx * xx;
    const DPI_GI = c.SI * bdx * xx;
    const DPI_XX = state.GAM[i - 1] * c.SI * bdx;
    const DPI_VA = DPI_SI * c.SI_VA;
    const DPI_ADV = DPI_XX * xxAdv;
    const DPI_ADW = DPI_VA * c.VA_ADW;
    state.PINV += DPI;
    state.PI_ADV += DPI_ADV;
    state.PI_ADW += DPI_ADW;
    state.PI_GAM[i - 1] += DPI_GI;
    for (let j = 1; j <= state.II; j += 1) {
      state.PI_GAM[j - 1] += DPI_VA * state.VIND_GAM[0][i - 1][j - 1];
    }

    const VW = state.VWAK[i - 1];
    const UTOTW = state.URDUCT;
    const { WA } = UVADD(state, state.XI[i - 1]);
    const CW = state.XW[i - 1] / state.ADV - state.VWAK[i - 1] - UVADD(state, state.XI[i - 1]).WT;
    const CW_ADV = -state.XW[i - 1] / state.ADV ** 2;
    const CW_VW = -1.0;
    const SW = UTOTW + WA + (VW * state.XW[i - 1]) / state.ADW;
    const SW_ADW = -(VW * state.XW[i - 1]) / state.ADW ** 2;
    const SW_VW = state.XW[i - 1] / state.ADW;
    const DTW = state.GAM[i - 1] * CW * state.NBLDS * state.DXW[i - 1];
    const DTW_GI = CW * state.NBLDS * state.DXW[i - 1];
    const DTW_CW = state.GAM[i - 1] * state.NBLDS * state.DXW[i - 1];
    const DTW_DXW = state.GAM[i - 1] * CW * state.NBLDS;
    const DTW_VW = DTW_CW * CW_VW;
    const DTW_ADV = DTW_CW * CW_ADV + DTW_VW * state.VW_ADV[i - 1] + DTW_DXW * state.DXW_ADV[i - 1];
    const DTW_ADW = DTW_VW * state.VW_ADW[i - 1] + DTW_DXW * state.DXW_ADW[i - 1];
    state.TWAK += DTW;
    state.TW_ADV += DTW_ADV;
    state.TW_ADW += DTW_ADW;
    state.TW_GAM[i - 1] += DTW_GI;
    for (let j = 1; j <= state.II; j += 1) {
      state.TW_GAM[j - 1] += DTW_VW * state.VW_GAM[i - 1][j - 1] + DTW_DXW * state.DXW_GAM[i - 1][j - 1];
    }

    const DPW = state.GAM[i - 1] * c.SI * bdx * state.XI[i - 1] / state.ADV;
    const DPW_SI = state.GAM[i - 1] * bdx * state.XI[i - 1] / state.ADV;
    const DPW_GI = c.SI * bdx * state.XI[i - 1] / state.ADV;
    const DPW_ADV = -DPW / state.ADV;
    const DPW_VA = DPW_SI * c.SI_VA;
    const DPW_ADW = DPW_VA * c.VA_ADW;
    state.PWAK += DPW;
    state.PW_ADV += DPW_ADV;
    state.PW_ADW += DPW_ADW;
    state.PW_GAM[i - 1] += DPW_GI;
    for (let j = 1; j <= state.II; j += 1) {
      state.PW_GAM[j - 1] += DPW_VA * state.VIND_GAM[0][i - 1][j - 1];
    }

    const VTGM = (state.GAM[i - 1] * state.NBLDS) / (4.0 * PI * state.XI[i - 1]);
    const VAGM = (VTGM * state.XI[i - 1]) / state.ADW;
    void VAGM;
    const DTM = 2.0 * PI * state.XI[i - 1] * state.DXI[i - 1] * c.SI * (2.0 * c.VA);
    tmom += DTM;
    const DPM = DTM * (c.SI - c.VD);
    pmom += DPM;

    vatavg += DTW * (c.VA + c.VD);
    vaaavg += 2.0 * PI * state.XI[i - 1] * state.DXI[i - 1] * (c.VA + c.VD);

    state.DTII[i - 1] = DTI / bdx;
    state.DPII[i - 1] = DPI / bdx;
    state.DTWI[i - 1] = DTW / bdx;
    state.DPWI[i - 1] = DPW / bdx;
    state.DTVI[i - 1] = DTV / bdx;
    state.DPVI[i - 1] = DPV / bdx;
    void VTGM;
    void SW;
    void SW_ADW;
    void SW_VW;
  }

  state.TTOT = state.TWAK + state.TVIS;
  state.PTOT = state.PWAK + state.PVIS;
  state.QTOT = state.PTOT * state.ADV;

  const adisk = PI * (1.0 - state.XI0 ** 2);
  vaaavg /= adisk;
  vatavg /= state.TWAK;
  const tdim = state.TWAK * state.RHO * state.VEL ** 2 * state.RAD ** 2;
  const pdim = state.PWAK * state.RHO * state.VEL ** 3 * state.RAD ** 2;
  void vaaavg;
  void vatavg;
  void tmom;
  void pmom;
  void tdim;
  void pdim;

  return {
    TINV: state.TINV,
    PINV: state.PINV,
    TWAK: state.TWAK,
    PWAK: state.PWAK,
    TVIS: state.TVIS,
    PVIS: state.PVIS,
    TTOT: state.TTOT,
    PTOT: state.PTOT,
    QTOT: state.QTOT,
  };
}

function APINIT(state) {
  const NITERG = 10;
  const blds = state.NBLDS;
  state.DBETA = 0.0;

  let UDUCT = 0.0;
  let VADUCT_VA = 1.0;
  if (state.DUCT) {
    UDUCT = state.URDUCT - 1.0;
    VADUCT_VA = 2.0 * state.URDUCT;
  }
  state.ADW = state.ADV * (1.0 + UDUCT);

  let tsum = 0.0;
  for (let i = 1; i <= state.II; i += 1) {
    const UTOT = state.URDUCT + state.UBODY[i - 1];
    const { WA, WT } = UVADD(state, state.XI[i - 1]);
    const SI = UTOT + WA;
    const CI = state.XI[i - 1] / state.ADV - WT;
    const wsq = CI * CI + SI * SI;
    const W = Math.sqrt(wsq);
    const PHI = Math.atan2(SI, CI);
    const ALFA = state.BETA[i - 1] - PHI;
    const REY = state.CH[i - 1] * Math.abs(W) * state.RHO * state.VEL * state.RAD / state.RMU;
    const aero = GETCLCDCM(state, i, ALFA, W, REY);
    state.CL[i - 1] = aero.CLIFT;
    state.CD[i - 1] = aero.CDRAG;
    state.CM[i - 1] = aero.CMOM;
    state.STALL[i - 1] = aero.STALLF;
    state.GAM[i - 1] = 0.5 * state.CL[i - 1] * W * state.CH[i - 1];
    tsum += blds * state.GAM[i - 1] * CI * state.DXI[i - 1];
  }

  let vhsq = 0.5 * tsum / PI;
  vhsq = Math.max(vhsq, -0.25);
  state.ADW = state.ADV * 0.5 * (1.0 + Math.sqrt(1.0 + 4.0 * vhsq));

  GRADMO(IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
  VCALC(state);

  for (let iterg = 1; iterg <= NITERG; iterg += 1) {
    GRADMO(IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
    tsum = 0.0;
    let tAdw = 0.0;
    let dclmax = 0.0;
    let rlxmin = 1.0;

    for (let i = 1; i <= state.II; i += 1) {
      const VT = state.VIND_GAM[2][i - 1][i - 1] * state.GAM[i - 1];
      const VT_GAM = state.VIND_GAM[2][i - 1][i - 1];
      const VT_ADW = state.VIND_ADW[2][i - 1];
      const VA = state.VIND_GAM[0][i - 1][i - 1] * state.GAM[i - 1];
      const VA_GAM = state.VIND_GAM[0][i - 1][i - 1];
      const VA_ADW = state.VIND_ADW[0][i - 1];

      UDUCT = 0.0;
      VADUCT_VA = 1.0;
      if (state.DUCT) {
        UDUCT = state.URDUCT - 1.0;
        VADUCT_VA = 2.0 * state.URDUCT;
      }

      const UTOT = 1.0 + UDUCT + state.UBODY[i - 1];
      const { WA, WT } = UVADD(state, state.XI[i - 1]);
      const CI = state.XI[i - 1] / state.ADV - WT - VT;
      const CI_ADV = -state.XI[i - 1] / state.ADV ** 2;
      const CI_VT = -1.0;
      const SI = UTOT + WA + VA * VADUCT_VA;
      const SI_VA = VADUCT_VA;
      const wsq = CI * CI + SI * SI;
      const W = Math.sqrt(wsq);
      const W_ADV = (CI * CI_ADV) / W;
      const W_VT = (CI * CI_VT) / W;
      const W_VA = (SI * SI_VA) / W;
      const PHI = Math.atan2(SI, CI);
      const P_VT = (-SI * CI_VT) / wsq;
      const P_VA = (CI * SI_VA) / wsq;
      const ALFA = state.BETA[i - 1] - PHI;
      const AL_VT = -P_VT;
      const AL_VA = -P_VA;

      const REY = state.CH[i - 1] * Math.abs(W) * state.RHO * state.VEL * state.RAD / state.RMU;
      const aero = GETCLCDCM(state, i, ALFA, W, REY);
      state.CL[i - 1] = aero.CLIFT;
      state.CD[i - 1] = aero.CDRAG;
      state.CM[i - 1] = aero.CMOM;
      state.STALL[i - 1] = aero.STALLF;

      const REZ = state.CH[i - 1] * state.CL[i - 1] * W - 2.0 * state.GAM[i - 1];
      const Z_CL = state.CH[i - 1] * W;
      let Z_W = state.CH[i - 1] * state.CL[i - 1];
      let Z_G = -2.0;
      const Z_AL = Z_CL * aero.CL_ALF;
      Z_W = Z_CL * aero.CL_W + Z_W;
      const Z_VT = Z_W * W_VT + Z_AL * AL_VT;
      const Z_VA = Z_W * W_VA + Z_AL * AL_VA;
      const Z_ADW = Z_VT * VT_ADW + Z_VA * VA_ADW;
      Z_G = Z_VT * VT_GAM + Z_VA * VA_GAM + Z_G;

      const DELG = -REZ / Z_G;
      const DCL = (2.0 * DELG) / (state.CH[i - 1] * W);
      let RLX = 1.0;
      if (RLX * Math.abs(DCL) > 0.2 && DCL !== 0.0) {
        RLX = Math.min(RLX, 0.2 / Math.abs(DCL));
      }
      if (Math.abs(DCL) > Math.abs(dclmax)) {
        dclmax = DCL;
      }
      if (Math.abs(RLX) < rlxmin) {
        rlxmin = RLX;
      }

      state.GAM[i - 1] += RLX * DELG;
      const G_ADW = -Z_ADW / Z_G;
      const COSR = 1.0;
      tsum += blds * state.GAM[i - 1] * CI * state.DXI[i - 1] * COSR;
      const T_G = blds * CI * state.DXI[i - 1] * COSR;
      const T_VT = blds * state.GAM[i - 1] * CI_VT * state.DXI[i - 1] * COSR;
      tAdw += (T_G + T_VT * VT_GAM) * G_ADW + T_VT * VT_ADW;
      void W_ADV;
    }

    vhsq = 0.5 * tsum / PI;
    vhsq = Math.max(vhsq, -0.2499);
    const vhsqT = 0.5 / PI;
    const REZ = state.ADW - state.ADV * 0.5 * (1.0 + Math.sqrt(1.0 + 4.0 * vhsq));
    const Z_ADW = 1.0 - (state.ADV / Math.sqrt(1.0 + 4.0 * vhsq)) * vhsqT * tAdw;
    let DADW = -REZ / Z_ADW;
    DADW = Math.min(DADW, 10.0 * state.ADW);
    DADW = Math.max(DADW, -0.9 * state.ADW);
    state.ADW += DADW;

    if (rlxmin < 0.2) {
      FILTER(state.GAM, 0.2 * state.II, state.II);
    }
    if (Math.abs(dclmax) < 0.001) {
      break;
    }
  }

  return { ADW: state.ADW, GAM: state.GAM };
}

function APITER(state, ISPEC, ICON) {
  const EPS = 1.0e-7;
  const clmax = new Float64Array(IX);
  const clmin = new Float64Array(IX);
  const dclstall = new Float64Array(IX);
  const history = [];
  const k1 = state.II;
  const k2 = state.II + 1;
  const k3 = state.II + 2;
  const q = Array.from({ length: IQ }, () => new Float64Array(IQ));
  const rhs = Array.from({ length: IQ }, () => new Float64Array(1));

  for (let iter = 1; iter <= Math.max(state.NITERA, 1); iter += 1) {
    if (state.FREE || iter === 1) {
      if (state.FAST) {
        GRADMO(IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
        state.IWTYP = 1;
      } else if (!state.VRTX) {
        HELICO(IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
        state.IWTYP = 2;
      } else {
        VRTXCO(IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
        state.IWTYP = 3;
      }
    }

    VCALC(state);
    SETXW(state);
    TPQ(state, 1);

    state.GRESMX = 0.0;
    state.FRESMX = 0.0;
    state.ARESMX = 0.0;
    for (let i = 0; i < IQ; i += 1) {
      rhs[i][0] = 0.0;
      q[i].fill(0.0);
    }

    let i75 = state.II;
    for (let i = 1; i <= state.II; i += 1) {
      if (state.XI[i - 1] > 0.75) {
        i75 = i;
        break;
      }
    }
    const c75 = CSCALC(state, i75);
    let ADVFACT = 1.0 / (1.0 - (state.ADV * c75.VT) / state.XI[i75 - 1]);
    ADVFACT = 1.0;

    if (state.FREE) {
      rhs[k2][0] = state.ADWFCTR * state.ADW * state.TWAK / state.PWAK - state.ADV * ADVFACT;
      const zTw = state.ADWFCTR * state.ADW / state.PWAK;
      const zPw = (-state.ADWFCTR * state.ADW * state.TWAK) / state.PWAK ** 2;
      for (let j = 1; j <= state.II; j += 1) {
        q[k2][j - 1] = zTw * state.TW_GAM[j - 1] + zPw * state.PW_GAM[j - 1];
      }
      q[k2][k1] = zTw * state.TW_ADV + zPw * state.PW_ADV - ADVFACT;
      q[k2][k2] = zTw * state.TW_ADW + zPw * state.PW_ADW + state.ADWFCTR * state.TWAK / state.PWAK;
      state.ARESMX = Math.max(state.ARESMX, Math.abs(rhs[k2][0] / state.ADV));
    } else {
      rhs[k2][0] = 0.0;
      q[k2][k2] = 1.0;
    }

    for (let i = 1; i <= state.II; i += 1) {
      const c = CSCALC(state, i);
      const ALFA = state.BETA[i - 1] - c.PHI;
      const rey = state.CH[i - 1] * Math.abs(c.W) * state.RHO * state.VEL * state.RAD / state.RMU;
      const aero = GETCLCDCM(state, i, ALFA, c.W, rey);
      state.CL[i - 1] = aero.CLIFT;
      state.CD[i - 1] = aero.CDRAG;
      state.CM[i - 1] = aero.CMOM;
      state.STALL[i - 1] = aero.STALLF;
      clmax[i - 1] = aero.CLMAX;
      clmin[i - 1] = aero.CLMIN;
      dclstall[i - 1] = aero.DCL_STALL;

      rhs[i - 1][0] = state.CH[i - 1] * state.CL[i - 1] * c.W - 2.0 * state.GAM[i - 1];
      const zCl = state.CH[i - 1] * c.W;
      const zW0 = state.CH[i - 1] * state.CL[i - 1];
      const zGi = -2.0;
      const zVt = zCl * (aero.CL_ALF * (-c.P_VT) + aero.CL_W * c.W_VT) + zW0 * c.W_VT;
      const zVa = zCl * (aero.CL_ALF * (-c.P_VA) + aero.CL_W * c.W_VA) + zW0 * c.W_VA;
      const zAdv = zCl * (aero.CL_ALF * (-c.P_ADV) + aero.CL_W * c.W_ADV) + zW0 * c.W_ADV;
      const zDbe = zCl * aero.CL_ALF;

      for (let j = 1; j <= state.II; j += 1) {
        q[i - 1][j - 1] = zVt * state.VIND_GAM[2][i - 1][j - 1] + zVa * state.VIND_GAM[0][i - 1][j - 1];
      }
      q[i - 1][i - 1] += zGi;
      q[i - 1][k1] = zAdv;
      q[i - 1][k2] = zVt * c.VT_ADW + zVa * c.VA_ADW;
      q[i - 1][k3] = zDbe;
      state.GRESMX = Math.max(state.GRESMX, Math.abs(rhs[i - 1][0] / (0.1 * c.W)));
    }

    if (ISPEC === 1) {
      const tSpec = state.TSPEC / (state.RHO * state.VEL ** 2 * state.RAD ** 2);
      rhs[k1][0] = state.TWAK + state.TVIS - tSpec;
      for (let j = 1; j <= state.II; j += 1) {
        q[k1][j - 1] = state.TW_GAM[j - 1] + state.TV_GAM[j - 1];
      }
      q[k1][k1] = state.TW_ADV + state.TV_ADV;
      q[k1][k2] = state.TW_ADW + state.TV_ADW;
      q[k1][k3] = state.TV_DBE;
      state.FRESMX = Math.max(state.FRESMX, Math.abs(rhs[k1][0]));
    } else if (ISPEC === 2) {
      const qSpec = state.QSPEC / (state.RHO * state.VEL ** 2 * state.RAD ** 3);
      rhs[k1][0] = (state.PWAK + state.PVIS) * state.ADV - qSpec;
      for (let j = 1; j <= state.II; j += 1) {
        q[k1][j - 1] = (state.PW_GAM[j - 1] + state.PV_GAM[j - 1]) * state.ADV;
      }
      q[k1][k1] = (state.PW_ADV + state.PV_ADV) * state.ADV + state.PWAK + state.PVIS;
      q[k1][k2] = (state.PW_ADW + state.PV_ADW) * state.ADV;
      q[k1][k3] = state.PV_DBE * state.ADV;
      state.FRESMX = Math.max(state.FRESMX, Math.abs(rhs[k1][0]));
    } else if (ISPEC === 3) {
      const pSpec = state.PSPEC / (state.RHO * state.VEL ** 3 * state.RAD ** 2);
      rhs[k1][0] = state.PWAK + state.PVIS - pSpec;
      for (let j = 1; j <= state.II; j += 1) {
        q[k1][j - 1] = state.PW_GAM[j - 1] + state.PV_GAM[j - 1];
      }
      q[k1][k1] = state.PW_ADV + state.PV_ADV;
      q[k1][k2] = state.PW_ADW + state.PV_ADW;
      q[k1][k3] = state.PV_DBE;
      state.FRESMX = Math.max(state.FRESMX, Math.abs(rhs[k1][0]));
    } else if (ISPEC === 4) {
      rhs[k1][0] = 0.0;
      q[k1][k1] = 1.0;
    } else if (ISPEC === 5) {
      let pSpec = state.PSPEC / (state.RHO * state.VEL ** 3 * state.RAD ** 2);
      let pSpecAdv = 0.0;
      if (state.LPWRVAR) {
        const rpm = state.VEL / (state.RAD * state.ADV * PI / 30.0);
        const rpmAdv = -rpm / state.ADV;
        state.PSPEC = SEVAL(rpm, state.PWRVAR, state.XPWRVAR, state.RPMVAR, state.NPWRVAR);
        const pSpecRpm = DEVAL(rpm, state.PWRVAR, state.XPWRVAR, state.RPMVAR, state.NPWRVAR);
        pSpecAdv = pSpecRpm * rpmAdv / (state.RHO * state.VEL ** 3 * state.RAD ** 2);
        pSpec = state.PSPEC / (state.RHO * state.VEL ** 3 * state.RAD ** 2);
      }
      rhs[k1][0] = state.PWAK + state.PVIS - pSpec;
      for (let j = 1; j <= state.II; j += 1) {
        q[k1][j - 1] = state.PW_GAM[j - 1] + state.PV_GAM[j - 1];
      }
      q[k1][k1] = state.PW_ADV + state.PV_ADV - pSpecAdv;
      q[k1][k2] = state.PW_ADW + state.PV_ADW;
      q[k1][k3] = state.PV_DBE;
      state.FRESMX = Math.max(state.FRESMX, Math.abs(rhs[k1][0]));
    }

    rhs[k3][0] = 0.0;
    if (ICON === 1) {
      q[k3][k1] = 1.0;
    }
    if (ICON === 2) {
      q[k3][k3] = 1.0;
    }

    GAUSS(IQ, k3 + 1, q, rhs, 1);

    state.RLX = 1.0;
    if (iter <= 2) {
      state.RLX = 0.2;
    }

    for (let i = 1; i <= state.II; i += 1) {
      state.DGAM[i - 1] = -rhs[i - 1][0];
      const c = CSCALC(state, i);
      const DCL = (2.0 * state.DGAM[i - 1]) / (state.CH[i - 1] * c.W);
      const DCLMIN = Math.max(1.5 * dclstall[i - 1], Math.abs(state.CL[i - 1] - clmin[i - 1]));
      const DCLMAX = Math.max(1.5 * dclstall[i - 1], Math.abs(clmax[i - 1] - state.CL[i - 1]));
      let DCLLIM = Math.min(0.5, DCLMIN, DCLMAX);
      DCLLIM = Math.max(DCLLIM, 0.01);
      if (state.RLX * Math.abs(DCL) > DCLLIM) {
        state.RLX = Math.min(state.RLX, DCLLIM / Math.abs(DCL));
      }
      if (state.DGAM[i - 1] * state.DGAMOLD[i - 1] < 0.0 && Math.abs(state.DGAM[i - 1]) > 0.2 * Math.abs(state.DGAMOLD[i - 1])) {
        state.RLX = Math.min(state.RLX, 0.2);
      }
    }

    state.DADV = -rhs[k1][0];
    state.DADW = -rhs[k2][0];
    state.DBET = -rhs[k3][0];
    if (state.NITERA === 0) {
      state.RLX = 0.0;
    }
    if (state.RLX * state.DBET > 0.05) {
      state.RLX = Math.min(state.RLX, 0.05 / state.DBET);
    }
    if (state.RLX * state.DBET < -0.05) {
      state.RLX = Math.min(state.RLX, -0.05 / state.DBET);
    }
    if (state.RLX * state.DADV > 0.5 * state.ADV) {
      state.RLX = Math.min(state.RLX, 0.5 * state.ADV / state.DADV);
    }
    if (state.RLX * state.DADV < -0.3 * state.ADV) {
      state.RLX = Math.min(state.RLX, (-0.3 * state.ADV) / state.DADV);
    }
    if (state.RLX * state.DADW > 0.5 * state.ADW) {
      state.RLX = Math.min(state.RLX, 0.5 * state.ADW / state.DADW);
    }
    if (state.RLX * state.DADW < -0.3 * state.ADW) {
      state.RLX = Math.min(state.RLX, (-0.3 * state.ADW) / state.DADW);
    }

    let sumsq = 0.0;
    let gmx = 0.0;
    let imx = 1;
    for (let i = 1; i <= state.II; i += 1) {
      state.GAM[i - 1] += state.RLX * state.DGAM[i - 1];
      state.BETA[i - 1] += state.RLX * state.DBET;
      state.BETA0[i - 1] += state.RLX * state.DBET;
      sumsq += state.DGAM[i - 1] ** 2 / (1.0 + 1.0 / state.ADV ** 2);
      if (Math.abs(state.DGAM[i - 1]) >= Math.abs(gmx)) {
        gmx = state.DGAM[i - 1];
        imx = i;
      }
      state.DGAMOLD[i - 1] = state.DGAM[i - 1];
    }

    state.DBETA += state.RLX * state.DBET;
    state.ADV += state.RLX * state.DADV;
    state.ADW += state.RLX * state.DADW;
    state.RMS = Math.sqrt(sumsq / state.II);
    history.push({
      ITER: iter,
      GMAX: gmx,
      IMAX: imx,
      RMS: state.RMS,
      ADV: state.ADV,
      ADW: state.ADW,
      BETA_TIP_DEG: (state.BETA[state.II - 1] * 180.0) / PI,
      RLX: state.RLX,
    });

    if (state.RLX < 0.2) {
      FILTER(state.GAM, 0.2 * state.II, state.II);
    }

    if (state.RMS <= EPS) {
      if (state.FREE) {
        if (state.FAST) {
          GRADMO(IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
          state.IWTYP = 1;
        } else if (!state.VRTX) {
          HELICO(IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
          state.IWTYP = 2;
        } else {
          VRTXCO(IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
          state.IWTYP = 3;
        }
      }
      VCALC(state);
      TPQ(state, 1);
      state.CONV = true;
      return { converged: true, history };
    }
  }

  state.CONV = false;
  return { converged: false, history };
}

function APER(state, ISPEC, ICON, LINIT) {
  if (LINIT) {
    APINIT(state);
  }
  const result = APITER(state, ISPEC, ICON);
  return {
    converged: state.CONV,
    GRESMX: state.GRESMX,
    FRESMX: state.FRESMX,
    ARESMX: state.ARESMX,
    history: result.history,
  };
}

function loadPowerLine(state, options = {}) {
  const result = GETPVAR(0, IX, 0, state.RPMVAR, state.PWRVAR, options);
  if (result.error) {
    throw new Error(result.error);
  }
  state.NPWRVAR = result.N;
  SPLINA(state.PWRVAR, state.XPWRVAR, state.RPMVAR, state.NPWRVAR);
  state.LPWRVAR = true;
  return { NPWRVAR: state.NPWRVAR, RPMVAR: state.RPMVAR, PWRVAR: state.PWRVAR };
}

function OPER(state, action = {}, hooks = {}) {
  const command = String(action.command ?? '').toUpperCase();
  if (command === 'FORM') {
    const mode = String(action.mode ?? '').toUpperCase();
    if (mode === 'GRAD') {
      state.VRTX = false;
      state.FAST = true;
    } else if (mode === 'POT') {
      state.VRTX = false;
      state.FAST = false;
    } else if (mode === 'VRTX') {
      state.VRTX = true;
    } else if (mode === 'WAKE') {
      state.FREE = !state.FREE;
    }
    return { VRTX: state.VRTX, FAST: state.FAST, FREE: state.FREE };
  }
  if (command === 'TERS') {
    state.TERSE = !state.TERSE;
    return { TERSE: state.TERSE };
  }
  if (command === 'DISP' || command === 'WRIT') {
    return hooks.output ? hooks.output(state) : {
      NAME: state.NAME,
      ADV: state.ADV,
      ADW: state.ADW,
      TTOT: state.TTOT,
      PTOT: state.PTOT,
      QTOT: state.QTOT,
      CONV: state.CONV,
    };
  }
  if (command === 'NAME') {
    state.NAME = makeString(action.value, state.NAME);
    return { NAME: state.NAME };
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
    assert(state.DUCT, 'OPER: select duct option first');
    state.URDUCT = action.value ?? state.URDUCT;
    return { URDUCT: state.URDUCT };
  }
  if (command === 'VELO') {
    const velOld = state.VEL;
    state.VEL = action.value ?? state.VEL;
    const thr = state.TTOT * (state.RHO * velOld ** 2 * state.RAD ** 2);
    state.TTOT = thr / (state.RHO * state.VEL ** 2 * state.RAD ** 2);
    const trq = state.QTOT * (state.RHO * velOld ** 2 * state.RAD ** 3);
    state.QTOT = trq / (state.RHO * state.VEL ** 2 * state.RAD ** 3);
    const pwr = state.PTOT * (state.RHO * velOld ** 3 * state.RAD ** 2);
    state.PTOT = pwr / (state.RHO * state.VEL ** 3 * state.RAD ** 2);
    state.CONV = false;
    return { VEL: state.VEL, TTOT: state.TTOT, PTOT: state.PTOT, QTOT: state.QTOT };
  }
  if (command === 'ANGL') {
    const delb = action.value ?? 0.0;
    for (let i = 0; i < state.II; i += 1) {
      state.BETA[i] += (delb * PI) / 180.0;
      state.BETA0[i] += (delb * PI) / 180.0;
    }
    state.CONV = false;
    return { BETA_TIP_DEG: (state.BETA[state.II - 1] * 180.0) / PI };
  }
  if (command === 'ADVA') {
    state.ADV = action.value ?? state.ADV;
    state.CONV = false;
    return APER(state, 4, 2, state.LOPRINI);
  }
  if (command === 'RPM') {
    const rpm = action.value ?? state.VEL / (state.RAD * state.ADV * PI / 30.0);
    state.ADV = state.VEL / (state.RAD * rpm * PI / 30.0);
    state.CONV = false;
    return APER(state, 4, 2, state.LOPRINI);
  }
  if (command === 'THRU') {
    state.TSPEC = action.value ?? state.TTOT * (state.RHO * state.VEL ** 2 * state.RAD ** 2);
    state.CONV = false;
    if (String(action.fix ?? 'P').toUpperCase() === 'R') {
      const rpm = action.rpm;
      assert(rpm !== undefined, 'OPER: rpm required for fixed-rpm thrust solve');
      state.ADV = state.VEL / (state.RAD * rpm * PI / 30.0);
      return APER(state, 1, 1, state.LOPRINI);
    }
    return APER(state, 1, 2, state.LOPRINI);
  }
  if (command === 'TORQ') {
    state.QSPEC = action.value ?? state.QTOT * (state.RHO * state.VEL ** 2 * state.RAD ** 3);
    state.CONV = false;
    if (String(action.fix ?? 'P').toUpperCase() === 'R') {
      const rpm = action.rpm;
      assert(rpm !== undefined, 'OPER: rpm required for fixed-rpm torque solve');
      state.ADV = state.VEL / (state.RAD * rpm * PI / 30.0);
      return APER(state, 2, 1, state.LOPRINI);
    }
    return APER(state, 2, 2, state.LOPRINI);
  }
  if (command === 'POWE') {
    state.PSPEC = action.value ?? state.PTOT * (state.RHO * state.VEL ** 3 * state.RAD ** 2);
    state.CONV = false;
    if (String(action.fix ?? 'P').toUpperCase() === 'R') {
      const rpm = action.rpm;
      assert(rpm !== undefined, 'OPER: rpm required for fixed-rpm power solve');
      state.ADV = state.VEL / (state.RAD * rpm * PI / 30.0);
      return APER(state, 3, 1, state.LOPRINI);
    }
    return APER(state, 3, 2, state.LOPRINI);
  }
  if (command === 'PVAR') {
    const result = loadPowerLine(state, action);
    if (action.run) {
      return APER(state, 5, String(action.fix ?? 'P').toUpperCase() === 'R' ? 1 : 2, state.LOPRINI);
    }
    return result;
  }
  if (command === 'ASEQ') {
    return SETCAS(state, 1, action.NINPUT ?? 0, action.RINPUT ?? [], action);
  }
  if (command === 'RSEQ') {
    return SETCAS(state, 2, action.NINPUT ?? 0, action.RINPUT ?? [], action);
  }
  if (command === 'BSEQ') {
    return SETCAS(state, 3, action.NINPUT ?? 0, action.RINPUT ?? [], action);
  }
  if (command === 'VSEQ') {
    return SETCAS(state, 4, action.NINPUT ?? 0, action.RINPUT ?? [], action);
  }
  if (command === 'CLRC') {
    state.NCASE = 0;
    state.KCASE = 0;
    return { NCASE: 0, KCASE: 0 };
  }
  if (command === 'ADDC') {
    assert(state.NCASE < ICASX, 'OPER: case arrays too small. Increase ICASX.');
    const index = state.NCASE;
    state.CASPAR[1][index] = state.ADV;
    state.CASPAR[2][index] = state.VEL;
    state.CASPAR[3][index] = state.BETA[state.II - 1];
    state.CASPAR[4][index] = state.ALT;
    state.CASPAR[5][index] = state.RHO;
    state.CASPAR[6][index] = state.RMU;
    state.CASPAR[7][index] = state.VSO;
    state.CASPAR[8][index] = 999.0;
    state.CASPAR[9][index] = 999.0;
    state.CASPAR[10][index] = 999.0;
    state.CASPAR[11][index] = 999.0;
    state.NCASE += 1;
    return { NCASE: state.NCASE };
  }
  if (command === 'CGET') {
    const result = GETCAS(0, NPARX, 0, state.CASPAR, action);
    if (result.error) {
      throw new Error(result.error);
    }
    state.NCASE = result.NCAS;
    return result;
  }
  if (command === 'CPUT') {
    return SHOCAS(0, NPARX, state.NCASE, state.CASPAR, state.RAD, state.NAME);
  }
  if (command === 'CASE') {
    const icase = (action.index ?? 0) - 1;
    assert(icase >= 0 && icase < state.NCASE, 'OPER: case index out of bounds');
    state.ADV = state.CASPAR[1][icase];
    state.VEL = state.CASPAR[2][icase];
    const bet = state.CASPAR[3][icase];
    const delb = bet - state.BETA[state.II - 1];
    for (let i = 0; i < state.II; i += 1) {
      state.BETA[i] += delb;
      state.BETA0[i] += delb;
    }
    state.ALT = state.CASPAR[4][icase];
    state.RHO = state.CASPAR[5][icase];
    state.RMU = state.CASPAR[6][icase];
    state.VSO = state.CASPAR[7][icase];
    state.CONV = false;
    const result = APER(state, 4, 2, true);
    if (state.CONV) {
      state.CASPAR[8][icase] = state.PTOT * state.RHO * state.VEL ** 3 * state.RAD ** 2;
      state.CASPAR[9][icase] = state.TTOT * state.RHO * state.VEL ** 2 * state.RAD ** 2;
      state.CASPAR[10][icase] = state.QTOT * state.RHO * state.VEL ** 2 * state.RAD ** 3;
      state.CASPAR[11][icase] = state.TTOT / state.PTOT;
    }
    return result;
  }
  if (command === 'INIT') {
    state.LOPRINI = !state.LOPRINI;
    return { LOPRINI: state.LOPRINI };
  }
  if (command === 'ITER') {
    state.NITERA = Math.trunc(action.value ?? state.NITERA);
    return { NITERA: state.NITERA };
  }
  if (command === 'ADW') {
    state.ADWFCTR = action.value ?? state.ADWFCTR;
    return { ADWFCTR: state.ADWFCTR };
  }
  if (command === 'HELP' || command === 'ANNO' || command === 'HARD' || command === 'SIZE' || command === 'PLOT' || command === 'LIST' || command === 'ATMO' || command === 'REIN' || command === 'N') {
    return { command, value: action.value ?? null };
  }
  throw new Error(`OPER: unsupported command ${command}`);
}

module.exports = {
  IX,
  IXP,
  NAX,
  NDX,
  IQ,
  PI,
  createState,
  UVADD,
  GETPVAR,
  SHOCAS,
  GETCAS,
  SETCAS,
  APER,
  APINIT,
  APITER,
  ADWCORR,
  CSCALC,
  XWINIT,
  SETXW,
  TPQ,
  VCALC,
  GRADMO,
  HELICO,
  FILTER,
  OPER,
};
