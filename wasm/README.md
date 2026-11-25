# XROTOR WebAssembly backend

The numerical backend is compiled from the original sources in
`third_party/Xrotor/src`, translated with f2c `-r8 -a` and built by Emscripten
with fast-math and floating-point contraction disabled. `bridge.f` exposes
noninteractive configuration, analysis, design, and acoustic results.

Build with `node scripts/build-wasm.cjs`. Set `F2C` and `EMCC` when the tools
are not on PATH. The build keeps generated C under ignored `build/wasm/` and
writes the deployable module and its source-hash manifest to `wasm/generated/`.
Use the manifest to identify the exact inputs and tool versions.

The included artifact was built with f2c 20240504 and Emscripten 3.1.69.
No system-wide compiler installation is needed to use it. `npm run test:wasm`
requires Node and gfortran; the tests compile independent native references in
single and double precision. Generated native and C intermediates are ignored.

The builder makes two explicit changes to generated copies, never to the
original sources: iteration-history callbacks, and zero initialization of
DEITER's uninitialized local GAMDES. The latter matches the JS port's existing
behavior and defines the original duct branch's otherwise undefined storage.
No algebraic simplification or loop reordering is introduced by the bridge.
`runtime.c` adapts the integer-returning string-helper declarations emitted by
f2c to libf2c's void-returning definitions. Numerical routines are unchanged.
COMMON blocks, including spline scratch space, are cleared between solves.

The exposed application API is `createWasmSolver()` in `solver.mjs`, returning
`solve(config, mode)`, `sweep(config, options, progress)`, `noise(config, observer)`,
and `dispose()`. Each instance owns an independent module and memory. Calls on
one instance are synchronous; the GUI runs them in a worker it can terminate.
The `raw` module exposes the Fortran-by-reference ABI for the parity harness;
it is not a validated public input API.

Scope: APER operating analysis, DESGEN thrust/power design, all three wake
formulations, ducted rotors, spline geometry, and the Xnoise acoustic pipeline.
The original interactive menus, plotting system, structural solver, and restart
file interface are not exposed by this WASM adapter. The separate JavaScript
port retains its broader command APIs.

The bundled libf2c runtime was retrieved from
https://netlib.org/f2c/libf2c.zip on 2026-11-24. Archive SHA-256:
`cc84253b47b5c036aa1d529332a6c218a39ff71c76974296262b03776f822695`.
Its license is in `third_party/libf2c/Notice`. XROTOR retains its upstream
GPL-2.0-or-later license; see `COPYING`. Distributions of the binary must also
provide the corresponding source and build scripts from this repository.

Parity results and precision limits are recorded in `PORT_AUDIT.md`.
