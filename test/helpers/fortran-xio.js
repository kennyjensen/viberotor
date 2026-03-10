'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const buildDir = path.join(repoRoot, 'build');
const driverPath = path.join(buildDir, 'xio_driver');
const xioSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xio.f');
const xrotorSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xrotor.f');
const xoperSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xoper.f');
const splineSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'spline.f');
const xaeroSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xaero.f');
const xutilsSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xutils.f');
const vortexSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'vortex.f');
const srclinSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'srclin.f');
const driverSource = path.join(repoRoot, 'test', 'fortran', 'xio_driver.f');
const coreSource = path.join(buildDir, 'xrotor-core.f');
let tempCounter = 0;

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

function boolInt(value) {
  return value ? 1 : 0;
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

function writeXrotorCore() {
  const source = fs.readFileSync(xrotorSource, 'utf8');
  const lines = source.split(/\r?\n/);
  const core = `${lines.slice(304).join('\n')}\n`;
  if (!fs.existsSync(coreSource) || fs.readFileSync(coreSource, 'utf8') !== core) {
    fs.writeFileSync(coreSource, core, 'utf8');
  }
}

function compileFortranDriver() {
  fs.mkdirSync(buildDir, { recursive: true });
  writeXrotorCore();
  const includeDir = path.join(repoRoot, 'third_party', 'Xrotor', 'src');

  if (!needsRebuild(driverPath, [xioSource, xrotorSource, xoperSource, splineSource, xaeroSource, xutilsSource, vortexSource, srclinSource, driverSource, coreSource])) {
    return driverPath;
  }

  const xioObject = path.join(buildDir, 'xio-core.o');
  const xrotorObject = path.join(buildDir, 'xio-xrotor-core.o');
  const xoperObject = path.join(buildDir, 'xio-xoper.o');
  const splineObject = path.join(buildDir, 'xio-spline.o');
  const xaeroObject = path.join(buildDir, 'xio-xaero.o');
  const xutilsObject = path.join(buildDir, 'xio-xutils.o');
  const vortexObject = path.join(buildDir, 'xio-vortex.o');
  const srclinObject = path.join(buildDir, 'xio-srclin.o');
  const driverObject = path.join(buildDir, 'xio-driver.o');

  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-ffunction-sections', '-I', includeDir, '-c', xioSource, '-o', xioObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-ffunction-sections', '-I', includeDir, '-c', coreSource, '-o', xrotorObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-ffunction-sections', '-c', xoperSource, '-o', xoperObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-ffunction-sections', '-c', splineSource, '-o', splineObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-ffunction-sections', '-c', xaeroSource, '-o', xaeroObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-ffunction-sections', '-c', xutilsSource, '-o', xutilsObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-ffunction-sections', '-c', vortexSource, '-o', vortexObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-ffunction-sections', '-c', srclinSource, '-o', srclinObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-I', includeDir, '-c', driverSource, '-o', driverObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-Wl,--gc-sections', xioObject, xrotorObject, xoperObject, splineObject, xaeroObject, xutilsObject, vortexObject, srclinObject, driverObject, '-o', driverPath], { cwd: repoRoot, stdio: 'pipe' });

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

function shortTempFile(prefix) {
  fs.mkdirSync(buildDir, { recursive: true });
  tempCounter += 1;
  const filePath = path.join(buildDir, `${prefix.slice(0, 8)}-${tempCounter}.dat`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  return filePath;
}

function saveStateInput(state, filePath) {
  const ii = state.II;
  const naero = state.NAERO;
  const nadd = state.NADD ?? 0;
  const lines = [
    `${scalar(state.VERSION ?? 7.55)}`,
    `${boolInt(state.CONV)}`,
    String(state.NAME ?? ''),
    `${scalar(ii)} ${scalar(state.NBLDS)} ${scalar(naero)} ${scalar(nadd)}`,
    [state.RHO, state.VSO, state.RMU, state.ALT ?? 999.0].map(scalar).join(' '),
    [state.RAD, state.VEL, state.ADV, state.ADW, state.RAKE ?? 0.0, state.XI0, state.XW0, state.URDUCT ?? 1.0].map(scalar).join(' '),
    `${boolInt(state.FREE)} ${boolInt(state.DUCT)} ${boolInt(state.WIND)}`,
    vector((state.XI ?? []).slice(0, ii)),
    vector((state.CH ?? []).slice(0, ii)),
    vector((state.BETA0 ?? []).slice(0, ii)),
    vector((state.UBODY ?? []).slice(0, ii)),
    vector((state.XIAERO ?? []).slice(0, naero)),
  ];

  for (let row = 0; row < 13; row += 1) {
    lines.push(vector(Array.from({ length: naero }, (_, i) => state.AERODATA?.[row]?.[i] ?? 0.0)));
  }

  if (nadd > 0) {
    lines.push(vector((state.RADD ?? []).slice(0, nadd)));
    lines.push(vector((state.UADD ?? []).slice(0, nadd)));
    lines.push(vector((state.VADD ?? []).slice(0, nadd)));
  }

  lines.push(filePath);
  lines.push('');
  return lines.join('\n');
}

function parseLoadedState(tokens) {
  const indexRef = { index: 0 };
  const out = {
    CONV: nextInteger(tokens, indexRef) !== 0,
    FREE: nextInteger(tokens, indexRef) !== 0,
    DUCT: nextInteger(tokens, indexRef) !== 0,
    WIND: nextInteger(tokens, indexRef) !== 0,
    LROTOR: nextInteger(tokens, indexRef) !== 0,
    II: nextInteger(tokens, indexRef),
    NBLDS: nextInteger(tokens, indexRef),
    NAERO: nextInteger(tokens, indexRef),
    NADD: nextInteger(tokens, indexRef),
  };

  out.RHO = nextNumber(tokens, indexRef);
  out.VSO = nextNumber(tokens, indexRef);
  out.RMU = nextNumber(tokens, indexRef);
  out.ALT = nextNumber(tokens, indexRef);
  out.RAD = nextNumber(tokens, indexRef);
  out.VEL = nextNumber(tokens, indexRef);
  out.ADV = nextNumber(tokens, indexRef);
  out.RAKE = nextNumber(tokens, indexRef);
  out.XI0 = nextNumber(tokens, indexRef);
  out.XW0 = nextNumber(tokens, indexRef);
  out.URDUCT = nextNumber(tokens, indexRef);
  out.TTOT = nextNumber(tokens, indexRef);
  out.PTOT = nextNumber(tokens, indexRef);
  out.QTOT = nextNumber(tokens, indexRef);
  out.RADDES = nextNumber(tokens, indexRef);
  out.VELDES = nextNumber(tokens, indexRef);
  out.ADVDES = nextNumber(tokens, indexRef);
  out.RPMDES = nextNumber(tokens, indexRef);
  out.R0DES = nextNumber(tokens, indexRef);
  out.RWDES = nextNumber(tokens, indexRef);
  out.TDDES = nextNumber(tokens, indexRef);
  out.PDDES = nextNumber(tokens, indexRef);
  out.CLDES0 = nextNumber(tokens, indexRef);

  const ii = out.II;
  out.XI = new Float64Array(ii);
  out.CH = new Float64Array(ii);
  out.BETA = new Float64Array(ii);
  out.BETA0 = new Float64Array(ii);
  out.UBODY = new Float64Array(ii);
  out.CL = new Float64Array(ii);
  out.CLDES = new Float64Array(ii);
  out.IAERO = new Int32Array(ii);
  for (let i = 0; i < ii; i += 1) out.XI[i] = nextNumber(tokens, indexRef);
  for (let i = 0; i < ii; i += 1) out.CH[i] = nextNumber(tokens, indexRef);
  for (let i = 0; i < ii; i += 1) out.BETA[i] = nextNumber(tokens, indexRef);
  for (let i = 0; i < ii; i += 1) out.BETA0[i] = nextNumber(tokens, indexRef);
  for (let i = 0; i < ii; i += 1) out.UBODY[i] = nextNumber(tokens, indexRef);
  for (let i = 0; i < ii; i += 1) out.CL[i] = nextNumber(tokens, indexRef);
  for (let i = 0; i < ii; i += 1) out.CLDES[i] = nextNumber(tokens, indexRef);
  for (let i = 0; i < ii; i += 1) out.IAERO[i] = nextInteger(tokens, indexRef);

  const naero = out.NAERO;
  out.XIAERO = new Float64Array(naero);
  out.AERODATA = Array.from({ length: 13 }, () => new Float64Array(naero));
  for (let i = 0; i < naero; i += 1) out.XIAERO[i] = nextNumber(tokens, indexRef);
  for (let row = 0; row < 13; row += 1) {
    for (let i = 0; i < naero; i += 1) {
      out.AERODATA[row][i] = nextNumber(tokens, indexRef);
    }
  }

  out.RADD = new Float64Array(out.NADD);
  out.UADD = new Float64Array(out.NADD);
  out.VADD = new Float64Array(out.NADD);
  for (let i = 0; i < out.NADD; i += 1) out.RADD[i] = nextNumber(tokens, indexRef);
  for (let i = 0; i < out.NADD; i += 1) out.UADD[i] = nextNumber(tokens, indexRef);
  for (let i = 0; i < out.NADD; i += 1) out.VADD[i] = nextNumber(tokens, indexRef);

  return out;
}

function withTempTextFile(prefix, text, callback) {
  const filePath = shortTempFile(prefix);
  fs.writeFileSync(filePath, text, 'utf8');
  try {
    return callback(filePath);
  } finally {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

function runSave(state) {
  const filePath = shortTempFile('xsave');
  try {
    runDriver('save', saveStateInput(state, filePath));
    return {
      filePath,
      text: fs.readFileSync(filePath, 'utf8'),
    };
  } finally {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

function runSaveOld(state) {
  const filePath = shortTempFile('xsavold');
  try {
    runDriver('saveold', saveStateInput(state, filePath));
    return {
      filePath,
      text: fs.readFileSync(filePath, 'utf8'),
    };
  } finally {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

function runLoad({ text, initialII = 30, stationAnswer = '' }) {
  return withTempTextFile('xload', text, (filePath) => {
    const input = [filePath, `${scalar(initialII)}`, stationAnswer, ''].join('\n');
    return parseLoadedState(resultTokens(runDriver('load', input)));
  });
}

function runLoadOld({ text, initialII = 30, stationAnswer = '' }) {
  return withTempTextFile('xlodold', text, (filePath) => {
    const input = [filePath, `${scalar(initialII)}`, stationAnswer, ''].join('\n');
    return parseLoadedState(resultTokens(runDriver('loadold', input)));
  });
}

if (require.main === module) {
  compileFortranDriver();
}

module.exports = {
  compileFortranDriver,
  runSave,
  runSaveOld,
  runLoad,
  runLoadOld,
};
