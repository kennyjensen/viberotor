'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const buildDir = path.join(repoRoot, 'build');
const driverPath = path.join(buildDir, 'xdesi_driver');
const xdesiSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xdesi.f');
const xrotorSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xrotor.f');
const xoperSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xoper.f');
const splineSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'spline.f');
const xaeroSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xaero.f');
const xutilsSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xutils.f');
const vortexSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'vortex.f');
const srclinSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'srclin.f');
const userioSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'userio.f');
const driverSource = path.join(repoRoot, 'test', 'fortran', 'xdesi_driver.f');
const coreSource = path.join(buildDir, 'xrotor-core.f');

function scalar(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return Number(value).toPrecision(17);
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
    xdesiSource,
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
    xdesi: path.join(buildDir, 'xdesi-core.o'),
    xrotor: path.join(buildDir, 'xdesi-xrotor-core.o'),
    xoper: path.join(buildDir, 'xdesi-xoper.o'),
    spline: path.join(buildDir, 'xdesi-spline.o'),
    xaero: path.join(buildDir, 'xdesi-xaero.o'),
    xutils: path.join(buildDir, 'xdesi-xutils.o'),
    vortex: path.join(buildDir, 'xdesi-vortex.o'),
    srclin: path.join(buildDir, 'xdesi-srclin.o'),
    userio: path.join(buildDir, 'xdesi-userio.o'),
    driver: path.join(buildDir, 'xdesi-driver.o'),
  };

  const compile = (source, output, include = false) => {
    const args = ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-ffunction-sections'];
    if (include) {
      args.push('-I', includeDir);
    }
    args.push('-c', source, '-o', output);
    execFileSync('gfortran', args, { cwd: repoRoot, stdio: 'pipe' });
  };

  compile(xdesiSource, objects.xdesi, true);
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
      objects.xdesi,
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

function runDriver(command, input = '') {
  const binary = compileFortranDriver();
  return execFileSync(binary, [command], {
    cwd: repoRoot,
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function parseState(output) {
  const tokens = resultTokens(output);
  const indexRef = { index: 0 };
  const out = {
    CONV: nextInteger(tokens, indexRef) !== 0,
    NBLDS: nextInteger(tokens, indexRef),
    II: nextInteger(tokens, indexRef),
    RAD: nextNumber(tokens, indexRef),
    VEL: nextNumber(tokens, indexRef),
    ADV: nextNumber(tokens, indexRef),
    XI0: nextNumber(tokens, indexRef),
    XW0: nextNumber(tokens, indexRef),
    ADW: nextNumber(tokens, indexRef),
    EFFINV: nextNumber(tokens, indexRef),
    TDES: nextNumber(tokens, indexRef),
    PDES: nextNumber(tokens, indexRef),
    TTOT: nextNumber(tokens, indexRef),
    PTOT: nextNumber(tokens, indexRef),
    RADDES: nextNumber(tokens, indexRef),
    R0DES: nextNumber(tokens, indexRef),
    RWDES: nextNumber(tokens, indexRef),
    VELDES: nextNumber(tokens, indexRef),
    ADVDES: nextNumber(tokens, indexRef),
    RPMDES: nextNumber(tokens, indexRef),
    TDDES: nextNumber(tokens, indexRef),
    PDDES: nextNumber(tokens, indexRef),
    CLDES0: nextNumber(tokens, indexRef),
  };
  for (const field of ['CH', 'BETA', 'BETA0', 'CLDES', 'CL', 'GAM', 'XI', 'DXI', 'XW', 'DXW']) {
    out[field] = new Float64Array(out.II);
    for (let i = 0; i < out.II; i += 1) {
      out[field][i] = nextNumber(tokens, indexRef);
    }
  }
  return out;
}

function runDesgen() {
  return parseState(runDriver('desgen'));
}

function runDesini() {
  return parseState(runDriver('desini'));
}

function runDeiter(icase) {
  return parseState(runDriver('deiter', `${Math.trunc(icase)}\n`));
}

function runDesmil(icase) {
  return parseState(runDriver('desmil', `${Math.trunc(icase)}\n`));
}

function runSetcldLinear(cl1, cl2) {
  return parseState(runDriver('setcld_linear', `${scalar(cl1)} ${scalar(cl2)}\n`));
}

function runSetcldFile(text) {
  const fileName = path.join(buildDir, 'xdesi-setcld.dat');
  fs.writeFileSync(fileName, text, 'utf8');
  return parseState(runDriver('setcld_file', `${fileName}\n`));
}

function runSavcld() {
  const fileName = path.join(buildDir, 'xdesi-savcld.dat');
  try {
    fs.unlinkSync(fileName);
  } catch {}
  runDriver('savcld', `${fileName}\n`);
  return fs.readFileSync(fileName, 'utf8');
}

if (require.main === module) {
  compileFortranDriver();
}

module.exports = {
  compileFortranDriver,
  runDesgen,
  runDesini,
  runDeiter,
  runDesmil,
  runSetcldLinear,
  runSetcldFile,
  runSavcld,
};
