'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repo = path.resolve(__dirname, '../..');
const source = path.join(repo, 'third_party/Xrotor/src');
const loadFields = ['PX', 'PY', 'PZ', 'MX', 'MY', 'MZ', 'PX_TY', 'PX_TZ', 'PZ_TX', 'PZ_TY', 'PZ_WZ', 'MY_TY', 'MZ_TY', 'MZ_TX', 'MZ_WZ'];
const nodeFields = ['TX', 'TY', 'TZ', 'WX', 'WY', 'WZ', 'SHRX', 'SHRY', 'SHRZ', 'MOMX', 'MOMY', 'MOMZ'];
const designFields = ['CH', 'BETA', 'BETA0', 'GAM', 'CL', 'CD', 'CM', 'XW'];
const designSensitivityFields = ['TI_ADW', 'PI_ADW', 'TW_ADW', 'PW_ADW', 'TV_ADW', 'PV_ADW'];

function compileReference(name, routines, driverName, real8 = false) {
  const build = path.join(repo, 'build', name);
  const binary = path.join(build, 'driver');
  const driver = path.join(repo, 'test/fortran', driverName);
  const inputs = [__filename, driver, path.join(source, 'XROTOR.INC'), ...routines.map(r => path.join(source, `${r}.f`))];
  if (fs.existsSync(binary) && inputs.every(file => fs.statSync(file).mtimeMs <= fs.statSync(binary).mtimeMs)) return binary;
  fs.mkdirSync(build, { recursive: true });
  const flags = ['-std=legacy', '-ffunction-sections', '-I', source, '-J', build];
  if (real8) flags.push('-fdefault-real-8', '-fdefault-double-8');
  const objects = [];
  for (const routine of routines) {
    let input = path.join(source, `${routine}.f`);
    if (routine === 'xrotor') {
      const text = fs.readFileSync(input, 'utf8');
      const start = text.search(/^      SUBROUTINE INIT\s*$/m);
      if (start < 0) throw new Error('Cannot locate XROTOR subroutines');
      input = path.join(build, 'xrotor-core.f');
      fs.writeFileSync(input, text.slice(start));
    }
    const object = path.join(build, `${routine}.o`);
    execFileSync('gfortran', [...flags, '-c', input, '-o', object], { cwd: build, stdio: 'pipe' });
    objects.push(object);
  }
  const driverObject = path.join(build, 'driver.o');
  // Isolate module lookup from stale .mod files in the repository root.
  execFileSync('gfortran', [...flags, '-ffree-line-length-none', '-c', driver, '-o', driverObject], { cwd: build, stdio: 'pipe' });
  execFileSync('gfortran', ['-Wl,--gc-sections', ...objects, driverObject, '-o', binary], { cwd: build, stdio: 'pipe' });
  return binary;
}

function compileAuditDriver(real8 = false) {
  return compileReference(real8 ? 'port-audit-real8' : 'port-audit', ['xrotor', 'xoper', 'xbend', 'xdesi', 'spline', 'xaero', 'xutils', 'vortex'], 'port_audit_driver.f', real8);
}

function buildDoubleReference() {
  return compileReference('audit-real8', ['xoper', 'spline', 'xaero', 'xutils', 'vortex'], 'xoper_driver.f90', true);
}

function buildSingleReference() {
  return compileReference('audit-real4', ['xoper', 'spline', 'xaero', 'xutils', 'vortex'], 'xoper_driver.f90');
}

function result(command, args, marker, real8 = false) {
  const output = execFileSync(compileAuditDriver(real8), [command, ...args.map(String)], { cwd: repo, encoding: 'utf8' });
  const index = output.lastIndexOf(marker);
  if (index < 0) throw new Error(`Missing ${marker} in Fortran output: ${output}`);
  return output.slice(index + marker.length).trim().split(/\s+/);
}

function runStructural({ command = 'stload', duct = false, structural = false, added = false } = {}) {
  const values = result(command, [+duct, +structural, +added], 'RESULT STLOAD').map(Number);
  if (values.length !== 122 || !values.every(Number.isFinite)) throw new Error('Invalid structural reference output');
  const out = {};
  let k = 0;
  for (const field of loadFields) out[field] = new Float64Array(4);
  for (let i = 0; i < 4; i += 1) for (const field of loadFields) out[field][i] = values[k++];
  for (const field of nodeFields) out[field] = new Float64Array(5);
  for (let i = 0; i < 5; i += 1) for (const field of nodeFields) out[field][i] = values[k++];
  out.RMS = values[k++];
  out.RLX = values[k++];
  return out;
}

function runDesign(niter = 40, { power = false, wind = false, duct = false, free = true, cl = wind ? -0.35 : 0.6, deff = 0, real8 = false } = {}) {
  const values = result('design', [niter, +power, +wind, +duct, +free, cl, deff], 'RESULT DESIGN', real8);
  if (values.length !== 56 || !['T', 'F'].includes(values[4])) throw new Error('Invalid design reference output');
  const out = { CONV: values[4] === 'T' };
  for (const [i, field] of ['RMS', 'RLX', 'TTOT', 'PTOT'].entries()) {
    out[field] = Number(values[i]);
    if (!Number.isFinite(out[field])) throw new Error(`Nonfinite design reference ${field}`);
  }
  let k = 5;
  for (const field of ['ADW', 'EFFINV', 'TDES', 'PDES']) out[field] = Number(values[k++]);
  for (const field of designFields) out[field] = new Float64Array(5);
  for (let i = 0; i < 5; i += 1) for (const field of designFields) out[field][i] = Number(values[k++]);
  for (const field of designSensitivityFields) out[field] = Number(values[k++]);
  out.DEFF = Number(values[k++]);
  if (!values.every((value, index) => index === 4 || Number.isFinite(Number(value)))) throw new Error('Nonfinite design reference output');
  return out;
}

module.exports = { compileAuditDriver, buildDoubleReference, buildSingleReference, runStructural, runDesign, loadFields, nodeFields, designFields, designSensitivityFields };
