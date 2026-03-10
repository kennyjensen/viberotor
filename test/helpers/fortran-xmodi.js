'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const buildDir = path.join(repoRoot, 'build');
const driverPath = path.join(buildDir, 'xmodi_driver');
const xmodiSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xmodi.f');
const modifySource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'modify.f');
const xrotorSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xrotor.f');
const xoperSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xoper.f');
const splineSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'spline.f');
const xaeroSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xaero.f');
const xutilsSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xutils.f');
const vortexSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'vortex.f');
const srclinSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'srclin.f');
const userioSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'userio.f');
const driverSource = path.join(repoRoot, 'test', 'fortran', 'xmodi_driver.f');
const coreSource = path.join(buildDir, 'xrotor-core.f');

function scalar(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return Number(value).toPrecision(17);
}

function vector(values) {
  return Array.from(values, scalar).join('\n');
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
  const inputs = [
    xmodiSource,
    modifySource,
    xrotorSource,
    xoperSource,
    splineSource,
    xaeroSource,
    xutilsSource,
    vortexSource,
    srclinSource,
    userioSource,
    driverSource,
    coreSource,
  ];
  if (!needsRebuild(driverPath, inputs)) {
    return driverPath;
  }

  const objects = {
    xmodi: path.join(buildDir, 'xmodi-core.o'),
    modify: path.join(buildDir, 'xmodi-modify.o'),
    xrotor: path.join(buildDir, 'xmodi-xrotor-core.o'),
    xoper: path.join(buildDir, 'xmodi-xoper.o'),
    spline: path.join(buildDir, 'xmodi-spline.o'),
    xaero: path.join(buildDir, 'xmodi-xaero.o'),
    xutils: path.join(buildDir, 'xmodi-xutils.o'),
    vortex: path.join(buildDir, 'xmodi-vortex.o'),
    srclin: path.join(buildDir, 'xmodi-srclin.o'),
    userio: path.join(buildDir, 'xmodi-userio.o'),
    driver: path.join(buildDir, 'xmodi-driver.o'),
  };

  const compile = (source, output, include = false) => {
    const args = ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-ffunction-sections'];
    if (include) {
      args.push('-I', includeDir);
    }
    args.push('-c', source, '-o', output);
    execFileSync('gfortran', args, { cwd: repoRoot, stdio: 'pipe' });
  };

  compile(xmodiSource, objects.xmodi, true);
  compile(modifySource, objects.modify);
  compile(coreSource, objects.xrotor, true);
  compile(xoperSource, objects.xoper);
  compile(splineSource, objects.spline);
  compile(xaeroSource, objects.xaero);
  compile(xutilsSource, objects.xutils);
  compile(vortexSource, objects.vortex);
  compile(srclinSource, objects.srclin);
  compile(userioSource, objects.userio);
  compile(driverSource, objects.driver, true);

  execFileSync(
    'gfortran',
    [
      '-Wl,--gc-sections',
      objects.xmodi,
      objects.modify,
      objects.xrotor,
      objects.xoper,
      objects.spline,
      objects.xaero,
      objects.xutils,
      objects.vortex,
      objects.srclin,
      objects.userio,
      objects.driver,
      '-o',
      driverPath,
    ],
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

function parseModiState(output) {
  const tokens = resultTokens(output);
  const indexRef = { index: 0 };
  const out = {
    NBLDS: nextInteger(tokens, indexRef),
    II: nextInteger(tokens, indexRef),
    RAD: nextNumber(tokens, indexRef),
    XI0: nextNumber(tokens, indexRef),
    XW0: nextNumber(tokens, indexRef),
    RAKE: nextNumber(tokens, indexRef),
    XPITCH: nextNumber(tokens, indexRef),
    SIZE: nextNumber(tokens, indexRef),
  };
  out.CH = new Float64Array(out.II);
  out.BETA = new Float64Array(out.II);
  out.BETA0 = new Float64Array(out.II);
  out.XI = new Float64Array(out.II);
  out.DXI = new Float64Array(out.II);
  out.XW = new Float64Array(out.II);
  out.DXW = new Float64Array(out.II);
  for (let i = 0; i < out.II; i += 1) out.CH[i] = nextNumber(tokens, indexRef);
  for (let i = 0; i < out.II; i += 1) out.BETA[i] = nextNumber(tokens, indexRef);
  for (let i = 0; i < out.II; i += 1) out.BETA0[i] = nextNumber(tokens, indexRef);
  for (let i = 0; i < out.II; i += 1) out.XI[i] = nextNumber(tokens, indexRef);
  for (let i = 0; i < out.II; i += 1) out.DXI[i] = nextNumber(tokens, indexRef);
  for (let i = 0; i < out.II; i += 1) out.XW[i] = nextNumber(tokens, indexRef);
  for (let i = 0; i < out.II; i += 1) out.DXW[i] = nextNumber(tokens, indexRef);
  return out;
}

function runModiSession(lines) {
  const input = `${lines.join('\n')}\n`;
  return parseModiState(runDriver('modi', input));
}

function runPltmod({ N, X, Y, DYMIN, YLIMS, PLFAC, PLPAR, NSPLT }) {
  const input = [
    String(Math.trunc(N)),
    vector(Array.from(X).slice(0, N)),
    vector(Array.from(Y).slice(0, N)),
    scalar(DYMIN),
    [YLIMS[0], YLIMS[1]].map(scalar).join(' '),
    [PLFAC, PLPAR, Math.trunc(NSPLT)].map(scalar).join(' '),
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('pltmod', input));
  const indexRef = { index: 0 };
  return {
    DYMIN: nextNumber(tokens, indexRef),
    XOFF: nextNumber(tokens, indexRef),
    XSF: nextNumber(tokens, indexRef),
    YOFF: nextNumber(tokens, indexRef),
    YSF: nextNumber(tokens, indexRef),
  };
}

if (require.main === module) {
  compileFortranDriver();
}

module.exports = {
  compileFortranDriver,
  runModiSession,
  runPltmod,
};
