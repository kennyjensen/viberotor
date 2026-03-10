'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const buildDir = path.join(repoRoot, 'build');
const driverPath = path.join(buildDir, 'modify_driver');
const modifySource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'modify.f');
const splineSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'spline.f');
const driverSource = path.join(repoRoot, 'test', 'fortran', 'modify_driver.f');

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

function compileFortranDriver() {
  fs.mkdirSync(buildDir, { recursive: true });
  if (!needsRebuild(driverPath, [modifySource, splineSource, driverSource])) {
    return driverPath;
  }

  const modifyObject = path.join(buildDir, 'modify-core.o');
  const splineObject = path.join(buildDir, 'modify-spline.o');
  const driverObject = path.join(buildDir, 'modify-driver.o');

  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-c', modifySource, '-o', modifyObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-c', splineSource, '-o', splineObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-c', driverSource, '-o', driverObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', [modifyObject, splineObject, driverObject, '-o', driverPath], { cwd: repoRoot, stdio: 'pipe' });

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

function keyCodeOf(event) {
  const key = event?.key ?? event?.kchar ?? event?.char ?? event?.action ?? '';
  if (typeof key === 'number') {
    return Math.trunc(key);
  }
  const text = String(key);
  return text.length === 0 || text === ' ' ? 0 : text.charCodeAt(0);
}

function runSort({ NW, S, W }) {
  const input = [
    String(Math.trunc(NW)),
    vector(Array.from(S).slice(0, NW)),
    vector(Array.from(W).slice(0, NW)),
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('sort', input));
  const indexRef = { index: 0 };
  const out = {
    NW: nextInteger(tokens, indexRef),
    S: null,
    W: null,
  };
  out.S = new Float64Array(out.NW);
  out.W = new Float64Array(out.NW);
  for (let i = 0; i < out.NW; i += 1) {
    out.S[i] = nextNumber(tokens, indexRef);
  }
  for (let i = 0; i < out.NW; i += 1) {
    out.W[i] = nextNumber(tokens, indexRef);
  }
  return out;
}

function runCrsmod({
  N,
  X,
  Y,
  YP,
  XOFF,
  XSF,
  YOFF,
  YSF,
  SSIZ,
  NSPLT,
  LSLOPE,
  events,
}) {
  const lines = [
    String(Math.trunc(N)),
    vector(Array.from(X).slice(0, N)),
    vector(Array.from(Y).slice(0, N)),
    vector(Array.from(YP).slice(0, N)),
    [XOFF, XSF, YOFF, YSF, SSIZ].map(scalar).join(' '),
    String(Math.trunc(NSPLT)),
    LSLOPE ? '1' : '0',
    String(events.length),
  ];

  for (const event of events) {
    lines.push([scalar(event.x), scalar(event.y), String(keyCodeOf(event))].join(' '));
  }
  lines.push('');

  const tokens = resultTokens(runDriver('crsmod', lines.join('\n')));
  const indexRef = { index: 0 };
  const out = {
    IMOD1: nextInteger(tokens, indexRef),
    IMOD2: nextInteger(tokens, indexRef),
    Y: new Float64Array(N),
  };
  for (let i = 0; i < N; i += 1) {
    out.Y[i] = nextNumber(tokens, indexRef);
  }
  return out;
}

if (require.main === module) {
  compileFortranDriver();
}

module.exports = {
  compileFortranDriver,
  runSort,
  runCrsmod,
};
