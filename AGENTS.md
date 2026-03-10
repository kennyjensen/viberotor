# AGENTS

## Scope

This repository is doing a numerically accurate port of Xrotor/Xnoise from the original Fortran sources in `third_party/Xrotor/src` to JavaScript in `js/`.

The current reference implementation and parity harness are centered on:

- `js/xnoise.js`
- `third_party/Xrotor/src/xnoise.f`
- `third_party/Xrotor/src/spline.f`
- `third_party/Xrotor/src/plutil.f`
- `test/fortran/xnoise_driver.f90`
- `test/helpers/fortran-xnoise.js`
- `test/xnoise.test.js`

## Numerical Accuracy Requirements

When porting or modifying numerical code:

- Keep the original function names unless there is a strong reason not to.
- Preserve the original algorithm, loop structure, summation order, indexing behavior, and periodicity handling as closely as possible.
- Prefer `Float64Array` and double-precision JS math for all numerical arrays and derived quantities.
- Do not replace the original algorithm with a “cleaner” or more idiomatic formulation if it changes evaluation order or intermediate rounding behavior.
- Treat helper routines as part of the numerical contract. `TRISOL`, `PTRISO`, `SPLINE`, `PSPLIN`, `SEVAL`, `SCALIT`, `SFT`, `PTRACE`, and `DBFOOT` must remain parity-tested against the original Fortran.
- If a result intentionally differs from the Fortran due to JS double precision versus Fortran single precision, document that explicitly and keep the difference within the established test tolerances.

Numerically sensitive areas in `xnoise` include:

- phase wrapping and low-amplitude harmonics
- periodic spline setup/evaluation
- dB conversion of very small harmonics
- `PTRACE` retarded-time handling
- `PTRACE` Mach clipping branch
- `DBFOOT` symmetry/fallback behavior

## Testing Requirements

Any change to `js/xnoise.js`, the Fortran driver, or the parity helpers must be validated against the original Fortran.

Required commands:

```bash
npm test
node --test --experimental-test-coverage test/*.test.js
```

If the Fortran driver changed directly, also rebuild it explicitly:

```bash
node test/helpers/fortran-xnoise.js --build
```

The JS tests are not optional. Do not rely on inspection alone for numerical changes.

## Parity Rules

The source of truth for numerical behavior is the original Fortran, not a re-derived formula.

When adding or modifying functionality:

- add or update a JS-vs-Fortran parity test whenever the original routine exists in Fortran
- use the driver in `test/fortran/xnoise_driver.f90` instead of reimplementing reference math in JS where practical
- compare phases as wrapped angles, not plain scalar subtraction
- only compare harmonic dB values when the underlying linear harmonic amplitude is significant
- be conservative about changing tolerances; only loosen them when there is a demonstrated precision reason

## Coverage Expectations

`js/xnoise.js` currently has very high test coverage and that should not regress materially.

Current reference coverage from:

```bash
node --test --experimental-test-coverage test/*.test.js
```

is approximately:

- line coverage: `99%+`
- branch coverage: `88%+`
- function coverage: `100%`

If a change reduces coverage, add tests to recover it unless there is a clear reason not to.

## Change Checklist

Before considering work complete on numerical code:

1. Verify the JS path against the original Fortran path.
2. Verify both nominal cases and edge cases for any branch you touched.
3. Keep or improve coverage for the touched area.
4. Record any justified tolerance changes in the test diff or commit/PR notes.

## Non-Numerical Wrapper Functions

`PTITLE`, `CTITLE`, `PTPLOT`, `DBSPLT`, `DBXPLT`, and `DBCPLT` are JS data/metadata wrappers around behavior that originally depended on legacy plotting code.

For these functions:

- preserve the original data meaning and scaling behavior
- test the returned structure directly in JS
- do not introduce visual or plotting-library assumptions into the numerical parity layer
