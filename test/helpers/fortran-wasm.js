'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { fortranSource, routines } = require('../../scripts/build-wasm.cjs');
const { validate } = require('../../ui/solver.cjs');
const root = path.resolve(__dirname, '../..');
const source = path.join(root, 'third_party/Xrotor/src');

function compile(real8 = true) {
  const build = path.join(root, 'build/wasm-reference-' + (real8 ? 'f64' : 'f32'));
  const binary = path.join(build, 'driver');
  const driver = path.join(root, 'test/fortran/wasm_driver.f');
  const bridge = path.join(root, 'wasm/bridge.f');
  const inputs = [__filename, driver, bridge, path.join(root, 'scripts/build-wasm.cjs'), path.join(source, 'XROTOR.INC'), ...routines.map(name => path.join(source, name + '.f'))];
  if (fs.existsSync(binary) && inputs.every(file => fs.statSync(file).mtimeMs <= fs.statSync(binary).mtimeMs)) return binary;
  fs.mkdirSync(build, { recursive: true });
  const flags = ['-std=legacy', '-O0', '-ffunction-sections', '-fno-fast-math', '-ffp-contract=off', '-I', source];
  if (real8) flags.push('-fdefault-real-8', '-fdefault-double-8');
  const generated = routines.map(name => {
    const file = path.join(build, name + '.f');
    fs.writeFileSync(file, fortranSource(name));
    return file;
  });
  execFileSync('gfortran', [...flags, ...generated, bridge, driver, '-Wl,--gc-sections', '-o', binary], { cwd: build, stdio: 'pipe' });
  return binary;
}

function run(input = {}, { mode = 'operate', observer, real8 = true } = {}) {
  const c = validate(input);
  const values = [c.blades, c.radius, c.hub, c.rootChord, c.tipChord, c.pitch, c.rpm, c.velocity,
    c.density, c.soundSpeed, c.viscosity, c.stations, ['graded', 'potential', 'vortex'].indexOf(c.formulation),
    +c.free, +c.duct, c.ductVelocity, c.iterations, +(c.targetType === 'power'), c.target, c.designCl];
  const lines = [[+(mode === 'design'), c.geometry?.length || 0, +Boolean(observer)], values,
    ...(c.geometry || []).map(row => [row.r, row.chord, row.pitch]),
    [observer?.x ?? 0, observer?.y ?? 0, observer?.z ?? -30, observer?.aoc ?? 0.08]];
  const output = execFileSync(compile(real8), [], { input: lines.map(row => row.join(' ')).join('\n') + '\n', encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const marker = output.lastIndexOf('RESULT WASM');
  if (marker < 0) throw new Error('Missing native Fortran result: ' + output);
  const numbers = output.slice(marker + 11).trim().split(/\s+/).map(Number);
  const count = numbers.shift();
  const take = n => numbers.splice(0, n);
  const result = { summary: take(32), stations: take(11 * c.stations), history: take(3 * count) };
  if (observer) Object.assign(result, { trace: take(162), harmonics: take(120), totals: take(3) });
  if (numbers.length) throw new Error('Unexpected native Fortran output length');
  return result;
}
function runKernel(command, input) {
  const build = path.join(root, 'build/wasm-kernels-f64');
  const binary = path.join(build, 'driver');
  const sources = ['xnoise', 'spline', 'srclin', 'vortex', 'xaero', 'xutils', 'xbend', 'plutil'].map(name => path.join(source, name + '.f'));
  sources.push(path.join(root, 'test/fortran/xnoise_driver.f90'));
  if (!fs.existsSync(binary) || [__filename, ...sources].some(file => fs.statSync(file).mtimeMs > fs.statSync(binary).mtimeMs)) {
    fs.mkdirSync(build, { recursive: true });
    execFileSync('gfortran', ['-std=legacy', '-ffunction-sections', '-ffree-line-length-none', '-fdefault-real-8', '-fdefault-double-8', ...sources, '-Wl,--gc-sections', '-o', binary], { cwd: build, stdio: 'pipe' });
  }
  const output = execFileSync(binary, [command], { input, encoding: 'utf8' });
  const marker = output.lastIndexOf('RESULT');
  if (marker < 0) throw new Error('Missing kernel reference result');
  return output.slice(marker).trim().split(/\s+/).slice(2).map(Number);
}
if (require.main === module) { compile(); compile(false); console.log('Built native Fortran WASM references (f64 and f32).'); }
module.exports = { compile, run, runKernel };
