'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const buildDir = path.join(repoRoot, 'build');
const driverPath = path.join(buildDir, 'xnoise_driver');
const xnoiseSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xnoise.f');
const splineSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'spline.f');
const srclinSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'srclin.f');
const vortexSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'vortex.f');
const xaeroSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xaero.f');
const xutilsSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xutils.f');
const xbendSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xbend.f');
const plutilSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'plutil.f');
const driverSource = path.join(repoRoot, 'test', 'fortran', 'xnoise_driver.f90');

const XBEND_STATION_FIELDS = [
  'XI',
  'DXI',
  'CH',
  'BETA',
  'BETA0',
  'CL',
  'CD',
  'CM',
  'EIXXB',
  'EIYYB',
  'EAB',
  'GJB',
  'EKB',
  'MB',
  'MXXB',
  'XOCG',
  'XOSC',
  'RSTB',
  'PX',
  'PY',
  'PZ',
  'MX',
  'MY',
  'MZ',
  'PX_TY',
  'PX_TZ',
  'PZ_TX',
  'PZ_TY',
  'PZ_WZ',
  'MY_TY',
  'MZ_TY',
  'MZ_TX',
  'MZ_WZ',
];

const XBEND_NODE_FIELDS = [
  'TX',
  'TY',
  'TZ',
  'WX',
  'WY',
  'WZ',
  'SHRX',
  'SHRY',
  'SHRZ',
  'MOMX',
  'MOMY',
  'MOMZ',
];

function scalar(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return Number(value).toPrecision(17);
}

function vector(values) {
  return Array.from(values, scalar).join('\n');
}

function intVector(values) {
  return Array.from(values, (value) => String(Math.trunc(value))).join('\n');
}

function matrix(values, rows, cols) {
  const out = [];
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      out.push(scalar(values[i][j]));
    }
  }
  return out.join('\n');
}

function tensor3(values, depth, rows, cols) {
  const out = [];
  for (let k = 0; k < depth; k += 1) {
    for (let i = 0; i < rows; i += 1) {
      for (let j = 0; j < cols; j += 1) {
        out.push(scalar(values[k][i][j]));
      }
    }
  }
  return out.join('\n');
}

function boolInt(value) {
  return value ? 1 : 0;
}

function padVector(values, length) {
  const out = new Float64Array(length);
  const source = values ?? [];
  const limit = Math.min(length, source.length ?? 0);
  for (let i = 0; i < limit; i += 1) {
    out[i] = Number(source[i]);
  }
  return out;
}

function xbendStateInput(state) {
  const ii = state.II;
  const lines = [
    `${scalar(ii)}`,
    [
      state.RAD ?? 1.0,
      state.VEL ?? 1.0,
      state.VSO ?? 340.0,
      state.RHO ?? 1.0,
      state.ADV ?? 1.0,
      state.RAKE ?? 0.0,
    ]
      .map(scalar)
      .join(' '),
    `${scalar(state.INCR ?? 1)} ${boolInt(state.LSTRUC)}`,
  ];

  for (const field of XBEND_STATION_FIELDS) {
    lines.push(vector(padVector(state[field], ii)));
  }
  for (const field of XBEND_NODE_FIELDS) {
    lines.push(vector(padVector(state[field], ii + 1)));
  }

  lines.push('');
  return lines.join('\n');
}

function tokenize(output) {
  const trimmed = output.trim();
  return trimmed.length === 0 ? [] : trimmed.split(/\s+/);
}

function resultTokens(output) {
  const tokens = tokenize(output);
  const marker = tokens.lastIndexOf('RESULT');
  if (marker < 0 || marker + 2 > tokens.length) {
    throw new Error(`missing RESULT marker in Fortran output:\n${output}`);
  }
  return tokens.slice(marker + 2);
}

function nextNumber(tokens, indexRef) {
  const token = tokens[indexRef.index];
  if (token === undefined) {
    throw new Error('unexpected end of Fortran output');
  }
  indexRef.index += 1;
  return Number(token);
}

function nextInteger(tokens, indexRef) {
  return Math.trunc(nextNumber(tokens, indexRef));
}

function needsRebuild(outputPath, inputPaths) {
  if (!fs.existsSync(outputPath)) {
    return true;
  }

  const outputMtime = fs.statSync(outputPath).mtimeMs;
  return inputPaths.some((inputPath) => fs.statSync(inputPath).mtimeMs > outputMtime);
}

function compileFortranDriver() {
  fs.mkdirSync(buildDir, { recursive: true });

  if (!needsRebuild(driverPath, [xnoiseSource, splineSource, srclinSource, vortexSource, xaeroSource, xutilsSource, xbendSource, plutilSource, driverSource])) {
    return driverPath;
  }

  const xnoiseObject = path.join(buildDir, 'xnoise.o');
  const splineObject = path.join(buildDir, 'spline.o');
  const srclinObject = path.join(buildDir, 'srclin.o');
  const vortexObject = path.join(buildDir, 'vortex.o');
  const xaeroObject = path.join(buildDir, 'xaero.o');
  const xutilsObject = path.join(buildDir, 'xutils.o');
  const xbendObject = path.join(buildDir, 'xbend.o');
  const plutilObject = path.join(buildDir, 'plutil.o');
  const driverObject = path.join(buildDir, 'xnoise_driver.o');

  execFileSync(
    'gfortran',
    ['-ffixed-form', '-std=legacy', '-ffunction-sections', '-c', xnoiseSource, '-o', xnoiseObject],
    { cwd: repoRoot, stdio: 'pipe' },
  );
  execFileSync(
    'gfortran',
    ['-ffixed-form', '-std=legacy', '-ffunction-sections', '-c', splineSource, '-o', splineObject],
    { cwd: repoRoot, stdio: 'pipe' },
  );
  execFileSync(
    'gfortran',
    ['-ffixed-form', '-std=legacy', '-ffunction-sections', '-c', srclinSource, '-o', srclinObject],
    { cwd: repoRoot, stdio: 'pipe' },
  );
  execFileSync(
    'gfortran',
    ['-ffixed-form', '-std=legacy', '-ffunction-sections', '-c', vortexSource, '-o', vortexObject],
    { cwd: repoRoot, stdio: 'pipe' },
  );
  execFileSync(
    'gfortran',
    ['-ffixed-form', '-std=legacy', '-ffunction-sections', '-c', xaeroSource, '-o', xaeroObject],
    { cwd: repoRoot, stdio: 'pipe' },
  );
  execFileSync(
    'gfortran',
    ['-ffixed-form', '-std=legacy', '-ffunction-sections', '-c', xutilsSource, '-o', xutilsObject],
    { cwd: repoRoot, stdio: 'pipe' },
  );
  execFileSync(
    'gfortran',
    ['-ffixed-form', '-std=legacy', '-ffunction-sections', '-c', xbendSource, '-o', xbendObject],
    { cwd: repoRoot, stdio: 'pipe' },
  );
  execFileSync(
    'gfortran',
    ['-ffixed-form', '-std=legacy', '-ffunction-sections', '-c', plutilSource, '-o', plutilObject],
    { cwd: repoRoot, stdio: 'pipe' },
  );
  execFileSync(
    'gfortran',
    ['-std=f2008', '-ffree-line-length-none', '-c', driverSource, '-o', driverObject],
    { cwd: repoRoot, stdio: 'pipe' },
  );
  execFileSync(
    'gfortran',
    ['-Wl,--gc-sections', xnoiseObject, splineObject, srclinObject, vortexObject, xaeroObject, xutilsObject, xbendObject, plutilObject, driverObject, '-o', driverPath],
    { cwd: repoRoot, stdio: 'pipe' },
  );

  return driverPath;
}

function runDriver(command, input) {
  const binary = compileFortranDriver();
  return execFileSync(binary, [command], {
    cwd: repoRoot,
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function runPtrace({
  NBLDS,
  II,
  NT,
  XOBS,
  YOBS,
  ZOBS,
  ADV,
  RAD,
  VEL,
  VSO,
  RHO,
  XI,
  DXI,
  AOC,
  CH,
  GAM,
}) {
  const input = [
    `${scalar(NBLDS)} ${scalar(II)} ${scalar(NT)}`,
    `${scalar(XOBS)} ${scalar(YOBS)} ${scalar(ZOBS)}`,
    `${scalar(ADV)} ${scalar(RAD)} ${scalar(VEL)} ${scalar(VSO)} ${scalar(RHO)}`,
    vector(XI),
    vector(DXI),
    vector(AOC),
    vector(CH),
    vector(GAM),
    '',
  ].join('\n');

  const tokens = resultTokens(runDriver('ptrace', input));
  const indexRef = { index: 0 };
  const nt = nextInteger(tokens, indexRef);
  const time = new Float64Array(nt + 1);
  const pres = Array.from({ length: nt + 1 }, () => new Float64Array(3));

  for (let it = 0; it <= nt; it += 1) {
    time[it] = nextNumber(tokens, indexRef);
    pres[it][0] = nextNumber(tokens, indexRef);
    pres[it][1] = nextNumber(tokens, indexRef);
    pres[it][2] = nextNumber(tokens, indexRef);
  }

  return { NT: nt, TIME: time, PRES: pres };
}

function runTrisol({ KK, A, B, C, D }) {
  const input = [`${scalar(KK)}`, vector(A), vector(B), vector(C), vector(D), ''].join('\n');
  const tokens = resultTokens(runDriver('trisol', input));
  const indexRef = { index: 0 };
  const kk = nextInteger(tokens, indexRef);
  const d = new Float64Array(kk);

  for (let i = 0; i < kk; i += 1) {
    d[i] = nextNumber(tokens, indexRef);
  }

  return { KK: kk, D: d };
}

function runSetexp({ NN, SMAX, S }) {
  const input = [`${scalar(NN)}`, `${scalar(SMAX)}`, vector(S), ''].join('\n');
  const tokens = resultTokens(runDriver('setexp', input));
  const indexRef = { index: 0 };
  const nn = nextInteger(tokens, indexRef);
  const s = new Float64Array(nn);

  for (let i = 0; i < nn; i += 1) {
    s[i] = nextNumber(tokens, indexRef);
  }

  return { NN: nn, S: s };
}

function runGauss({ NSIZ, NN, NRHS, Z, R }) {
  const input = [
    `${scalar(NSIZ)} ${scalar(NN)} ${scalar(NRHS)}`,
    matrix(Z, NSIZ, NSIZ),
    matrix(R, NSIZ, NRHS),
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('gauss', input));
  const indexRef = { index: 0 };
  const nn = nextInteger(tokens, indexRef);
  const nrhs = nextInteger(tokens, indexRef);
  const z = Array.from({ length: NSIZ }, () => new Float64Array(NSIZ));
  const r = Array.from({ length: NSIZ }, () => new Float64Array(nrhs));

  for (let i = 0; i < NSIZ; i += 1) {
    for (let j = 0; j < NSIZ; j += 1) {
      z[i][j] = nextNumber(tokens, indexRef);
    }
  }
  for (let i = 0; i < NSIZ; i += 1) {
    for (let j = 0; j < nrhs; j += 1) {
      r[i][j] = nextNumber(tokens, indexRef);
    }
  }

  return { NN: nn, NRHS: nrhs, Z: z, R: r };
}

function runLudcmp({ NSIZ, N, A }) {
  const input = [`${scalar(NSIZ)} ${scalar(N)}`, matrix(A, NSIZ, NSIZ), ''].join('\n');
  const tokens = resultTokens(runDriver('ludcmp', input));
  const indexRef = { index: 0 };
  const n = nextInteger(tokens, indexRef);
  const a = Array.from({ length: NSIZ }, () => new Float64Array(NSIZ));
  const indx = new Int32Array(NSIZ);

  for (let i = 0; i < NSIZ; i += 1) {
    for (let j = 0; j < NSIZ; j += 1) {
      a[i][j] = nextNumber(tokens, indexRef);
    }
  }
  for (let i = 0; i < NSIZ; i += 1) {
    indx[i] = nextInteger(tokens, indexRef);
  }

  return { N: n, A: a, INDX: indx };
}

function runBaksub({ NSIZ, N, A, INDX, B }) {
  const input = [
    `${scalar(NSIZ)} ${scalar(N)}`,
    matrix(A, NSIZ, NSIZ),
    intVector(INDX),
    vector(B),
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('baksub', input));
  const indexRef = { index: 0 };
  const n = nextInteger(tokens, indexRef);
  const b = new Float64Array(NSIZ);

  for (let i = 0; i < NSIZ; i += 1) {
    b[i] = nextNumber(tokens, indexRef);
  }

  return { N: n, B: b };
}

function runSrclin({ NB, ZB, RB }) {
  const input = [`${scalar(NB)}`, vector(ZB), vector(RB), ''].join('\n');
  const tokens = resultTokens(runDriver('srclin', input));
  const indexRef = { index: 0 };
  const n = nextInteger(tokens, indexRef);
  const src = new Float64Array(n);

  for (let i = 0; i < n; i += 1) {
    src[i] = nextNumber(tokens, indexRef);
  }

  return { N: n, SRC: src };
}

function runSrcvel({ NB, ZB, SRC, Z, R }) {
  const input = [`${scalar(NB)}`, `${scalar(Z)} ${scalar(R)}`, vector(ZB), vector(SRC), ''].join('\n');
  const tokens = resultTokens(runDriver('srcvel', input));
  const indexRef = { index: 0 };
  return {
    U: nextNumber(tokens, indexRef),
    V: nextNumber(tokens, indexRef),
  };
}

function runVorsegvel({ A, B }) {
  const input = [vector(A), vector(B), ''].join('\n');
  const tokens = resultTokens(runDriver('vorsegvel', input));
  const indexRef = { index: 0 };
  const uvw = new Float64Array(3);
  const uvwA = Array.from({ length: 3 }, () => new Float64Array(3));
  const uvwB = Array.from({ length: 3 }, () => new Float64Array(3));

  for (let i = 0; i < 3; i += 1) {
    uvw[i] = nextNumber(tokens, indexRef);
  }
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      uvwA[i][j] = nextNumber(tokens, indexRef);
    }
  }
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      uvwB[i][j] = nextNumber(tokens, indexRef);
    }
  }

  return { UVW: uvw, UVW_A: uvwA, UVW_B: uvwB };
}

function runVrtxco({ IMAX, II, NBLDS, LDUCT, RAKE, XI, XV, GAM, ADW }) {
  const input = [
    `${scalar(IMAX)} ${scalar(II)} ${scalar(NBLDS)} ${LDUCT ? 1 : 0}`,
    `${scalar(RAKE)} ${scalar(ADW)}`,
    vector(XI),
    vector(XV),
    vector(GAM),
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('vrtxco', input));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
  const nthet = nextInteger(tokens, indexRef);
  const overflow = nextInteger(tokens, indexRef) === 1;
  const vindGam = Array.from({ length: 3 }, () => Array.from({ length: ii }, () => new Float64Array(ii)));
  const vindAdw = Array.from({ length: 3 }, () => new Float64Array(ii));

  for (let k = 0; k < 3; k += 1) {
    for (let i = 0; i < ii; i += 1) {
      for (let j = 0; j < ii; j += 1) {
        vindGam[k][i][j] = nextNumber(tokens, indexRef);
      }
    }
  }
  for (let k = 0; k < 3; k += 1) {
    for (let i = 0; i < ii; i += 1) {
      vindAdw[k][i] = nextNumber(tokens, indexRef);
    }
  }

  return { II: ii, NTHET: nthet, spacingOverflow: overflow, VIND_GAM: vindGam, VIND_ADW: vindAdw };
}

function runSortar({ NS, NDIM, S, W }) {
  const input = [`${scalar(NS)} ${scalar(NDIM)}`, vector(S), matrix(W, NDIM, NS), ''].join('\n');
  const tokens = resultTokens(runDriver('sortar', input));
  const indexRef = { index: 0 };
  const ns = nextInteger(tokens, indexRef);
  const ndim = nextInteger(tokens, indexRef);
  const s = new Float64Array(ns);
  const w = Array.from({ length: ndim }, () => new Float64Array(ns));

  for (let i = 0; i < ns; i += 1) {
    s[i] = nextNumber(tokens, indexRef);
  }
  for (let l = 0; l < ndim; l += 1) {
    for (let i = 0; i < ns; i += 1) {
      w[l][i] = nextNumber(tokens, indexRef);
    }
  }

  return { NS: ns, NDIM: ndim, S: s, W: w };
}

function runSetiaero({ II, NAERO, XI, XIAERO }) {
  const input = [`${scalar(II)} ${scalar(NAERO)}`, vector(XI), vector(XIAERO), ''].join('\n');
  const tokens = resultTokens(runDriver('setiaero', input));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
  const iaero = new Int32Array(ii);

  for (let i = 0; i < ii; i += 1) {
    iaero[i] = nextInteger(tokens, indexRef);
  }

  return { II: ii, IAERO: iaero };
}

function runGetaero({ NAERO, XIAERO, AERODATA, N }) {
  const input = [
    `${scalar(NAERO)} ${scalar(N)}`,
    vector(XIAERO),
    matrix(AERODATA, 13, NAERO),
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('getaero', input));
  const indexRef = { index: 0 };
  return {
    XISECT: nextNumber(tokens, indexRef),
    A0: nextNumber(tokens, indexRef),
    CLMAX: nextNumber(tokens, indexRef),
    CLMIN: nextNumber(tokens, indexRef),
    DCLDA: nextNumber(tokens, indexRef),
    DCLDA_STALL: nextNumber(tokens, indexRef),
    DCL_STALL: nextNumber(tokens, indexRef),
    CDMIN: nextNumber(tokens, indexRef),
    CLDMIN: nextNumber(tokens, indexRef),
    DCDCL2: nextNumber(tokens, indexRef),
    CMCON: nextNumber(tokens, indexRef),
    MCRIT: nextNumber(tokens, indexRef),
    REREF: nextNumber(tokens, indexRef),
    REXP: nextNumber(tokens, indexRef),
  };
}

function runPutaero({
  XISECT,
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
  N,
}) {
  const input = [
    `${scalar(N)}`,
    [
      XISECT,
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
    ]
      .map(scalar)
      .join(' '),
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('putaero', input));
  const indexRef = { index: 0 };
  return {
    XISECT: nextNumber(tokens, indexRef),
    A0: nextNumber(tokens, indexRef),
    CLMAX: nextNumber(tokens, indexRef),
    CLMIN: nextNumber(tokens, indexRef),
    DCLDA: nextNumber(tokens, indexRef),
    DCLDA_STALL: nextNumber(tokens, indexRef),
    DCL_STALL: nextNumber(tokens, indexRef),
    CDMIN: nextNumber(tokens, indexRef),
    CLDMIN: nextNumber(tokens, indexRef),
    DCDCL2: nextNumber(tokens, indexRef),
    CMCON: nextNumber(tokens, indexRef),
    MCRIT: nextNumber(tokens, indexRef),
    REREF: nextNumber(tokens, indexRef),
    REXP: nextNumber(tokens, indexRef),
  };
}

function runClcdcm({
  VEL,
  VSO,
  ALF,
  W,
  REY,
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
}) {
  const input = [
    `${scalar(VEL)} ${scalar(VSO)}`,
    `${scalar(ALF)} ${scalar(W)} ${scalar(REY)}`,
    [
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
    ]
      .map(scalar)
      .join(' '),
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('clcdcm', input));
  const indexRef = { index: 0 };
  return {
    CLIFT: nextNumber(tokens, indexRef),
    CL_ALF: nextNumber(tokens, indexRef),
    CL_W: nextNumber(tokens, indexRef),
    CLMAX: nextNumber(tokens, indexRef),
    CLMIN: nextNumber(tokens, indexRef),
    DCL_STALL: nextNumber(tokens, indexRef),
    STALLF: nextInteger(tokens, indexRef) === 1,
    CDRAG: nextNumber(tokens, indexRef),
    CD_ALF: nextNumber(tokens, indexRef),
    CD_W: nextNumber(tokens, indexRef),
    CD_REY: nextNumber(tokens, indexRef),
    CMOM: nextNumber(tokens, indexRef),
    CM_AL: nextNumber(tokens, indexRef),
    CM_W: nextNumber(tokens, indexRef),
  };
}

function runGetclcdcm({ II, NAERO, XI, IAERO, XIAERO, AERODATA, VEL, VSO, IS, ALF, W, REY }) {
  const input = [
    `${scalar(II)} ${scalar(NAERO)} ${scalar(IS)}`,
    `${scalar(VEL)} ${scalar(VSO)}`,
    `${scalar(ALF)} ${scalar(W)} ${scalar(REY)}`,
    vector(XI),
    intVector(IAERO),
    vector(XIAERO),
    matrix(AERODATA, 13, NAERO),
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('getclcdcm', input));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
  const iaero = new Int32Array(ii);
  for (let i = 0; i < ii; i += 1) {
    iaero[i] = nextInteger(tokens, indexRef);
  }
  return {
    II: ii,
    IAERO: iaero,
    CLIFT: nextNumber(tokens, indexRef),
    CL_ALF: nextNumber(tokens, indexRef),
    CL_W: nextNumber(tokens, indexRef),
    CLMAX: nextNumber(tokens, indexRef),
    CLMIN: nextNumber(tokens, indexRef),
    DCL_STALL: nextNumber(tokens, indexRef),
    STALLF: nextInteger(tokens, indexRef) === 1,
    CDRAG: nextNumber(tokens, indexRef),
    CD_ALF: nextNumber(tokens, indexRef),
    CD_W: nextNumber(tokens, indexRef),
    CD_REY: nextNumber(tokens, indexRef),
    CMOM: nextNumber(tokens, indexRef),
    CM_AL: nextNumber(tokens, indexRef),
    CM_W: nextNumber(tokens, indexRef),
  };
}

function runGetalf({ II, NAERO, XI, IAERO, XIAERO, AERODATA, VEL, VSO, IS, CLIFT, W }) {
  const input = [
    `${scalar(II)} ${scalar(NAERO)} ${scalar(IS)}`,
    `${scalar(VEL)} ${scalar(VSO)}`,
    `${scalar(CLIFT)} ${scalar(W)}`,
    vector(XI),
    intVector(IAERO),
    vector(XIAERO),
    matrix(AERODATA, 13, NAERO),
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('getalf', input));
  const indexRef = { index: 0 };
  return {
    ALF: nextNumber(tokens, indexRef),
    ALF_CL: nextNumber(tokens, indexRef),
    ALF_W: nextNumber(tokens, indexRef),
    STALLF: nextInteger(tokens, indexRef) === 1,
  };
}

function runChklim({ N, F, FMAX }) {
  const input = [`${scalar(N)}`, scalar(FMAX), vector(F), ''].join('\n');
  const tokens = resultTokens(runDriver('chklim', input));
  const indexRef = { index: 0 };
  return {
    NSTRT: nextInteger(tokens, indexRef),
    NEND: nextInteger(tokens, indexRef),
  };
}

function runSpline({ N, X, S }) {
  const input = [`${scalar(N)}`, vector(X), vector(S), ''].join('\n');
  const tokens = resultTokens(runDriver('spline', input));
  const indexRef = { index: 0 };
  const n = nextInteger(tokens, indexRef);
  const xs = new Float64Array(n);

  for (let i = 0; i < n; i += 1) {
    xs[i] = nextNumber(tokens, indexRef);
  }

  return { N: n, XS: xs };
}

function runSplind({ N, X, S, XS1, XS2 }) {
  const input = [`${scalar(N)}`, `${scalar(XS1)} ${scalar(XS2)}`, vector(X), vector(S), ''].join('\n');
  const tokens = resultTokens(runDriver('splind', input));
  const indexRef = { index: 0 };
  const n = nextInteger(tokens, indexRef);
  const xs = new Float64Array(n);

  for (let i = 0; i < n; i += 1) {
    xs[i] = nextNumber(tokens, indexRef);
  }

  return { N: n, XS: xs };
}

function runSplina({ N, X, S }) {
  const input = [`${scalar(N)}`, vector(X), vector(S), ''].join('\n');
  const tokens = resultTokens(runDriver('splina', input));
  const indexRef = { index: 0 };
  const n = nextInteger(tokens, indexRef);
  const xs = new Float64Array(n);

  for (let i = 0; i < n; i += 1) {
    xs[i] = nextNumber(tokens, indexRef);
  }

  return { N: n, XS: xs };
}

function runSeval({ N, M, X, XS, S, SS }) {
  const input = [`${scalar(N)} ${scalar(M)}`, vector(X), vector(XS), vector(S), vector(SS), ''].join(
    '\n',
  );
  const tokens = resultTokens(runDriver('seval', input));
  const indexRef = { index: 0 };
  const m = nextInteger(tokens, indexRef);
  const values = new Float64Array(m);

  for (let i = 0; i < m; i += 1) {
    values[i] = nextNumber(tokens, indexRef);
  }

  return { M: m, VALUES: values };
}

function runDeval({ N, M, X, XS, S, SS }) {
  const input = [`${scalar(N)} ${scalar(M)}`, vector(X), vector(XS), vector(S), vector(SS), ''].join(
    '\n',
  );
  const tokens = resultTokens(runDriver('deval', input));
  const indexRef = { index: 0 };
  const m = nextInteger(tokens, indexRef);
  const values = new Float64Array(m);

  for (let i = 0; i < m; i += 1) {
    values[i] = nextNumber(tokens, indexRef);
  }

  return { M: m, VALUES: values };
}

function runD2val({ N, M, X, XS, S, SS }) {
  const input = [`${scalar(N)} ${scalar(M)}`, vector(X), vector(XS), vector(S), vector(SS), ''].join(
    '\n',
  );
  const tokens = resultTokens(runDriver('d2val', input));
  const indexRef = { index: 0 };
  const m = nextInteger(tokens, indexRef);
  const values = new Float64Array(m);

  for (let i = 0; i < m; i += 1) {
    values[i] = nextNumber(tokens, indexRef);
  }

  return { M: m, VALUES: values };
}

function runSevall({ N, M, X, XS, S, SS }) {
  const input = [`${scalar(N)} ${scalar(M)}`, vector(X), vector(XS), vector(S), vector(SS), ''].join(
    '\n',
  );
  const tokens = resultTokens(runDriver('sevall', input));
  const indexRef = { index: 0 };
  const m = nextInteger(tokens, indexRef);
  const xx = new Float64Array(m);
  const xxs = new Float64Array(m);
  const xxss = new Float64Array(m);

  for (let i = 0; i < m; i += 1) {
    xx[i] = nextNumber(tokens, indexRef);
    xxs[i] = nextNumber(tokens, indexRef);
    xxss[i] = nextNumber(tokens, indexRef);
  }

  return { M: m, XX: xx, XXS: xxs, XXSS: xxss };
}

function runScalit({ II, Y, YOFF }) {
  const input = [`${scalar(II)}`, scalar(YOFF), vector(Y), ''].join('\n');
  const tokens = resultTokens(runDriver('scalit', input));
  const indexRef = { index: 0 };
  const ysf = nextNumber(tokens, indexRef);
  return { YSF: ysf };
}

function runCurv({ N, M, X, XS, Y, YS, S, SS }) {
  const input = [
    `${scalar(N)} ${scalar(M)}`,
    vector(X),
    vector(XS),
    vector(Y),
    vector(YS),
    vector(S),
    vector(SS),
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('curv', input));
  const indexRef = { index: 0 };
  const m = nextInteger(tokens, indexRef);
  const values = new Float64Array(m);

  for (let i = 0; i < m; i += 1) {
    values[i] = nextNumber(tokens, indexRef);
  }

  return { M: m, VALUES: values };
}

function runCurvs({ N, M, X, XS, Y, YS, S, SS }) {
  const input = [
    `${scalar(N)} ${scalar(M)}`,
    vector(X),
    vector(XS),
    vector(Y),
    vector(YS),
    vector(S),
    vector(SS),
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('curvs', input));
  const indexRef = { index: 0 };
  const m = nextInteger(tokens, indexRef);
  const values = new Float64Array(m);

  for (let i = 0; i < m; i += 1) {
    values[i] = nextNumber(tokens, indexRef);
  }

  return { M: m, VALUES: values };
}

function runSinvrt({ N, XI, SI, X, XS, S }) {
  const input = [`${scalar(N)}`, `${scalar(XI)} ${scalar(SI)}`, vector(X), vector(XS), vector(S), ''].join(
    '\n',
  );
  const tokens = resultTokens(runDriver('sinvrt', input));
  const indexRef = { index: 0 };
  return { SI: nextNumber(tokens, indexRef) };
}

function runScalc({ N, X, Y }) {
  const input = [`${scalar(N)}`, vector(X), vector(Y), ''].join('\n');
  const tokens = resultTokens(runDriver('scalc', input));
  const indexRef = { index: 0 };
  const n = nextInteger(tokens, indexRef);
  const s = new Float64Array(n);

  for (let i = 0; i < n; i += 1) {
    s[i] = nextNumber(tokens, indexRef);
  }

  return { N: n, S: s };
}

function runSegspl({ N, X, S }) {
  const input = [`${scalar(N)}`, vector(X), vector(S), ''].join('\n');
  const tokens = resultTokens(runDriver('segspl', input));
  const indexRef = { index: 0 };
  const n = nextInteger(tokens, indexRef);
  const xs = new Float64Array(n);

  for (let i = 0; i < n; i += 1) {
    xs[i] = nextNumber(tokens, indexRef);
  }

  return { N: n, XS: xs };
}

function runInters({ N1, N2, SS1, SS2, X1, XS1, Y1, YS1, S1, X2, XS2, Y2, YS2, S2 }) {
  const input = [
    `${scalar(N1)} ${scalar(N2)}`,
    `${scalar(SS1)} ${scalar(SS2)}`,
    vector(X1),
    vector(XS1),
    vector(Y1),
    vector(YS1),
    vector(S1),
    vector(X2),
    vector(XS2),
    vector(Y2),
    vector(YS2),
    vector(S2),
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('inters', input));
  const indexRef = { index: 0 };
  return {
    OK: nextInteger(tokens, indexRef) === 1,
    SS1: nextNumber(tokens, indexRef),
    SS2: nextNumber(tokens, indexRef),
  };
}

function runNearpt({ N, XPNT, YPNT, SNEAR, X, XP, Y, YP, S }) {
  const input = [
    `${scalar(N)}`,
    `${scalar(XPNT)} ${scalar(YPNT)} ${scalar(SNEAR)}`,
    vector(X),
    vector(XP),
    vector(Y),
    vector(YP),
    vector(S),
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('nearpt', input));
  const indexRef = { index: 0 };
  return { SNEAR: nextNumber(tokens, indexRef) };
}

function runSevlin({ N, M, X, S, SS }) {
  const input = [`${scalar(N)} ${scalar(M)}`, vector(X), vector(S), vector(SS), ''].join('\n');
  const tokens = resultTokens(runDriver('sevlin', input));
  const indexRef = { index: 0 };
  const m = nextInteger(tokens, indexRef);
  const xx = new Float64Array(m);
  const xxs = new Float64Array(m);

  for (let i = 0; i < m; i += 1) {
    xx[i] = nextNumber(tokens, indexRef);
    xxs[i] = nextNumber(tokens, indexRef);
  }

  return { M: m, XX: xx, XXS: xxs };
}

function runSsevlin({ N, M, X, S, SS }) {
  const input = [`${scalar(N)} ${scalar(M)}`, vector(X), vector(S), vector(SS), ''].join('\n');
  const tokens = resultTokens(runDriver('ssevlin', input));
  const indexRef = { index: 0 };
  const m = nextInteger(tokens, indexRef);
  const values = new Float64Array(m);

  for (let i = 0; i < m; i += 1) {
    values[i] = nextNumber(tokens, indexRef);
  }

  return { M: m, VALUES: values };
}

function runDsevlin({ N, M, X, S, SS }) {
  const input = [`${scalar(N)} ${scalar(M)}`, vector(X), vector(S), vector(SS), ''].join('\n');
  const tokens = resultTokens(runDriver('dsevlin', input));
  const indexRef = { index: 0 };
  const m = nextInteger(tokens, indexRef);
  const values = new Float64Array(m);

  for (let i = 0; i < m; i += 1) {
    values[i] = nextNumber(tokens, indexRef);
  }

  return { M: m, VALUES: values };
}

function runSft({ N, NF, Y, T }) {
  const input = [`${scalar(N)} ${scalar(NF)}`, vector(Y), vector(T), ''].join('\n');
  const tokens = resultTokens(runDriver('sft', input));
  const indexRef = { index: 0 };
  const nf = nextInteger(tokens, indexRef);
  const fampl = new Float64Array(nf);
  const phase = new Float64Array(nf);

  for (let i = 0; i < nf; i += 1) {
    fampl[i] = nextNumber(tokens, indexRef);
    phase[i] = nextNumber(tokens, indexRef);
  }

  return { NF: nf, FAMPL: fampl, PHASE: phase };
}

function runPsplin({ II, X, S }) {
  const input = [`${scalar(II)}`, vector(X), vector(S), ''].join('\n');
  const tokens = resultTokens(runDriver('psplin', input));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
  const xp = new Float64Array(ii);

  for (let i = 0; i < ii; i += 1) {
    xp[i] = nextNumber(tokens, indexRef);
  }

  return { II: ii, XP: xp };
}

function runPtriso({ KK, A, B, C, D }) {
  const input = [`${scalar(KK)}`, vector(A), vector(B), vector(C), vector(D), ''].join('\n');
  const tokens = resultTokens(runDriver('ptriso', input));
  const indexRef = { index: 0 };
  const kk = nextInteger(tokens, indexRef);
  const d = new Float64Array(kk);

  for (let i = 0; i < kk; i += 1) {
    d[i] = nextNumber(tokens, indexRef);
  }

  return { KK: kk, D: d };
}

function runDbfoot({
  NBLDS,
  II,
  NT,
  NX,
  NY,
  ADV,
  RAD,
  VEL,
  VSO,
  RHO,
  GALT,
  DCLIMB,
  UNITL,
  XI,
  DXI,
  AOC,
  CH,
  GAM,
  X,
  Y,
}) {
  const xValues = [];
  const yValues = [];
  for (let i = 0; i < NX; i += 1) {
    for (let j = 0; j < NY; j += 1) {
      xValues.push(X[i][j]);
    }
  }
  for (let i = 0; i < NX; i += 1) {
    for (let j = 0; j < NY; j += 1) {
      yValues.push(Y[i][j]);
    }
  }

  const input = [
    `${scalar(NBLDS)} ${scalar(II)} ${scalar(NT)} ${scalar(NX)} ${scalar(NY)}`,
    `${scalar(ADV)} ${scalar(RAD)} ${scalar(VEL)} ${scalar(VSO)} ${scalar(RHO)}`,
    `${scalar(GALT)} ${scalar(DCLIMB)} ${scalar(UNITL)}`,
    vector(XI),
    vector(DXI),
    vector(AOC),
    vector(CH),
    vector(GAM),
    vector(xValues),
    vector(yValues),
    '',
  ].join('\n');

  const tokens = resultTokens(runDriver('dbfoot', input));
  const indexRef = { index: 0 };
  const nx = nextInteger(tokens, indexRef);
  const ny = nextInteger(tokens, indexRef);
  const d = Array.from({ length: nx }, () => new Float64Array(ny));

  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < ny; j += 1) {
      d[i][j] = nextNumber(tokens, indexRef);
    }
  }

  return { NX: nx, NY: ny, D: d };
}

function runXbendEiload({ II, RAD, XI, DXI, fileName }) {
  const input = [`${scalar(II)}`, `${scalar(RAD)}`, vector(XI), vector(DXI), fileName, ''].join('\n');
  const tokens = resultTokens(runDriver('eiload', input));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
  const result = {
    II: ii,
    MASS: nextNumber(tokens, indexRef),
    MAXX: nextNumber(tokens, indexRef),
    MRSQ: nextNumber(tokens, indexRef),
    LSTRUC: nextInteger(tokens, indexRef) === 1,
  };

  for (const field of ['EIXXB', 'EIYYB', 'EAB', 'GJB', 'EKB', 'MB', 'MXXB', 'XOCG', 'XOSC', 'RSTB']) {
    const values = new Float64Array(ii);
    for (let i = 0; i < ii; i += 1) {
      values[i] = nextNumber(tokens, indexRef);
    }
    result[field] = values;
  }

  return result;
}

function runXbendStclr({ II, TX, TY, TZ, WX, WY, WZ, SHRX, SHRY, SHRZ, MOMX, MOMY, MOMZ }) {
  const input = [
    `${scalar(II)}`,
    vector(padVector(TX, II + 1)),
    vector(padVector(TY, II + 1)),
    vector(padVector(TZ, II + 1)),
    vector(padVector(WX, II + 1)),
    vector(padVector(WY, II + 1)),
    vector(padVector(WZ, II + 1)),
    vector(padVector(SHRX, II + 1)),
    vector(padVector(SHRY, II + 1)),
    vector(padVector(SHRZ, II + 1)),
    vector(padVector(MOMX, II + 1)),
    vector(padVector(MOMY, II + 1)),
    vector(padVector(MOMZ, II + 1)),
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('stclr', input));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
  const result = { II: ii };

  for (const field of XBEND_NODE_FIELDS) {
    const values = new Float64Array(ii + 1);
    for (let i = 0; i < ii + 1; i += 1) {
      values[i] = nextNumber(tokens, indexRef);
    }
    result[field] = values;
  }

  return result;
}

function runXbendMclr({ II, MB, MXXB, EKB }) {
  const input = [
    `${scalar(II)}`,
    vector(padVector(MB, II)),
    vector(padVector(MXXB, II)),
    vector(padVector(EKB, II)),
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('mclr', input));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
  const result = { II: ii };

  for (const field of ['MB', 'MXXB', 'EKB']) {
    const values = new Float64Array(ii);
    for (let i = 0; i < ii; i += 1) {
      values[i] = nextNumber(tokens, indexRef);
    }
    result[field] = values;
  }

  return result;
}

function runXbendStadd({ II, BETA, BETA0, TY }) {
  const input = [
    `${scalar(II)}`,
    vector(padVector(BETA, II)),
    vector(padVector(BETA0, II)),
    vector(padVector(TY, II + 1)),
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('stadd', input));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
  const beta = new Float64Array(ii);
  const tipAngleDeflectionDeg = nextNumber(tokens, indexRef);

  for (let i = 0; i < ii; i += 1) {
    beta[i] = nextNumber(tokens, indexRef);
  }

  return { II: ii, tipAngleDeflectionDeg, BETA: beta };
}

function runXbendStset({ II, BETA, BETA0, TY }) {
  const input = [
    `${scalar(II)}`,
    vector(padVector(BETA, II)),
    vector(padVector(BETA0, II)),
    vector(padVector(TY, II + 1)),
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('stset', input));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
  const beta0 = new Float64Array(ii);
  const tipAngleDeflectionDeg = nextNumber(tokens, indexRef);

  for (let i = 0; i < ii; i += 1) {
    beta0[i] = nextNumber(tokens, indexRef);
  }

  return { II: ii, tipAngleDeflectionDeg, BETA0: beta0 };
}

function runXbendB12sol({ II, A, B, C, R }) {
  const input = [
    `${scalar(II)}`,
    tensor3(A, II, 12, 12),
    tensor3(B, II, 12, 12),
    tensor3(C, II, 12, 12),
    matrix(R, II, 12),
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('b12sol', input));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
  const result = Array.from({ length: ii }, () => new Float64Array(12));

  for (let i = 0; i < ii; i += 1) {
    for (let j = 0; j < 12; j += 1) {
      result[i][j] = nextNumber(tokens, indexRef);
    }
  }

  return { II: ii, R: result };
}

function runXbendStload(state) {
  const tokens = resultTokens(runDriver('stload', xbendStateInput(state)));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
  const result = { II: ii };

  for (const field of ['PX', 'PY', 'PZ', 'MX', 'MY', 'MZ', 'PX_TY', 'PX_TZ', 'PZ_TX', 'PZ_TY', 'PZ_WZ', 'MY_TY', 'MZ_TY', 'MZ_TX', 'MZ_WZ']) {
    const values = new Float64Array(ii);
    for (let i = 0; i < ii; i += 1) {
      values[i] = nextNumber(tokens, indexRef);
    }
    result[field] = values;
  }

  return result;
}

function runXbendStcalc(state) {
  const tokens = resultTokens(runDriver('stcalc', xbendStateInput(state)));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
  const result = {
    II: ii,
    RMS: nextNumber(tokens, indexRef),
    RLX: nextNumber(tokens, indexRef),
  };

  for (const field of XBEND_STATION_FIELDS) {
    const values = new Float64Array(ii);
    for (let i = 0; i < ii; i += 1) {
      values[i] = nextNumber(tokens, indexRef);
    }
    result[field] = values;
  }
  for (const field of XBEND_NODE_FIELDS) {
    const values = new Float64Array(ii + 1);
    for (let i = 0; i < ii + 1; i += 1) {
      values[i] = nextNumber(tokens, indexRef);
    }
    result[field] = values;
  }

  return result;
}

if (require.main === module) {
  compileFortranDriver();
  process.stdout.write(`${path.relative(repoRoot, driverPath)}\n`);
}

module.exports = {
  runBaksub,
  runChklim,
  runClcdcm,
  compileFortranDriver,
  runGauss,
  runDbfoot,
  runCurv,
  runCurvs,
  runD2val,
  runGetaero,
  runGetalf,
  runGetclcdcm,
  runLudcmp,
  runDeval,
  runDsevlin,
  runPutaero,
  runPsplin,
  runPtrace,
  runPtriso,
  runScalit,
  runScalc,
  runSetexp,
  runSetiaero,
  runSeval,
  runSevall,
  runSegspl,
  runSevlin,
  runSortar,
  runSinvrt,
  runSpline,
  runSplina,
  runSplind,
  runSrclin,
  runSrcvel,
  runVorsegvel,
  runVrtxco,
  runSsevlin,
  runSft,
  runInters,
  runNearpt,
  runTrisol,
  runXbendB12sol,
  runXbendEiload,
  runXbendMclr,
  runXbendStadd,
  runXbendStcalc,
  runXbendStclr,
  runXbendStload,
  runXbendStset,
};
