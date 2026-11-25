'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const reference = require('./helpers/fortran-xnoise.js');
const { runKernel } = require('./helpers/fortran-wasm.js');
let solver;
test.before(async () => {
  reference.compileFortranDriver();
  solver = await (await import('../wasm/solver.mjs')).createWasmSolver();
});
test.after(() => solver?.dispose());
function close(a, b, label, absolute = 2e-6, relative = 2e-6) {
  assert.ok(Math.abs(a - b) <= Math.max(absolute, relative * Math.abs(b)), `${label}: ${a} != ${b}`);
}
function vector(a, b, label, absolute, relative) {
  assert.equal(a.length, b.length);
  a.forEach((value, i) => close(value, b[i], label + '[' + i + ']', absolute, relative));
}
function memory(callback) {
  const m = solver.raw, pointers = [];
  function alloc(input, integer = false) {
    const values = typeof input === 'number' ? [input] : input;
    const stride = integer ? 4 : 8, pointer = m._malloc(values.length * stride);
    assert.ok(pointer);
    pointers.push(pointer);
    (integer ? m.HEAP32 : m.HEAPF64).set(values, pointer / stride);
    return pointer;
  }
  try { callback({ m, f: alloc, i: value => alloc(value, true), read: (p, n) => m.HEAPF64.slice(p / 8, p / 8 + n) }); }
  finally { pointers.forEach(p => m._free(p)); }
}

test('WASM TRISOL and PTRISO retain original Fortran behavior', () => memory(({ m, f, i, read }) => {
  for (const periodic of [false, true]) {
    const input = { KK: 4, A: [4, 4.5, 5, 4.25], B: [1, 0.5, 0.75, 0.6], C: [0.8, 0.7, 0.9, 1.1], D: [1, -0.5, 2, 0.25] };
    const d = f(input.D);
    m[periodic ? '_ptriso_' : '_trisol_'](f(input.A), f(input.B), f(input.C), d, i(4));
    vector(read(d, 4), reference[periodic ? 'runPtriso' : 'runTrisol'](input).D, 'linear solver');
  }
}));

test('WASM SPLINE, SEVAL, and PSPLIN match native Fortran', () => memory(({ m, f, i, read }) => {
  const S = [0, 0.12, 0.35, 0.6, 0.82, 1], X = [0.15, 0.4, -0.2, 0.8, 0.35, 0.5], n = i(6);
  const xp = f(new Float64Array(6)), x = f(X), s = f(S);
  m._spline_(x, xp, s, n);
  const expected = reference.runSpline({ N: 6, X, S }).XS;
  vector(read(xp, 6), expected, 'SPLINE');
  const SS = [-0.05, 0, 0.2, 0.5, 0.9, 1.05];
  const values = reference.runSeval({ N: 6, M: SS.length, X, S, XS: expected, SS }).VALUES;
  vector(SS.map(value => m._seval_(f(value), x, xp, s, n)), values, 'SEVAL');
  const periodic = S.map(t => 0.7 * Math.sin(2 * Math.PI * t) + 0.2 * Math.cos(4 * Math.PI * t));
  periodic[5] = periodic[0];
  m._psplin_(f(periodic), xp, s, n);
  vector(read(xp, 6), reference.runPsplin({ II: 6, X: periodic, S }).XP, 'PSPLIN');
}));

test('WASM SCALIT scalar, vector, and zero-range paths match Fortran', () => memory(({ m, f, i, read }) => {
  for (const [Y, YOFF] of [[[-2, 6, 3.5, -4.5], 1.5], [[12.5], 3], [[2, 2, 2], 2]]) {
    const output = f(0);
    m._scalit_(i(Y.length), f(Y), f(YOFF), output);
    close(read(output, 1)[0], reference.runScalit({ II: Y.length, Y, YOFF }).YSF, 'SCALIT');
  }
}));

test('WASM SFT uses amplitude-gated, wrapped phase comparisons', () => memory(({ m, f, i, read }) => {
  const N = 48, NF = 6, T = Array.from({ length: N + 1 }, (_, k) => k / N);
  for (const phase of [0.2, Math.PI - 1e-5, -Math.PI + 1e-5]) {
    const Y = T.map(t => 0.9 * Math.sin(2 * Math.PI * t + phase) + 0.35 * Math.cos(4 * Math.PI * t - 0.4));
    Y[N] = Y[0];
    const a = f(new Float64Array(NF)), p = f(new Float64Array(NF));
    m._sft_(f(Y), f(T), i(N), a, p, i(NF));
    const ref = reference.runSft({ N, NF, Y, T });
    vector(read(a, NF), ref.FAMPL, 'SFT amplitude');
    read(p, NF).forEach((value, k) => {
      if (ref.FAMPL[k] > 1e-4) close(Math.atan2(Math.sin(value - ref.PHASE[k]), Math.cos(value - ref.PHASE[k])), 0, 'wrapped phase', 5e-3);
    });
  }
}));

const nominal = { NBLDS: 3, II: 4, NT: 40, XOBS: 1.75, YOBS: -2.25, ZOBS: -92,
  ADV: 0.78, RAD: 1.15, VEL: 52, VSO: 339, RHO: 1.225,
  XI: [0.25, 0.5, 0.75, 0.95], DXI: [0.25, 0.25, 0.25, 0.2], AOC: [0.01, 0.011, 0.012, 0.013], CH: [0.12, 0.105, 0.09, 0.075], GAM: [0.02, 0.018, 0.014, 0.01] };
test('WASM PTRACE nominal and Mach-clipping branches match native Fortran', () => memory(({ m, f, i, read }) => {
  const clipped = { NBLDS: 2, II: 3, NT: 20, XOBS: 0, YOBS: 0, ZOBS: -1, ADV: 0.2, RAD: 1, VEL: 100, VSO: 340, RHO: 1.225,
    XI: [0.3, 0.6, 0.9], DXI: [0.3, 0.3, 0.3], AOC: [0.01, 0.01, 0.01], CH: [0.12, 0.1, 0.08], GAM: [0.02, 0.02, 0.01] };
  for (const c of [nominal, clipped]) {
    const p = f(new Float64Array((c.NT + 1) * 3)), t = f(new Float64Array(c.NT + 1));
    m._ptrace_(f(c.XOBS), f(c.YOBS), f(c.ZOBS), i(c.NBLDS), i(c.II), f(c.XI), f(c.DXI), f(c.AOC), f(c.CH), f(c.GAM),
      f(c.ADV), f(c.RAD), f(c.VEL), f(c.VSO), f(c.RHO), i(c.NT), i(c.NT), p, t);
    const ref = reference.runPtrace(c), pres = read(p, (c.NT + 1) * 3);
    vector(read(t, c.NT + 1), ref.TIME, 'PTRACE time', 1e-5, 1e-4);
    for (let j = 0; j < 3; j += 1) vector(pres.slice(j * (c.NT + 1), (j + 1) * (c.NT + 1)), ref.PRES.map(row => row[j]), 'PTRACE pressure', c === clipped ? 10 : 2e-5, c === clipped ? 5e-4 : 2e-4);
  }
}));

test('WASM DBFOOT symmetry and negative-y fallback match original Fortran', () => memory(({ m, f, i, read }) => {
  for (const ys of [[-70, 0, 70], [-90, -50, -10]]) {
    const xs = [-120, -30, 60], NX = 3, NY = 3;
    const c = { ...nominal, NT: 20, NX, NY, GALT: 100, DCLIMB: 5, UNITL: 1, X: xs.map(x => ys.map(() => x)), Y: xs.map(() => ys) };
    const flatten = matrix => ys.flatMap((_, j) => xs.map((_, k) => matrix[k][j]));
    const d = f(new Float64Array(9));
    m._dbfoot_(i(c.NBLDS), i(c.II), f(c.XI), f(c.DXI), f(c.AOC), f(c.CH), f(c.GAM), f(c.ADV), f(c.RAD), f(c.VEL), f(c.VSO), f(c.RHO),
      f(c.GALT), f(c.DCLIMB), f(c.UNITL), i(c.NT), i(NX), i(NY), i(NX), i(NY), f(flatten(c.X)), f(flatten(c.Y)), d);
    const input = [[c.NBLDS, c.II, c.NT, NX, NY], [c.ADV, c.RAD, c.VEL, c.VSO, c.RHO], [c.GALT, c.DCLIMB, c.UNITL],
      ...[c.XI, c.DXI, c.AOC, c.CH, c.GAM, c.X.flat(), c.Y.flat()].map(values => values.join('\n'))].map(row => Array.isArray(row) ? row.join(' ') : row).join('\n') + '\n';
    const double = runKernel('dbfoot', input).slice(2);
    const rows = xs.map((_, k) => double.slice(k * NY, (k + 1) * NY));
    vector(read(d, 9), flatten(rows), 'double-precision DBFOOT', 1e-10, 1e-10);
    // The 5-degree fixture has a 0.000255 dB single-precision cancellation
    // difference. The same original source in f64 passes the tight gate above.
    vector(read(d, 9), flatten(reference.runDbfoot(c).D), 'single-precision DBFOOT', 3e-4, 2e-5);
  }
}));
