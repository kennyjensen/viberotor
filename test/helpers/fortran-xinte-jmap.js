'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { parseJMAPDump } = require('../../js/xjmap.js');

const repoRoot = path.resolve(__dirname, '..', '..');
const buildDir = path.join(repoRoot, 'build');
const driverPath = path.join(buildDir, 'xinte_jmap_driver');
const lockDir = path.join(buildDir, 'xinte_jmap_driver.lock');
const xinteSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xinte.f');
const xjmapSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xjmap.f');
const xdesiSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xdesi.f');
const xrotorSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xrotor.f');
const xoperSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xoper.f');
const splineSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'spline.f');
const xaeroSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xaero.f');
const xutilsSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xutils.f');
const vortexSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'vortex.f');
const srclinSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'srclin.f');
const driverSource = path.join(repoRoot, 'test', 'fortran', 'xinte_jmap_driver.f');
const coreSource = path.join(buildDir, 'xrotor-core.f');

let tempCounter = 0;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireLock() {
  while (true) {
    try {
      fs.mkdirSync(lockDir);
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
      sleep(50);
    }
  }
}

function releaseLock() {
  try {
    fs.rmdirSync(lockDir);
  } catch {}
}

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
  acquireLock();
  try {
    writeXrotorCore();
    const includeDir = path.join(repoRoot, 'third_party', 'Xrotor', 'src');
    const inputs = [
      xinteSource,
      xjmapSource,
      xdesiSource,
      xrotorSource,
      xoperSource,
      splineSource,
      xaeroSource,
      xutilsSource,
      vortexSource,
      srclinSource,
      driverSource,
      coreSource,
    ];
    if (!needsRebuild(driverPath, inputs)) {
      return driverPath;
    }

    const objects = {
      xinte: path.join(buildDir, 'xinte-core.o'),
      xjmap: path.join(buildDir, 'xjmap-core.o'),
      xdesi: path.join(buildDir, 'xinte-jmap-xdesi.o'),
      xrotor: path.join(buildDir, 'xinte-jmap-xrotor-core.o'),
      xoper: path.join(buildDir, 'xinte-jmap-xoper.o'),
      spline: path.join(buildDir, 'xinte-jmap-spline.o'),
      xaero: path.join(buildDir, 'xinte-jmap-xaero.o'),
      xutils: path.join(buildDir, 'xinte-jmap-xutils.o'),
      vortex: path.join(buildDir, 'xinte-jmap-vortex.o'),
      srclin: path.join(buildDir, 'xinte-jmap-srclin.o'),
      driver: path.join(buildDir, 'xinte-jmap-driver.o'),
    };

    const compile = (source, output, include = false) => {
      const args = ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-ffunction-sections'];
      if (include) {
        args.push('-I', includeDir);
      }
      args.push('-c', source, '-o', output);
      execFileSync('gfortran', args, { cwd: repoRoot, stdio: 'pipe' });
    };

    compile(xinteSource, objects.xinte, true);
    compile(xjmapSource, objects.xjmap, true);
    compile(xdesiSource, objects.xdesi, true);
    compile(coreSource, objects.xrotor, true);
    compile(xoperSource, objects.xoper);
    compile(splineSource, objects.spline);
    compile(xaeroSource, objects.xaero);
    compile(xutilsSource, objects.xutils);
    compile(vortexSource, objects.vortex);
    compile(srclinSource, objects.srclin);
    compile(driverSource, objects.driver, true);

    execFileSync(
      'gfortran',
      [
        '-Wl,--gc-sections',
        objects.xinte,
        objects.xjmap,
        objects.xdesi,
        objects.xrotor,
        objects.xoper,
        objects.spline,
        objects.xaero,
        objects.xutils,
        objects.vortex,
        objects.srclin,
        objects.driver,
        '-o',
        driverPath,
      ],
      { cwd: repoRoot, stdio: 'pipe' },
    );

    return driverPath;
  } finally {
    releaseLock();
  }
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

function tempFilePath(prefix, extension = '.dat') {
  fs.mkdirSync(buildDir, { recursive: true });
  tempCounter += 1;
  return path.join(buildDir, `${prefix}-${process.pid}-${tempCounter}${extension}`);
}

function withTempTextFile(prefix, text, callback) {
  const filePath = tempFilePath(prefix);
  fs.writeFileSync(filePath, text, 'utf8');
  try {
    return callback(filePath);
  } finally {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

function parseInteOutput(output, mode) {
  const tokens = resultTokens(output);
  const indexRef = { index: 0 };
  const nsta = nextInteger(tokens, indexRef);
  const rows = [];
  for (let i = 0; i < nsta; i += 1) {
    if (mode === 'inte1') {
      rows.push({
        rOverR: nextNumber(tokens, indexRef),
        cOverR: nextNumber(tokens, indexRef),
        betaBaseRad: nextNumber(tokens, indexRef),
        CL: nextNumber(tokens, indexRef),
        dynamicPressure: nextNumber(tokens, indexRef),
        aolDeg: nextNumber(tokens, indexRef),
        betmodRad: nextNumber(tokens, indexRef),
        cmodOverR: nextNumber(tokens, indexRef),
      });
    } else {
      rows.push({
        rOverR: nextNumber(tokens, indexRef),
        cOverR: nextNumber(tokens, indexRef),
        betaBaseRad: nextNumber(tokens, indexRef),
        CL: nextNumber(tokens, indexRef),
        dynamicPressure: nextNumber(tokens, indexRef),
        aolDeg: nextNumber(tokens, indexRef),
        xteOverR: nextNumber(tokens, indexRef),
      });
    }
  }
  return rows;
}

function runInte(mode, stations, options = {}) {
  const stationText = stations.map((station) => `${scalar(station.rOverR)} ${scalar(station.aolDeg ?? 0.0)}`).join('\n');
  return withTempTextFile(`xinte-${mode}`, `${stationText}\n`, (stationFile) => {
    const save = Boolean(options.save);
    const outputFile = save ? tempFilePath(`xinte-${mode}-out`) : '';
    try {
      const input = save
        ? `${stationFile}\n${stations.length}\n1\n${outputFile}\n`
        : `${stationFile}\n${stations.length}\n0\n`;
      const output = runDriver(mode, input);
      return {
        rows: parseInteOutput(output, mode),
        text: save ? fs.readFileSync(outputFile, 'utf8') : null,
      };
    } finally {
      if (save && fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
    }
  });
}

function runInte1(stations, options = {}) {
  return runInte('inte1', stations, options);
}

function runInte2(stations, options = {}) {
  return runInte('inte2', stations, options);
}

function runJmap({ rj1, rj2, rjinc, cp1, cp2, cpinc }) {
  const dumpFile = tempFilePath('jmap', '.bin');
  try {
    const input = [
      `${scalar(rj1)} ${scalar(rj2)} ${scalar(rjinc)}`,
      `${scalar(cp1)} ${scalar(cp2)} ${scalar(cpinc)}`,
      dumpFile,
      '',
    ].join('\n');
    const output = runDriver('jmap', input);
    const tokens = resultTokens(output);
    const indexRef = { index: 0 };
    const adv = nextNumber(tokens, indexRef);
    const vel = nextNumber(tokens, indexRef);
    const ii = nextInteger(tokens, indexRef);
    const beta = new Float64Array(ii);
    for (let i = 0; i < ii; i += 1) {
      beta[i] = nextNumber(tokens, indexRef);
    }
    return {
      ADV: adv,
      VEL: vel,
      BETA: beta,
      dump: parseJMAPDump(dumpFile),
    };
  } finally {
    if (fs.existsSync(dumpFile)) {
      fs.unlinkSync(dumpFile);
    }
  }
}

if (require.main === module) {
  compileFortranDriver();
}

module.exports = {
  compileFortranDriver,
  runInte1,
  runInte2,
  runJmap,
};
