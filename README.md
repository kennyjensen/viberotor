# VibeRotor

A browser workbench for [XROTOR](https://web.mit.edu/drela/Public/web/xrotor/), the rotor
design and analysis program created by **Mark Drela** and developed with
**Harold Youngren**. The aerodynamic and acoustic methods come from the original
XROTOR and Xnoise Fortran; VibeRotor provides the browser interface and ports.

The workbench includes a Three.js rotor view, plots, station tables, and a
cancellable solver worker. The default WebAssembly backend is compiled from
the original Fortran, not from the JavaScript port. Both use double precision.
Select JavaScript under **Atmosphere & solver** to compare backends; a WASM
load failure is reported rather than silently switching engines.

## Run

Node.js 20 or newer is required.

```sh
npm ci
npm run dev
```

Open the printed local URL. The development server picks a free port; set `PORT`
to request a specific one. `npm run build` creates a self-contained static site
in `dist/`. Serve that directory over HTTP or HTTPS, not `file://`.

The deployable WASM module is included in `wasm/generated/`, so normal GUI builds
need no numerical compiler. To rebuild it, install `f2c` and Emscripten and run
`npm run build:wasm`. `F2C` and `EMCC` can specify their executable paths. See
[`wasm/README.md`](wasm/README.md) for tool versions, source adaptations, and scope.

## GitHub Pages

The [Pages workflow](.github/workflows/pages.yml) builds and publishes `dist/`
on pushes to `master` and can also be run manually from the Actions tab.

1. In **Settings → Pages**, set **Source** to **GitHub Actions**. GitHub Pages
   requires a public repository or a plan that supports Pages for private repos.
2. Set **Custom domain** to `xrotor.vibefoil.com`. The DNS record should be
   `xrotor.vibefoil.com CNAME kennyjensen.github.io`, with no repository path.
   GitHub recommends verifying the domain in account settings before claiming it.
3. Run the deployment workflow and enable **Enforce HTTPS** once GitHub
   provisions the certificate.

The deployed site includes [the corresponding source archive](https://xrotor.vibefoil.com/viberotor-source.tar.gz).

## Workbench

- Operate a prescribed rotor or design for thrust or shaft power with DESGEN.
- Load any of the six distinct bundled **XROTOR examples** from the **Rotor**
  menu: F1D, EDICS Cruzer, Hydrofoil Air Prop, the FM 10-inch four-blade,
  Ducted Rotor, or Small Windmill.
- Inspect the 3D planform, station data, radial loading, and convergence history.
- Calculate RPM sweeps and Xnoise observer pressure traces and harmonic spectra.
- Save solved cases in browser storage, import/export JSON projects, and export
  station and sweep CSV data.

All inputs use SI units. Pitch is specified at 75% radius for prescribed blades;
designed and imported geometry retains its full radial chord and pitch arrays.
Editing prescribed geometry controls replaces that custom geometry. Design
results can be switched directly to Operate without losing the designed blade.
With a fixed wake, the original design and analysis routines initialize wake
advance differently; a re-analysis can differ slightly from the design target.

The GUI uses XROTOR's default sectional aerodynamic model. The symmetric 12%
thick section in the 3D view is a display mesh, not an airfoil performance model.
The acoustic X coordinate is axial; Y and Z are in the rotor plane. Rotation
animation is illustrative, not real-time RPM. Static/zero-airspeed operation is
not exposed by this GUI. Unconverged results are marked provisional and excluded
from sweep plots.

Example presets read the original blade stations, operating speed, fluid
properties, and duct settings from `third_party/Xrotor/runs`. The legacy
`old-format` files are alternate versions of the same examples, not separate
presets. These are workbench analyses, not full native restart reproductions:
the file's airfoil polars, body inflow, and separate wake-root radius are not
applied. Sidecar files (e.g. structural data or operating case lists) are not loaded.

Project files have `format: "viberotor"`, `version: 1`, and a `config` object.
These JSON projects are not native XROTOR restart files. Saved browser cases are
local to the current browser and origin; export a project for durable storage.

## Verification

The numerical tests require `gfortran` and compile the original Fortran drivers
when needed.

```sh
npm test
npm run test:wasm
node --test --experimental-test-coverage test/*.test.js
npx playwright install chromium
npm run test:ui
```

The browser suite builds the production bundle and owns a temporary HTTP server.
It checks solver output, design roundtrips, files, persistence, cancellation,
both numerical backends, WASM load failure/recovery, responsive layouts, and
rendered WebGL pixels and interaction. Screenshots go to
the ignored `test-results/` directory. `CHROMIUM_PATH` selects an existing browser;
`CHROMIUM_ANGLE` selects its ANGLE backend (default `swiftshader`). Linux browser
system libraries must also be installed. These browser settings affect tests,
not the application.

Numerical comparisons and their limits are recorded in [`PORT_AUDIT.md`](PORT_AUDIT.md).

## License

VibeRotor's code is licensed under **GPL-2.0-or-later**. See [LICENSE](LICENSE)
for the full GPL version 2 text. The original XROTOR and Xnoise code by Mark
Drela and Harold Youngren retains the notices in
[`third_party/Xrotor/src`](third_party/Xrotor/src). The bundled legacy plotting
library has its own [Library GPL terms](third_party/Xrotor/plotlib/GPL-library)
and is not linked into the browser build.

Third-party components retain their own terms, including
[libf2c](third_party/libf2c/Notice), [Emscripten](licenses/Emscripten.txt),
[musl](licenses/musl.txt), Three.js (MIT), and Lucide (ISC, with portions
derived from Feather under MIT). The deployed app's
[License & source page](https://xrotor.vibefoil.com/generated/licenses.html)
links to these notices and the corresponding source archive.
