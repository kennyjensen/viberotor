'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const buildDir = path.join(repoRoot, 'build');
const driverPath = path.join(buildDir, 'xoper_driver');
const xoperSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xoper.f');
const splineSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'spline.f');
const xaeroSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xaero.f');
const xutilsSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'xutils.f');
const vortexSource = path.join(repoRoot, 'third_party', 'Xrotor', 'src', 'vortex.f');
const driverSource = path.join(repoRoot, 'test', 'fortran', 'xoper_driver.f90');

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

  if (!needsRebuild(driverPath, [xoperSource, splineSource, xaeroSource, xutilsSource, vortexSource, driverSource])) {
    return driverPath;
  }

  const xoperObject = path.join(buildDir, 'xoper-core.o');
  const splineObject = path.join(buildDir, 'xoper-spline.o');
  const xaeroObject = path.join(buildDir, 'xoper-xaero.o');
  const xutilsObject = path.join(buildDir, 'xoper-xutils.o');
  const vortexObject = path.join(buildDir, 'xoper-vortex.o');
  const driverObject = path.join(buildDir, 'xoper-driver.o');

  execFileSync('gfortran', ['-ffixed-form', '-std=legacy', '-ffunction-sections', '-c', xoperSource, '-o', xoperObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-std=legacy', '-ffunction-sections', '-c', splineSource, '-o', splineObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-std=legacy', '-ffunction-sections', '-c', xaeroSource, '-o', xaeroObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-std=legacy', '-ffunction-sections', '-c', xutilsSource, '-o', xutilsObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-ffixed-form', '-std=legacy', '-ffunction-sections', '-c', vortexSource, '-o', vortexObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-std=f2008', '-ffree-line-length-none', '-I', path.join(repoRoot, 'third_party', 'Xrotor', 'src'), '-J', buildDir, '-c', driverSource, '-o', driverObject], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync('gfortran', ['-Wl,--gc-sections', xoperObject, splineObject, xaeroObject, xutilsObject, vortexObject, driverObject, '-o', driverPath], { cwd: repoRoot, stdio: 'pipe' });

  return driverPath;
}

function runDriver(command, input, binary = compileFortranDriver()) {
  return execFileSync(binary, [command], {
    cwd: repoRoot,
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function xoperStateInput(state) {
  const ii = state.II;
  const naero = state.NAERO ?? 0;
  const nadd = state.NADD ?? 0;
  const lines = [
    `${scalar(ii)}`,
    [
      state.RAD ?? 1.0,
      state.VEL ?? 1.0,
      state.VSO ?? 340.0,
      state.RHO ?? 1.0,
      state.RMU ?? 1.8e-5,
      state.ADV ?? 1.0,
      state.ADW ?? 1.0,
      state.RAKE ?? 0.0,
      state.URDUCT ?? 1.0,
      state.XW0 ?? 0.0,
      state.ADWFCTR ?? 1.0,
    ].map(scalar).join(' '),
    [
      state.NBLDS ?? 2,
      state.DUCT ? 1 : 0,
      state.FAST ? 1 : 0,
      state.FREE ? 1 : 0,
      state.VRTX ? 1 : 0,
      naero,
      nadd,
      state.NITERA ?? 10,
    ].join(' '),
    [
      state.TSPEC ?? 0.0,
      state.PSPEC ?? 0.0,
      state.QSPEC ?? 0.0,
    ].map(scalar).join(' '),
    vector((state.XI ?? []).slice(0, ii)),
    vector((state.DXI ?? []).slice(0, ii)),
    vector((state.XV ?? []).slice(0, ii + 1)),
    vector((state.CH ?? []).slice(0, ii)),
    vector((state.BETA ?? []).slice(0, ii)),
    vector((state.BETA0 ?? []).slice(0, ii)),
    vector((state.UBODY ?? []).slice(0, ii)),
    vector((state.CL ?? []).slice(0, ii)),
    vector((state.CD ?? []).slice(0, ii)),
    vector((state.CM ?? []).slice(0, ii)),
    vector((state.GAM ?? []).slice(0, ii)),
    vector((state.DGAMOLD ?? []).slice(0, ii)),
    intVector((state.IAERO ?? []).slice(0, ii)),
    vector((state.XIAERO ?? []).slice(0, naero)),
  ];

  for (let row = 0; row < 13; row += 1) {
    lines.push(vector(Array.from({ length: naero }, (_, i) => state.AERODATA?.[row]?.[i] ?? 0.0)));
  }

  if (nadd > 0) {
    lines.push(vector((state.RADD ?? []).slice(0, nadd)));
    lines.push(vector((state.UADD ?? []).slice(0, nadd)));
    lines.push(vector((state.VADD ?? []).slice(0, nadd)));
    lines.push(vector((state.UADDR ?? []).slice(0, nadd)));
    lines.push(vector((state.VADDR ?? []).slice(0, nadd)));
  }

  lines.push(tensor3(state.VIND_GAM ?? Array.from({ length: 3 }, () => Array.from({ length: ii }, () => new Float64Array(ii))), 3, ii, ii));
  lines.push(matrix(state.VIND_ADW ?? Array.from({ length: 3 }, () => new Float64Array(ii)), 3, ii));
  const npwrvar = state.NPWRVAR ?? 0;
  lines.push(`${state.LPWRVAR ? 1 : 0} ${npwrvar}`);
  if (npwrvar > 0) {
    for (const field of ['RPMVAR', 'PWRVAR', 'XPWRVAR']) lines.push(vector(state[field].slice(0, npwrvar)));
  }
  lines.push('');
  return lines.join('\n');
}

function runGradmo(state) {
  const tokens = resultTokens(runDriver('gradmo', xoperStateInput(state)));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
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
  return { II: ii, VIND_GAM: vindGam, VIND_ADW: vindAdw };
}

function runHelico(state) {
  const tokens = resultTokens(runDriver('helico', xoperStateInput(state)));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
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
  return { II: ii, VIND_GAM: vindGam, VIND_ADW: vindAdw };
}

function runFilter({ Q, SMLEN, N }) {
  const input = [`${scalar(N)}`, `${scalar(SMLEN)}`, vector(Q), ''].join('\n');
  const tokens = resultTokens(runDriver('filter', input));
  const indexRef = { index: 0 };
  const n = nextInteger(tokens, indexRef);
  const values = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    values[i] = nextNumber(tokens, indexRef);
  }
  return { N: n, Q: values };
}

function runCscalc(state, station) {
  const input = [xoperStateInput(state), `${scalar(station)}`, ''].join('\n');
  const tokens = resultTokens(runDriver('cscalc', input));
  const indexRef = { index: 0 };
  const names = ['UTOT', 'WA', 'WT', 'VT', 'VT_ADW', 'VA', 'VA_ADW', 'VD', 'VD_ADW', 'CI', 'CI_ADV', 'CI_VT', 'SI', 'SI_VA', 'W', 'W_ADV', 'W_VT', 'W_VA', 'PHI', 'P_ADV', 'P_VT', 'P_VA'];
  const out = {};
  for (const name of names) {
    out[name] = nextNumber(tokens, indexRef);
  }
  return out;
}

function runVcalc(state) {
  const tokens = resultTokens(runDriver('vcalc', xoperStateInput(state)));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
  const vind = Array.from({ length: 3 }, () => new Float64Array(ii));
  for (let k = 0; k < 3; k += 1) {
    for (let i = 0; i < ii; i += 1) {
      vind[k][i] = nextNumber(tokens, indexRef);
    }
  }
  return { II: ii, VIND: vind };
}

function runXwinit(state) {
  const tokens = resultTokens(runDriver('xwinit', xoperStateInput(state)));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
  const xw = new Float64Array(ii);
  const dxw = new Float64Array(ii);
  const vwak = new Float64Array(ii);
  const vwAdw = new Float64Array(ii);
  for (let i = 0; i < ii; i += 1) xw[i] = nextNumber(tokens, indexRef);
  for (let i = 0; i < ii; i += 1) dxw[i] = nextNumber(tokens, indexRef);
  for (let i = 0; i < ii; i += 1) vwak[i] = nextNumber(tokens, indexRef);
  for (let i = 0; i < ii; i += 1) vwAdw[i] = nextNumber(tokens, indexRef);
  return { II: ii, XW: xw, DXW: dxw, VWAK: vwak, VW_ADW: vwAdw, XWTIP: nextNumber(tokens, indexRef) };
}

function runSetxw(state) {
  const tokens = resultTokens(runDriver('setxw', xoperStateInput(state)));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
  const fields = {};
  for (const field of ['XW', 'DXW', 'VWAK', 'XW_ADV', 'XW_ADW', 'DXW_ADV', 'DXW_ADW', 'VW_ADV', 'VW_ADW']) {
    const values = new Float64Array(ii);
    for (let i = 0; i < ii; i += 1) {
      values[i] = nextNumber(tokens, indexRef);
    }
    fields[field] = values;
  }
  return { II: ii, XWTIP: nextNumber(tokens, indexRef), ...fields };
}

function runTpq(state, itype) {
  const input = [xoperStateInput(state), `${scalar(itype)}`, ''].join('\n');
  const tokens = resultTokens(runDriver('tpq', input));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
  const out = {};
  for (const name of ['TINV', 'PINV', 'TWAK', 'PWAK', 'TVIS', 'PVIS', 'TTOT', 'PTOT', 'QTOT', 'TI_ADV', 'PI_ADV', 'TW_ADV', 'PW_ADV', 'TV_ADV', 'PV_ADV', 'TV_DBE', 'PV_DBE', 'TI_ADW', 'PI_ADW', 'TW_ADW', 'PW_ADW', 'TV_ADW', 'PV_ADW']) {
    out[name] = nextNumber(tokens, indexRef);
  }
  for (const field of ['CH', 'BETA', 'BETA0', 'CL', 'CD', 'CM', 'RE', 'EFFP', 'DTII', 'DPII', 'DTWI', 'DPWI', 'DTVI', 'DPVI', 'TI_GAM', 'PI_GAM', 'TW_GAM', 'PW_GAM', 'TV_GAM', 'PV_GAM']) {
    const values = new Float64Array(ii);
    for (let i = 0; i < ii; i += 1) {
      values[i] = nextNumber(tokens, indexRef);
    }
    out[field] = values;
  }
  return { II: ii, ...out };
}

function runApinit(state) {
  const tokens = resultTokens(runDriver('apinit', xoperStateInput(state)));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
  const out = { ADW: nextNumber(tokens, indexRef) };
  for (const field of ['GAM', 'CL', 'CD', 'CM']) {
    const values = new Float64Array(ii);
    for (let i = 0; i < ii; i += 1) {
      values[i] = nextNumber(tokens, indexRef);
    }
    out[field] = values;
  }
  return { II: ii, ...out };
}

function runAper(state, ispec, icon, linit, binary) {
  const input = [
    xoperStateInput(state),
    `${scalar(ispec)}`,
    `${scalar(icon)}`,
    `${linit ? 1 : 0}`,
    '',
  ].join('\n');
  const tokens = resultTokens(runDriver('aper', input, binary));
  const indexRef = { index: 0 };
  const ii = nextInteger(tokens, indexRef);
  const out = {
    CONV: nextInteger(tokens, indexRef) !== 0,
    IWTYP: nextInteger(tokens, indexRef),
    ADV: nextNumber(tokens, indexRef),
    ADW: nextNumber(tokens, indexRef),
    DBETA: nextNumber(tokens, indexRef),
    RMS: nextNumber(tokens, indexRef),
    RLX: nextNumber(tokens, indexRef),
    GRESMX: nextNumber(tokens, indexRef),
    FRESMX: nextNumber(tokens, indexRef),
    ARESMX: nextNumber(tokens, indexRef),
    TTOT: nextNumber(tokens, indexRef),
    PTOT: nextNumber(tokens, indexRef),
    QTOT: nextNumber(tokens, indexRef),
    TINV: nextNumber(tokens, indexRef),
    PINV: nextNumber(tokens, indexRef),
    TWAK: nextNumber(tokens, indexRef),
    PWAK: nextNumber(tokens, indexRef),
    TVIS: nextNumber(tokens, indexRef),
    PVIS: nextNumber(tokens, indexRef),
  };
  for (const field of ['BETA', 'BETA0', 'GAM', 'CL', 'CD', 'CM', 'DGAMOLD']) {
    const values = new Float64Array(ii);
    for (let i = 0; i < ii; i += 1) {
      values[i] = nextNumber(tokens, indexRef);
    }
    out[field] = values;
  }
  out.PSPEC = nextNumber(tokens, indexRef);
  return { II: ii, ...out };
}

if (require.main === module) {
  compileFortranDriver();
  process.stdout.write(`${path.relative(repoRoot, driverPath)}\n`);
}

module.exports = {
  compileFortranDriver,
  runGradmo,
  runHelico,
  runFilter,
  runCscalc,
  runVcalc,
  runXwinit,
  runSetxw,
  runTpq,
  runApinit,
  runAper,
};
