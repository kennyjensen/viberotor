'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const buildDir = path.join(repoRoot, 'build');
const driverPath = path.join(buildDir, 'xrotor_driver');
const xrotorSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xrotor.f');
const xoperSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xoper.f');
const splineSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'spline.f');
const xaeroSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xaero.f');
const xutilsSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xutils.f');
const vortexSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'vortex.f');
const srclinSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'srclin.f');
const driverSource = path.join(repoRoot, 'test', 'fortran', 'xrotor_driver.f');
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

function matrix(values, rows, cols) {
  const out = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      out.push(scalar(values[row][col]));
    }
  }
  return out.join('\n');
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
  return coreSource;
}

function compileFortranDriver() {
  fs.mkdirSync(buildDir, { recursive: true });
  writeXrotorCore();
  const includeDir = path.join(repoRoot, 'third_party', 'Xrotor', 'src');

  if (!needsRebuild(driverPath, [xrotorSource, xoperSource, splineSource, xaeroSource, xutilsSource, vortexSource, srclinSource, driverSource, coreSource])) {
    return driverPath;
  }

  const xrotorObject = path.join(buildDir, 'xrotor-core.o');
  const xoperObject = path.join(buildDir, 'xrotor-xoper.o');
  const splineObject = path.join(buildDir, 'xrotor-spline.o');
  const xaeroObject = path.join(buildDir, 'xrotor-xaero.o');
  const xutilsObject = path.join(buildDir, 'xrotor-xutils.o');
  const vortexObject = path.join(buildDir, 'xrotor-vortex.o');
  const srclinObject = path.join(buildDir, 'xrotor-srclin.o');
  const driverObject = path.join(buildDir, 'xrotor-driver.o');

  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-ffunction-sections', '-I', includeDir, '-c', coreSource, '-o', xrotorObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-ffunction-sections', '-c', xoperSource, '-o', xoperObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-ffunction-sections', '-c', splineSource, '-o', splineObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-ffunction-sections', '-c', xaeroSource, '-o', xaeroObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-ffunction-sections', '-c', xutilsSource, '-o', xutilsObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-ffunction-sections', '-c', vortexSource, '-o', vortexObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-ffunction-sections', '-c', srclinSource, '-o', srclinObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-ffixed-line-length-none', '-std=legacy', '-I', includeDir, '-c', driverSource, '-o', driverObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-Wl,--gc-sections', xrotorObject, xoperObject, splineObject, xaeroObject, xutilsObject, vortexObject, srclinObject, driverObject, '-o', driverPath], { cwd: repoRoot, stdio: 'pipe' });

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

function runAtmo(alspec) {
  const tokens = resultTokens(runDriver('atmo', `${scalar(alspec)}\n`));
  const indexRef = { index: 0 };
  return {
    VSOALT: nextNumber(tokens, indexRef),
    RHOALT: nextNumber(tokens, indexRef),
    RMUALT: nextNumber(tokens, indexRef),
  };
}

function runSetx(state) {
  const input = [
    `${scalar(state.II)}`,
    `${scalar(state.XI0)}`,
    `${scalar(state.XITIP)}`,
    `${scalar(state.IXSPAC)}`,
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('setx', input));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
  const out = {
    II: ii,
    DT: nextNumber(tokens, indexRef),
    T: new Float64Array(ii),
    XI: new Float64Array(ii),
    DXI: new Float64Array(ii),
    XV: new Float64Array(ii + 1),
  };
  for (let i = 0; i < ii; i += 1) {
    out.T[i] = nextNumber(tokens, indexRef);
  }
  for (let i = 0; i < ii; i += 1) {
    out.XI[i] = nextNumber(tokens, indexRef);
  }
  for (let i = 0; i < ii; i += 1) {
    out.DXI[i] = nextNumber(tokens, indexRef);
  }
  for (let i = 0; i <= ii; i += 1) {
    out.XV[i] = nextNumber(tokens, indexRef);
  }
  return out;
}

function runTinvrt(state, xx) {
  const input = [
    `${scalar(state.II)}`,
    `${scalar(state.XI0)}`,
    `${scalar(state.XITIP)}`,
    `${scalar(state.IXSPAC)}`,
    `${scalar(xx)}`,
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('tinvrt', input));
  return nextNumber(tokens, { index: 0 });
}

function runUvadd(state, xiw) {
  const nadd = state.NADD ?? 0;
  const lines = [
    `${scalar(nadd)}`,
    `${scalar(state.RAD ?? 1.0)}`,
    `${scalar(state.VEL ?? 1.0)}`,
  ];
  if (nadd > 0) {
    lines.push(vector((state.RADD ?? []).slice(0, nadd)));
    lines.push(vector((state.UADD ?? []).slice(0, nadd)));
    lines.push(vector((state.VADD ?? []).slice(0, nadd)));
    lines.push(vector((state.UADDR ?? []).slice(0, nadd)));
    lines.push(vector((state.VADDR ?? []).slice(0, nadd)));
  }
  lines.push(`${scalar(xiw)}`);
  lines.push('');
  const tokens = resultTokens(runDriver('uvadd', lines.join('\n')));
  const indexRef = { index: 0 };
  return {
    WA: nextNumber(tokens, indexRef),
    WT: nextNumber(tokens, indexRef),
  };
}

function runCproj(state) {
  const ii = state.II;
  const input = [
    `${scalar(ii)}`,
    `${scalar(state.ADV)}`,
    vector((state.XI ?? []).slice(0, ii)),
    vector((state.DXI ?? []).slice(0, ii)),
    vector((state.CH ?? []).slice(0, ii)),
    matrix(state.VIND ?? [new Float64Array(ii), new Float64Array(ii), new Float64Array(ii)], 3, ii),
    '',
  ].join('\n');
  const output = runDriver('cproj', input);
  const relevant = output.replace(/RESULT CPROJ[\s\S]*$/, '');
  const parseNamedValue = (name) => {
    const match = relevant.match(new RegExp(`${name}\\s*=\\s*([-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[Ee][+-]?\\d+)?)`, 'i'));
    if (!match) {
      throw new Error(`failed to parse ${name} from CPROJ output:\n${output}`);
    }
    return Number(match[1]);
  };
  return {
    AX0: parseNamedValue('Ax0'),
    AX1: parseNamedValue('Ax1'),
    AT1: parseNamedValue('At1'),
    AT2: parseNamedValue('At2'),
  };
}

function withTempFile(prefix, text, callback) {
  fs.mkdirSync(buildDir, { recursive: true });
  tempCounter += 1;
  const filePath = path.join(buildDir, `${prefix.slice(0, 8)}-${tempCounter}.dat`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  if (text !== null) {
    fs.writeFileSync(filePath, text, 'utf8');
  }
  try {
    return callback(filePath);
  } finally {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

function runGetvel({ text, axialWeight = 1.0, tangentialWeight = 1.0 }) {
  return withTempFile('xrotor-getvel', text, (filePath) => {
    const input = [
      filePath,
      `${scalar(axialWeight)}`,
      `${scalar(tangentialWeight)}`,
      '',
    ].join('\n');
    const tokens = resultTokens(runDriver('getvel', input));
    const indexRef = { index: 0 };
    const nadd = nextInteger(tokens, indexRef);
    const out = {
      NADD: nadd,
      RADD: new Float64Array(nadd),
      UADD: new Float64Array(nadd),
      VADD: new Float64Array(nadd),
      UADDR: new Float64Array(nadd),
      VADDR: new Float64Array(nadd),
    };
    for (let i = 0; i < nadd; i += 1) {
      out.RADD[i] = nextNumber(tokens, indexRef);
    }
    for (let i = 0; i < nadd; i += 1) {
      out.UADD[i] = nextNumber(tokens, indexRef);
    }
    for (let i = 0; i < nadd; i += 1) {
      out.VADD[i] = nextNumber(tokens, indexRef);
    }
    for (let i = 0; i < nadd; i += 1) {
      out.UADDR[i] = nextNumber(tokens, indexRef);
    }
    for (let i = 0; i < nadd; i += 1) {
      out.VADDR[i] = nextNumber(tokens, indexRef);
    }
    return out;
  });
}

function runSavvel(state) {
  const ii = state.II;
  const nadd = state.NADD ?? 0;
  return withTempFile('xrotor-savvel', null, (filePath) => {
    const lines = [
      `${scalar(ii)}`,
      `${scalar(state.RAD)}`,
      `${scalar(state.VEL)}`,
      `${scalar(state.ADV)}`,
      `${scalar(state.ADW)}`,
      `${scalar(state.URDUCT ?? 1.0)}`,
      `${scalar(state.NBLDS)}`,
      `${state.DUCT ? 1 : 0}`,
      `${state.CONV ? 1 : 0}`,
      `${scalar(nadd)}`,
      vector((state.XI ?? []).slice(0, ii)),
      vector((state.GAM ?? []).slice(0, ii)),
      vector((state.UBODY ?? []).slice(0, ii)),
    ];
    if (nadd > 0) {
      lines.push(vector((state.RADD ?? []).slice(0, nadd)));
      lines.push(vector((state.UADD ?? []).slice(0, nadd)));
      lines.push(vector((state.VADD ?? []).slice(0, nadd)));
      lines.push(vector((state.UADDR ?? []).slice(0, nadd)));
      lines.push(vector((state.VADDR ?? []).slice(0, nadd)));
    }
    lines.push(filePath);
    lines.push('');
    runDriver('savvel', lines.join('\n'));
    const text = fs.readFileSync(filePath, 'utf8');
    const rows = text
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.trim().split(/\s+/).map(Number))
      .map(([r, u, v]) => ({ r, u, v }));
    return { text, rows };
  });
}

function runNacell({ state, text = null, fileName = '', constantUbody = 0.0 }) {
  const ii = state.II;
  const execute = (resolvedFile) => {
    const input = [
      resolvedFile,
      `${scalar(constantUbody)}`,
      `${scalar(ii)}`,
      `${scalar(state.RAD)}`,
      `${state.DUCT ? 1 : 0}`,
      `${scalar(state.URDUCT ?? 1.0)}`,
      vector((state.XI ?? []).slice(0, ii)),
      vector((state.DXI ?? []).slice(0, ii)),
      '',
    ].join('\n');
    const tokens = resultTokens(runDriver('nacell', input));
    const indexRef = { index: 0 };
    const outII = nextInteger(tokens, indexRef);
    const out = {
      II: outII,
      XW0: nextNumber(tokens, indexRef),
      UBODY: new Float64Array(outII),
      VBODY: new Float64Array(outII),
      XW: new Float64Array(outII),
      DXW: new Float64Array(outII),
    };
    for (let i = 0; i < outII; i += 1) {
      out.UBODY[i] = nextNumber(tokens, indexRef);
    }
    for (let i = 0; i < outII; i += 1) {
      out.VBODY[i] = nextNumber(tokens, indexRef);
    }
    for (let i = 0; i < outII; i += 1) {
      out.XW[i] = nextNumber(tokens, indexRef);
    }
    for (let i = 0; i < outII; i += 1) {
      out.DXW[i] = nextNumber(tokens, indexRef);
    }
    return out;
  };

  if (text === null) {
    return execute(fileName);
  }
  return withTempFile('xrotor-nacell', text, execute);
}

if (require.main === module) {
  compileFortranDriver();
}

module.exports = {
  compileFortranDriver,
  runAtmo,
  runSetx,
  runTinvrt,
  runUvadd,
  runCproj,
  runGetvel,
  runSavvel,
  runNacell,
};
