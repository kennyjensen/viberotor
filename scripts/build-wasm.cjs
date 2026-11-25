'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'third_party/Xrotor/src');
const runtime = path.join(root, 'third_party/libf2c');
const build = path.join(root, 'build/wasm');
const output = path.join(root, 'wasm/generated');
const f2c = process.env.F2C || 'f2c';
const emcc = process.env.EMCC || 'emcc';
const routines = ['xrotor', 'xoper', 'xdesi', 'xaero', 'spline', 'xutils', 'vortex', 'srclin', 'xnoise', 'userio', 'plutil'];
const kernels = ['trisol', 'ptriso', 'spline', 'psplin', 'seval', 'scalit', 'sft', 'ptrace', 'dbfoot'];
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function run(executable, args, cwd = build) {
  return execFileSync(executable, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
}
function replaceOnce(text, needle, replacement) {
  if (text.split(needle).length !== 2) throw new Error('Source anchor changed: ' + needle);
  return text.replace(needle, replacement);
}
function fortranSource(name) {
    let text = fs.readFileSync(path.join(source, name + '.f'), 'utf8');
    if (name === 'xrotor') {
      const start = text.search(/^      SUBROUTINE INIT\s*$/m);
      if (start < 0) throw new Error('Missing XROTOR subroutine boundary');
      text = text.slice(start);
    }
    if (name === 'xoper' || name === 'xdesi') {
      const anchor = 'C---- display iteration history\n';
      text = replaceOnce(text, anchor, anchor + '      CALL VRHIST(ITER,RMS,RLX)\n');
    }
    if (name === 'xdesi') {
      // Original DEITER reads this local before assignment in the duct branch.
      // Match the JS port's explicit zero initialization, not undefined storage.
      text = replaceOnce(text, '      K1 = II+1\n', '      GAMDES = 0.0\n      K1 = II+1\n');
    }
    return text;
}
function prepareSources() {
  for (const name of routines) {
    fs.writeFileSync(path.join(build, name + '.f'), fortranSource(name));
    run(f2c, ['-r8', '-a', '-E', '-I' + source, name + '.f']);
  }
  fs.copyFileSync(path.join(root, 'wasm/bridge.f'), path.join(build, 'bridge.f'));
  run(f2c, ['-r8', '-a', '-I' + source, 'bridge.f']);
  // f2c owns COMMON declarations; clear them without duplicating their ABI.
  const bridge = path.join(build, 'bridge.c');
  const commons = [...fs.readFileSync(path.join(source, 'XROTOR.INC'), 'utf8').matchAll(/^      COMMON\/(\w+)\//gm)].map(m => m[1].toLowerCase() + (m[1].includes('_') ? '__' : '_'));
  commons.push('vrhist_x__', 'splcom_');
  fs.appendFileSync(bridge, '\n#include <string.h>\nvoid vr_reset(void) {\n' + commons.map(name => '  memset(&' + name + ', 0, sizeof(' + name + '));').join('\n') + '\n}\n');
  for (const name of [...routines, 'bridge']) {
    const file = path.join(build, name + '.c');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/\bs_(copy|cat)\(/g, 'vr_s_$1('));
  }
  for (const name of ['f2c', 'signal1', 'sysdep1']) fs.copyFileSync(path.join(runtime, name + '.h0'), path.join(build, name + '.h'));
}

function main() {
  fs.mkdirSync(build, { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  prepareSources();
  const excluded = new Set(['main.c', 'arithchk.c', 'uninit.c', 'signbit.c']);
  const runtimeSources = fs.readdirSync(runtime).filter(name => name.endsWith('.c') && !excluded.has(name)).sort().map(name => path.join(runtime, name));
  const generated = [...routines, 'bridge'].map(name => path.join(build, name + '.c'));
  const exports = ['_malloc', '_free', '_vr_reset', '_vrsolve_', '_vrnoise_', ...kernels.map(name => '_' + name + '_')];
  const args = [...generated, path.join(root, 'wasm/runtime.c'), ...runtimeSources, '-I' + build, '-I' + runtime,
    '-O2', '-fno-fast-math', '-ffp-contract=off', '-fno-common', '-DNON_UNIX_STDIO', '-DINTEGER_STAR_8',
    '-Wno-deprecated-non-prototype', '-Wno-deprecated-declarations',
    '--no-entry', '-Wl,--fatal-warnings', '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sENVIRONMENT=web,worker,node',
    '-sALLOW_MEMORY_GROWTH=1', '-sSTACK_SIZE=16777216', '-sINITIAL_MEMORY=33554432',
    '-sEXPORTED_FUNCTIONS=' + JSON.stringify(exports), '-sEXPORTED_RUNTIME_METHODS=["HEAPF64","HEAP32"]',
    '-o', path.join(output, 'xrotor.mjs')];
  process.stdout.write('Compiling original XROTOR numerical sources to WASM...\n');
  const log = run(emcc, args);
  if (log) process.stdout.write(log);
  const sources = [__filename, path.join(root, 'wasm/bridge.f'), path.join(root, 'wasm/runtime.c'), path.join(source, 'XROTOR.INC'), ...routines.map(name => path.join(source, name + '.f')), ...fs.readdirSync(runtime).sort().map(name => path.join(runtime, name)).filter(file => fs.statSync(file).isFile())];
  const manifest = {
    precision: 'f64', f2c: fs.readFileSync(path.join(build, 'bridge.c'), 'utf8').match(/version (\d+)/)[1], compiler: run(emcc, ['--version']).split('\n')[0],
    flags: args.filter(arg => arg.startsWith('-')), wasmSha256: sha256(path.join(output, 'xrotor.wasm')),
    sources: Object.fromEntries(sources.map(file => [path.relative(root, file), sha256(file)])),
  };
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  process.stdout.write('Built wasm/generated/xrotor.wasm\n');
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stderr?.toString() || error.message); process.exitCode = 1; }
}
module.exports = { prepareSources, fortranSource, routines, kernels };
