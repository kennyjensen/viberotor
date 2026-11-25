# XROTOR Port Audit

Updated: 2026-11-24. Baseline revision: `ce6a7e0`; results below include the
uncommitted audit fixes. Environment: Node v24.16.0, GNU Fortran 15.2.0,
Linux arm64.

## Verdict

The tested JavaScript and WebAssembly numerical paths agree with native
Fortran within the documented precision bounds. The audit found and fixed five
defects that the original 124-test suite did not detect. The expanded suite
passes all 207 tests without skips.

The GUI now runs actual operating, design, sweep, and acoustic calculations in
a worker; its former illustrative formulas have been removed. WebAssembly is
the default backend, with JavaScript explicitly selectable. The new WASM module
is compiled from the original Fortran using f2c and Emscripten, not a wrapper
around the JS solver. Scope and finite-test limits are listed below; this is not
a claim that every original interactive command has been ported to WASM.

## Resolved Defects

1. **P1: Synthetic velocities in production structural loads.**
   `js/xbend.js:defaultCSCALC` previously used station-dependent fixture values,
   ignoring solved induced velocities, body inflow, and duct settings. The
   isolated Fortran structural fixture supplied the same stub, hiding the error.
   One independently linked case produced `PZ=0.028932164237024646` in JS versus
   `0.08001811802387238` in original Fortran, about 64% underprediction.
   The default now calls real `xoper.CSCALC`. Standalone structural state retains
   aerodynamic inputs. The old isolated test explicitly injects its fixture;
   new integration tests link original STLOAD/STCALC, CSCALC, and UVADD together.

2. **P1: Broken top-level command routing.**
   `js/xrotor.js:XROTOR` previously forwarded outer commands such as `OPER` to
   child handlers expecting commands such as `ADVA`. AERO, OPER, and BEND now
   receive their actual subcommands. Existing hook contracts are unchanged.
   Tests now exercise real handlers, including operating solves and structural
   evaluation, rather than only replacing them with hooks.

3. **P1: Missing structural arrays in shared rotor state.**
   `xrotor.createState` did not allocate TX, TY, TZ, stiffness, load, and other
   structural arrays. BEND/CLR failed even when called without the dispatcher.
   Shared state now includes the same structural allocation used by
   `xbend.createState`, with independent Float64Array ownership.

4. **P2: Stale shared design diagnostics.**
   `js/xdesi.js:DEITER` updated RMS, RLX, and DEFF only in local variables/history.
   Fortran stores these in common blocks. A converged case left JS RMS at the
   supplied sentinel 123 and RLX at 0.125. These shared fields now update in
   accordance with Fortran. Tests cover zero iterations, exhaustion, convergence,
   and the original duct branch's retained DEFF convergence condition.

5. **P2: Different TPQ wake-advance sensitivities.**
   `js/xoper.js:TPQ` accumulated TV_ADW and PV_ADW over stations; original
   `xoper.f` assigns them on each station, retaining the last contribution.
   In a ducted windmill initialization, TV_ADW was approximately `-2.02056e-5`
   in JS versus `-2.38254e-6` in double-precision Fortran. Final thrust/power
   could still agree, so tests of totals alone missed this discrepancy.
   JS now preserves the original assignments, even though summation might seem
   more natural. Direct parity tests check all six ADW sensitivities in analysis,
   fixed-CL design, and fixed-chord design, with and without a duct. The expanded
   design comparisons pass the tight double-precision gate after this fix.

No original numerical Fortran sources were changed. Numerical loop order and
formulas were otherwise retained; the new drivers expose reference results and
link original dependencies rather than implementing reference math in JS.

## Verification

| Check | Current Result |
| --- | --- |
| `npm test` | 207 passed, 0 failed, 0 skipped |
| `node --test --experimental-test-coverage test/*.test.js` | 207 passed, 0 failed, 0 skipped |
| `npm run test:wasm` | 11 passed, 0 failed, 0 skipped |
| `npm run build` | Static bundle including WASM and runtime notices |
| `npm run test:ui` | Passed, both backends and failure/recovery paths |
| `node test/helpers/fortran-xnoise.js --build` | Successful |
| `node test/audit-port.js` | 7,862 scalar comparisons, 0 failed probe groups |
| Xnoise line / branch / function coverage | 99.69% / 88.83% / 100% |

Xnoise coverage is unchanged. All eight original drivers were rebuilt from source when the audit
started, after resolving a missing `libgfortran.so.5`. Modified and new drivers
were compiled again for the expanded tests. The audit drivers have isolated
build directories to avoid stale Fortran module files and concurrent test builds
overwriting one another's objects.

The added checks include:

- **Operating sweep:** 22 APER cases across graded momentum, potential, vortex,
  and ducted formulations; fixed/free wakes; and 5, 20, and 50 stations (vortex
  at 5 and 20). All converge. Checks include ADV, ADW, thrust, power, torque,
  and every station's pitch, circulation, lift, drag, and moment coefficient.
- **Operating edge branches:** disabled/exhausted iterations and an engine
  power curve under fixed-RPM and fixed-pitch constraints.
- **Structural integration:** 12 cases covering direct loads, structural solves,
  and operating-to-structural solves; duct/added inflow and rigid/elastic blade
  settings. Tests compare 15 station-load fields and 12 node fields, plus
  structural convergence diagnostics. A separate case checks standalone state.
- **Design sweep:** 16 thrust/power, propeller/windmill, duct/free-tip, and
  fixed/free-wake combinations, plus 8 deliberately stalled windmill cases.
  Both Fortran precisions converge and agree on totals, blade distributions,
  diagnostics, and ADW sensitivities. Nominal windmills use CL=-0.35. Stalled
  cases use CL=-0.6 and deliberately bypass DESGEN's input guard to test DEITER.
- **Shared-state and dispatch regressions:** real child commands, copied-array
  ownership, and converged/nonconverged design diagnostic state.

Existing tests cover spline and linear-system helpers, source/vortex velocities,
airfoil polars, geometry modification, restart I/O, radial interpolation,
performance maps, design, and noise. All 123 named routines in the 15
corresponding Fortran modules have JS exports; this inventory is not itself
evidence of equivalent behavior.

Xnoise source review covered retarded time, Mach clipping, periodic splines,
summation order, Fourier transforms, and footprint symmetry/fallback. TRISOL,
PTRISO, SPLINE, PSPLIN, SEVAL, SCALIT, SFT, PTRACE, and DBFOOT remain parity-tested.
Noise tests use wrapped phase differences and amplitude gates for low-level
harmonic comparisons. Plotting/data wrappers retain direct JS structure tests.

## WASM and GUI Verification

`wasm/generated/xrotor.wasm` is built with f2c 20240504, Emscripten 3.1.69,
`-r8`, `-fno-fast-math`, and `-ffp-contract=off`. Its manifest records compiler
flags, source hashes, and the binary hash. Both tests and the GUI build reject
stale numerical artifacts. Original source files remain unchanged.

Generated copies add iteration-history callbacks and initialize DEITER's
otherwise uninitialized local GAMDES to zero, matching the JS port. Native
bridge references use these same documented adaptations, compiled independently
by gfortran in REAL*4 and REAL*8. The separate kernel references compile the
unmodified original source. C wrappers adapt string-helper ABI return types;
they do not implement numerical routines.

- Eleven operating configurations cover all three wake formulations, free and
  fixed wakes, ducting, 5 through 80 stations, changed RPM/blade count, and
  iteration exhaustion. Tests compare dimensional summaries, every station,
  convergence state, and double-precision iteration history.
- Six design configurations cover thrust, power, free/fixed wakes, ducts, and
  iteration exhaustion. Designed geometry is re-opened and compared against
  native Fortran analysis. Fixed-wake design and analysis initialize wake
  advance differently in the original algorithm, so a design target need not
  reproduce exactly on re-analysis; that behavior is preserved, not hidden.
- Three observers compare complete acoustic traces, total SPL, blade-passage
  frequency, and significant harmonic levels. Raw helper tests cover TRISOL,
  PTRISO, SPLINE, PSPLIN, SEVAL, SCALIT, SFT, PTRACE (including Mach clipping),
  and DBFOOT symmetry and negative-y fallback. Phase comparisons wrap angles.
- Repeated mixed solves and independent module instances check COMMON reset,
  stable memory size, sweeps, invalid input, nonconvergence, and disposal.
- Browser checks load the real WASM binary, verify outputs and CSV data,
  exercise design roundtrips, files, saved cases, cancel/restart, sweeps,
  acoustics, explicit JS selection, and failed-WASM-load recovery. Screenshots,
  layout assertions, and WebGL pixel/interaction checks cover 320, 390, 768,
  1024, 1440, and 1920 pixel widths, plus a short mobile viewport.

WASM application results and histories pass a `1e-9` absolute/relative gate
against double-precision Fortran. Single-precision application comparisons use
`5e-5`; TNACEL gets a separate absolute cancellation bound of
`3e-7 * rho * V^2 * R^2`, because it subtracts almost equal thrust terms before
dimensional scaling. The new 5-degree DBFOOT fixture differs by about
`0.000255 dB` in single precision (bound `0.0003 dB`), while the identical
source compiled in double precision passes `1e-10`. Existing JS tolerances
were not changed for these additions.

## Precision Bounds

The operating sweep's original single-precision Fortran differs by at most
`3.858698950143236e-6`; all strict 1e-6 excesses are lift coefficients in nine
cases. Compiling the same original sources with `-fdefault-real-8
-fdefault-double-8` reduces the maximum difference to
`4.3298697960381105e-15`. The sweep uses the existing airfoil tests' 5e-6 absolute
CL bound only. All other operating outputs retain 1e-6 absolute/relative limits;
the double reference uses 1e-10. The audit still reports the strict single-
precision excesses rather than hiding them.

Nominal design outputs retain the existing 4e-6 absolute/relative limits.
The new deliberately stalled cases show single-precision inverse-lift
sensitivity of about 6.39e-6 radians in pitch and 2.47e-5 in CD. Only those new
cases use 7e-6 absolute bounds for BETA/BETA0 and 3e-5 for CD. Other fields stay
at 4e-6. Every nominal and stalled design case also passes the original-source
double-precision reference at 1e-10, including ADW sensitivities. Existing tests'
tolerances were not loosened. Structural comparisons retain their existing
5e-5 absolute / 5e-6 relative solver bounds.

## Reproduction

GNU Fortran and Node are required. From the repository root:

```bash
node test/helpers/fortran-xnoise.js --build
node test/helpers/fortran-wasm.js
npm test
node --test --experimental-test-coverage test/*.test.js
node test/audit-port.js
npm run test:ui
```

The expanded parity suites are part of normal `npm test`, not merely a separate
audit command. `test/audit-port.js` additionally emits machine-readable JSON
comparisons and exits nonzero on failed numerical or integration probes.
`test/fortran/port_audit_driver.f` links original structural and design routines.
`test/fortran/xoper_driver.f90` exposes power-curve and sensitivity outputs.

## Remaining Limits

- WASM exposes the GUI's operating/design/acoustic paths and nine helper
  routines. Structural analysis, legacy interactive menus/plotting, and native
  restart-file handling are not exposed by this WASM adapter.
- Finite tests do not certify every parameter extreme, iteration history, or
  compiler. The WASM build explicitly defines GAMDES initialization as described
  above; the original source's uninitialized behavior is not portable.
- Legacy plotting/interactive I/O is represented by structured wrappers and
  hooks, not by a pixel-identical recreation of the original application.

The numerical evidence supports the tested JS/WASM paths and documents their
precision effects and adapter scope. Finite parity tests are not a certification
of all physical operating conditions or a replacement for engineering validation.
