'use strict';

const fs = require('node:fs');

const xoper = require('./xoper.js');
const xaero = require('./xaero.js');
const { SPLINE, SEVAL } = require('./spline.js');

const IX = xoper.IX;
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

function getXrotor() {
  return require('./xrotor.js');
}

function scalar(value) {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return Number(value).toPrecision(17);
}

function formatLogical(value) {
  return value ? 'T' : 'F';
}

function formatLine(values) {
  return values.map((value) => (typeof value === 'boolean' ? formatLogical(value) : scalar(value))).join(' ');
}

function ensureWritablePath(fileName, options = {}) {
  const resolved = makeString(fileName || options.fileName, '').trim();
  assert(resolved.length > 0, 'missing filename');
  const exists = fs.existsSync(resolved);
  const mode = options.mode ?? (exists ? 'overwrite' : 'new');
  if (exists && mode === 'skip') {
    return { fileName: resolved, exists, mode, write: false };
  }
  if (exists && mode === 'new') {
    const newFileName = makeString(options.newFileName, '').trim();
    assert(newFileName.length > 0, 'missing new output filename');
    return { fileName: newFileName, exists, mode, write: true };
  }
  return { fileName: resolved, exists, mode, write: true };
}

function syncDesignState(state) {
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
}

function respacedGeometry(state, iix, oldXI, oldCH, oldBETA, oldUBODY) {
  const w3 = new Float64Array(iix);
  const w5 = new Float64Array(iix);
  const w7 = new Float64Array(iix);
  SPLINE(oldCH, w3, oldXI, iix);
  SPLINE(oldBETA, w5, oldXI, iix);
  SPLINE(oldUBODY, w7, oldXI, iix);

  getXrotor().SETX(state);
  xoper.XWINIT(state);

  for (let i = 0; i < state.II; i += 1) {
    state.CH[i] = SEVAL(state.XI[i], oldCH, w3, oldXI, iix);
    state.BETA[i] = SEVAL(state.XI[i], oldBETA, w5, oldXI, iix);
    state.UBODY[i] = SEVAL(state.XI[i], oldUBODY, w7, oldXI, iix);
    state.BETA0[i] = state.BETA[i];
  }
  state.IINF = state.II + Math.trunc(state.II / 2);
}

function completeLoad(state) {
  state.CONV = false;
  const result = xoper.APER(state, 4, 2, true);
  const output = state.CONV ? getXrotor().OUTPUT(state, state.LUWRIT) : null;
  syncDesignState(state);
  return {
    converged: result.converged,
    output,
  };
}

function normalizedName(state) {
  const trimmed = makeString(state.NAME, '').trim();
  if (trimmed.length === 0) {
    state.NAME = 'Saved blade';
  }
  return state.NAME;
}

function lvdductFlag(state) {
  return Math.abs(state.ADW - state.ADV * state.URDUCT) >= 5.0e-5;
}

function SAVEOLD(state, FNAME1 = '', options = {}) {
  if (!state.CONV) {
    return {
      fileName: makeString(FNAME1 || options.fileName, '').trim(),
      written: false,
      error: '*** Converged operating solution does not exist ***',
    };
  }

  const target = ensureWritablePath(FNAME1, options);
  if (!target.write) {
    return { fileName: target.fileName, written: false, skipped: true };
  }

  normalizedName(state);
  const section = xaero.GETAERO(state, 1);
  const lines = [
    state.NAME,
    formatLine([Math.trunc(state.II), Math.trunc(state.NBLDS)]),
    formatLine([state.RHO, state.VSO, state.RMU]),
    formatLine([state.RAD, state.VEL, state.ADV]),
    formatLine([state.XI0, state.XW0]),
    formatLine([section.A0, section.DCLDA, section.CLMAX, section.CLMIN]),
    formatLine([section.CDMIN, section.CLDMIN, section.DCDCL2]),
    formatLine([section.REREF, section.REXP]),
    formatLine([lvdductFlag(state), state.DUCT, state.WIND]),
  ];

  for (let i = 0; i < state.II; i += 1) {
    lines.push(formatLine([state.XI[i], state.CH[i], state.BETA0[i], state.UBODY[i]]));
  }
  lines.push(formatLine([state.URDUCT]));

  if (state.NADD > 1) {
    for (let i = 0; i < state.NADD; i += 1) {
      lines.push(formatLine([state.RADD[i], state.UADD[i], state.VADD[i]]));
    }
  }

  const text = `${lines.join('\n')}\n`;
  fs.writeFileSync(target.fileName, text, 'utf8');
  return {
    fileName: target.fileName,
    written: true,
    format: 'old',
    text,
  };
}

function SAVE(state, FNAME1 = '', options = {}) {
  const target = ensureWritablePath(FNAME1, options);
  if (!target.write) {
    return { fileName: target.fileName, written: false, skipped: true };
  }

  normalizedName(state);
  const lines = [
    `XROTOR VERSION: ${Number(state.VERSION ?? 0.0).toFixed(2)}`,
    state.NAME,
    '!         Rho          Vso          Rmu           Alt',
    formatLine([state.RHO, state.VSO, state.RMU, state.ALT]),
    '!         Rad          Vel          Adv          Rake',
    formatLine([state.RAD, state.VEL, state.ADV, state.RAKE]),
    '!         XI0          XIW',
    formatLine([state.XI0, state.XW0]),
    '!  Naero',
    formatLine([Math.trunc(state.NAERO)]),
  ];

  for (let n = 1; n <= state.NAERO; n += 1) {
    const section = xaero.GETAERO(state, n);
    lines.push('!   Xisection');
    lines.push(formatLine([section.XISECT]));
    lines.push('!       A0deg        dCLdA        CLmax         CLmin');
    lines.push(formatLine([(section.A0 * 180.0) / PI, section.DCLDA, section.CLMAX, section.CLMIN]));
    lines.push('!  dCLdAstall     dCLstall      Cmconst         Mcrit');
    lines.push(formatLine([section.DCLDA_STALL, section.DCL_STALL, section.CMCON, section.MCRIT]));
    lines.push('!       CDmin      CLCDmin     dCDdCL^2');
    lines.push(formatLine([section.CDMIN, section.CLDMIN, section.DCDCL2]));
    lines.push('!       REref        REexp');
    lines.push(formatLine([section.REREF, section.REXP]));
  }

  lines.push('!LVDuct  LDuct   LWind');
  lines.push(formatLine([lvdductFlag(state), state.DUCT, state.WIND]));
  lines.push('!   II Nblds');
  lines.push(formatLine([Math.trunc(state.II), Math.trunc(state.NBLDS)]));
  lines.push('!         r/R          C/R     Beta0deg         Ubody');
  for (let i = 0; i < state.II; i += 1) {
    lines.push(formatLine([state.XI[i], state.CH[i], (state.BETA0[i] * 180.0) / PI, state.UBODY[i]]));
  }
  lines.push('!      URDuct');
  lines.push(formatLine([state.URDUCT]));

  if (state.NADD > 1) {
    lines.push('!Nadd');
    lines.push(formatLine([Math.trunc(state.NADD)]));
    lines.push('!        Radd         Uadd         Vadd');
    for (let i = 0; i < state.NADD; i += 1) {
      lines.push(formatLine([state.RADD[i], state.UADD[i], state.VADD[i]]));
    }
  }

  const text = `${lines.join('\n')}\n`;
  fs.writeFileSync(target.fileName, text, 'utf8');
  return {
    fileName: target.fileName,
    written: true,
    format: 'new',
    text,
  };
}

function RDLINE(source, cursor = { index: 0 }) {
  const lines = Array.isArray(source) ? source : parseText(String(source));
  while (cursor.index < lines.length) {
    const raw = lines[cursor.index];
    cursor.index += 1;
    if (raw === undefined) {
      break;
    }
    if (raw.trim().length === 0) {
      continue;
    }
    if ('!#'.includes(raw[0])) {
      continue;
    }
    return raw;
  }
  return 'END';
}

function readTextFile(fileName, options) {
  return options.text ?? fs.readFileSync(fileName, 'utf8');
}

function applyAnalysisStationChoice(state, iix, options) {
  if (iix === state.II) {
    return;
  }
  const selected = options.analysisStations ?? options.II ?? state.II;
  if (selected && selected > 0) {
    state.II = Math.trunc(selected);
  }
}

function LOADOLD(state, FNAME1 = '', options = {}) {
  const fileName = makeString(FNAME1 || options.fileName, '').trim();
  let text;
  try {
    text = readTextFile(fileName, options);
  } catch {
    return { fileName, error: `File ${fileName.slice(0, 32)} not found` };
  }

  const lines = parseText(text).filter((line) => line.length > 0);
  try {
    let cursor = 0;
    state.NAME = lines[cursor += 0];
    let values = parseNumberLine(lines[cursor += 1], 2);
    const iix = Math.trunc(values[0]);
    state.NBLDS = Math.trunc(values[1]);
    [state.RHO, state.VSO, state.RMU] = parseNumberLine(lines[cursor += 1], 3);
    [state.RAD, state.VEL, state.ADV] = parseNumberLine(lines[cursor += 1], 3);
    [state.XI0, state.XW0] = parseNumberLine(lines[cursor += 1], 2);

    values = parseNumberLine(lines[cursor += 1], 4);
    const A0 = values[0];
    const DCLDA = values[1];
    const CLMAX = values[2];
    const CLMIN = values[3];
    const [CDMIN, CLDMIN, DCDCL2] = parseNumberLine(lines[cursor += 1], 3);
    const [REREF, REXP] = parseNumberLine(lines[cursor += 1], 2);

    const flags = lines[cursor += 1].trim().split(/\s+/);
    state.FREE = parseLogicalToken(flags[0]);
    state.DUCT = parseLogicalToken(flags[1]);
    state.WIND = parseLogicalToken(flags[2]);

    const oldXI = new Float64Array(iix);
    const oldCH = new Float64Array(iix);
    const oldBETA = new Float64Array(iix);
    const oldUBODY = new Float64Array(iix);
    for (let i = 0; i < iix; i += 1) {
      const row = parseNumberLine(lines[cursor += 1], 4);
      oldXI[i] = row[0];
      oldCH[i] = row[1];
      oldBETA[i] = row[2];
      oldUBODY[i] = row[3];
    }

    state.URDUCT = 1.0;
    if (cursor + 1 < lines.length) {
      const candidate = parseNumberLine(lines[cursor + 1], 1);
      if (candidate.length >= 1) {
        cursor += 1;
        state.URDUCT = candidate[0];
      }
    }

    state.NADD = 0;
    let addIndex = 0;
    while (cursor + 1 < lines.length && addIndex < IX) {
      const row = parseNumberLine(lines[cursor += 1], 3);
      state.RADD[addIndex] = row[0];
      state.UADD[addIndex] = row[1];
      state.VADD[addIndex] = row[2];
      addIndex += 1;
    }
    state.NADD = addIndex;

    state.ALT = 999.0;
    applyAnalysisStationChoice(state, iix, options);
    respacedGeometry(state, iix, oldXI, oldCH, oldBETA, oldUBODY);

    state.NAERO = 1;
    xaero.PUTAERO(
      state,
      1,
      0.0,
      A0,
      CLMAX,
      CLMIN,
      DCLDA,
      0.1,
      0.1,
      CDMIN,
      CLDMIN,
      DCDCL2,
      -0.1,
      0.8,
      REREF,
      REXP,
    );
    xaero.SETIAERO(state);
    const result = completeLoad(state);
    return {
      fileName,
      format: 'old',
      ...result,
    };
  } catch {
    state.CONV = false;
    return {
      fileName,
      error: `File ${fileName.slice(0, 32)} has incompatible format`,
    };
  }
}

function LOAD(state, FNAME1 = '', options = {}) {
  const fileName = makeString(FNAME1 || options.fileName, '').trim();
  let text;
  try {
    text = readTextFile(fileName, options);
  } catch {
    return { fileName, error: `File ${fileName.slice(0, 32)} not found` };
  }

  const lines = parseText(text);
  const cursor = { index: 0 };
  try {
    const header = RDLINE(lines, cursor);
    if (header === 'END') {
      throw new Error('empty file');
    }
    if (!header.startsWith('XROTOR')) {
      return LOADOLD(state, FNAME1, options);
    }

    const versionMatch = header.match(/XROTOR VERSION:\s*([+-]?(?:\d+\.?\d*|\.\d+))/i);
    if (versionMatch) {
      state.FILEVERS = Number(versionMatch[1]);
    }

    state.NAME = RDLINE(lines, cursor);
    [state.RHO, state.VSO, state.RMU, state.ALT] = parseNumberLine(RDLINE(lines, cursor), 4);
    [state.RAD, state.VEL, state.ADV, state.RAKE] = parseNumberLine(RDLINE(lines, cursor), 4);
    [state.XI0, state.XW0] = parseNumberLine(RDLINE(lines, cursor), 2);
    [state.NAERO] = parseNumberLine(RDLINE(lines, cursor), 1).map((value) => Math.trunc(value));

    for (let n = 1; n <= state.NAERO; n += 1) {
      const [XISECT] = parseNumberLine(RDLINE(lines, cursor), 1);
      const [A0DEG, DCLDA, CLMAX, CLMIN] = parseNumberLine(RDLINE(lines, cursor), 4);
      const [DCLDA_STALL, DCL_STALL, CMCON, MCRIT] = parseNumberLine(RDLINE(lines, cursor), 4);
      const [CDMIN, CLDMIN, DCDCL2] = parseNumberLine(RDLINE(lines, cursor), 3);
      const [REREF, REXP] = parseNumberLine(RDLINE(lines, cursor), 2);
      xaero.PUTAERO(
        state,
        n,
        XISECT,
        (A0DEG * PI) / 180.0,
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
    }

    {
      const flags = RDLINE(lines, cursor).trim().split(/\s+/);
      state.FREE = parseLogicalToken(flags[0]);
      state.DUCT = parseLogicalToken(flags[1]);
      state.WIND = parseLogicalToken(flags[2]);
    }

    const [iixRaw, nbladesRaw] = parseNumberLine(RDLINE(lines, cursor), 2);
    const iix = Math.trunc(iixRaw);
    state.NBLDS = Math.trunc(nbladesRaw);
    const oldXI = new Float64Array(iix);
    const oldCH = new Float64Array(iix);
    const oldBETA = new Float64Array(iix);
    const oldUBODY = new Float64Array(iix);
    for (let i = 0; i < iix; i += 1) {
      const [xi, ch, betaDeg, ubody] = parseNumberLine(RDLINE(lines, cursor), 4);
      oldXI[i] = xi;
      oldCH[i] = ch;
      oldBETA[i] = (betaDeg * PI) / 180.0;
      oldUBODY[i] = ubody;
    }

    state.URDUCT = 1.0;
    state.NADD = 0;
    const nextLine = RDLINE(lines, cursor);
    if (nextLine !== 'END') {
      const firstValues = parseNumberLine(nextLine, 1);
      state.URDUCT = firstValues[0];

      const afterUrduct = RDLINE(lines, cursor);
      if (afterUrduct !== 'END') {
        let [naddRaw] = parseNumberLine(afterUrduct, 1);
        state.NADD = Math.min(Math.trunc(naddRaw), IX);
        for (let i = 0; i < state.NADD; i += 1) {
          const row = parseNumberLine(RDLINE(lines, cursor), 3);
          state.RADD[i] = row[0];
          state.UADD[i] = row[1];
          state.VADD[i] = row[2];
        }
      }
    }

    applyAnalysisStationChoice(state, iix, options);
    respacedGeometry(state, iix, oldXI, oldCH, oldBETA, oldUBODY);
    xaero.SETIAERO(state);
    const result = completeLoad(state);
    return {
      fileName,
      format: 'new',
      ...result,
    };
  } catch {
    state.CONV = false;
    return {
      fileName,
      error: `File ${fileName.slice(0, 32)} has incompatible format`,
    };
  }
}

module.exports = {
  SAVEOLD,
  SAVE,
  LOADOLD,
  LOAD,
  RDLINE,
};
