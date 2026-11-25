import jsSolver from '../ui/solver.cjs';

const summaryFields = ['NBLDS', 'RAD', 'ADV', 'TDIM', 'PDIM', 'QDIM', 'EFFTOT', 'VEL', 'RPM', 'EFFIND', 'EIDEAL', 'TC', 'TNACEL', 'HUB_RADIUS', 'XW0_RADIUS', 'TVDIM', 'PVDIM', 'RHO', 'VSO', 'RMU', 'SIGMA', 'CT', 'CP', 'J', 'PC'];
const stationFields = ['r', 'chord', 'pitch', 'cl', 'cd', 'circulation', 'mach', 'reynolds', 'axial', 'stalled'];

export async function createWasmSolver(options = {}) {
  const { default: createModule } = await import(new URL('./generated/xrotor.mjs', import.meta.url).href);
  const messages = [];
  const module = await createModule({ ...options, print: text => messages.push(text), printErr: text => messages.push(text) });
  const allocated = [];
  let disposed = false;
  const alloc = bytes => {
    const address = module._malloc(bytes);
    if (!address) throw new Error('Unable to allocate WASM solver memory.');
    allocated.push(address);
    return address;
  };
  const configPtr = alloc(20 * 8), geometryPtr = alloc(300 * 8);
  const integerPtr = alloc(3 * 4), summaryPtr = alloc(32 * 8);
  const stationsPtr = alloc(1100 * 8), historyPtr = alloc(450 * 8);
  const observerPtr = alloc(4 * 8), tracePtr = alloc(162 * 8), harmonicsPtr = alloc(120 * 8), totalsPtr = alloc(3 * 8);
  const read = (pointer, count) => module.HEAPF64.slice(pointer / 8, pointer / 8 + count);

  function solve(input, mode = 'operate') {
    if (disposed) throw new Error('WASM solver has been disposed.');
    if (!['operate', 'design'].includes(mode)) throw new Error('Unknown solver mode.');
    const start = performance.now();
    const c = jsSolver.validate(input);
    messages.length = 0;
    module._vr_reset();
    module.HEAPF64.set([c.blades, c.radius, c.hub, c.rootChord, c.tipChord, c.pitch, c.rpm, c.velocity,
      c.density, c.soundSpeed, c.viscosity, c.stations, ['graded', 'potential', 'vortex'].indexOf(c.formulation),
      +c.free, +c.duct, c.ductVelocity, c.iterations, +(c.targetType === 'power'), c.target, c.designCl], configPtr / 8);
    const geometry = new Float64Array(300);
    c.geometry?.forEach((row, i) => { geometry[i] = row.r; geometry[i + 100] = row.chord; geometry[i + 200] = row.pitch; });
    module.HEAPF64.set(geometry, geometryPtr / 8);
    module.HEAP32.set([c.geometry?.length || 0, +(mode === 'design'), 0], integerPtr / 4);
    module._vrsolve_(configPtr, geometryPtr, integerPtr, integerPtr + 4, summaryPtr, stationsPtr, historyPtr, integerPtr + 8);
    const count = module.HEAP32[(integerPtr + 8) / 4];
    if (count < 0) throw new Error('Interpolated chord must be positive.');
    const raw = read(summaryPtr, 32);
    const values = read(stationsPtr, 11 * c.stations);
    if (!raw.every(Number.isFinite) || !values.every(Number.isFinite)) throw new Error('The WASM solver produced a non-finite result. Check the geometry and operating conditions.');
    const summary = Object.fromEntries(summaryFields.map((key, i) => [key, raw[i]]));
    const stations = Array.from({ length: c.stations }, (_, i) => Object.fromEntries(stationFields.map((key, j) => [key, key === 'stalled' ? Boolean(values[i * 11 + j]) : values[i * 11 + j]])));
    const residuals = read(historyPtr, 3 * count);
    const history = Array.from({ length: count }, (_, i) => ({ ITER: residuals[3 * i], RMS: residuals[3 * i + 1], RLX: residuals[3 * i + 2] }));
    const formulation = raw[27] === 2 ? 'Potential' : raw[27] === 3 ? 'Vortex Wake' : 'Graded Momentum';
    return {
      config: c, summary, stations, history, converged: Boolean(raw[26]), rms: raw[25], elapsed: performance.now() - start,
      model: (c.duct ? 'Ducted ' : 'Free Tip ') + formulation,
      stalled: stations.filter(s => s.stalled).length,
      geometry: stations.map(({ r, chord, pitch }) => ({ r, chord, pitch })),
    };
  }

  function sweep(input, options = {}, progress = () => {}) {
    const c = jsSolver.validate(input);
    const from = Number(options.from ?? c.rpm * 0.7), to = Number(options.to ?? c.rpm * 1.3);
    const count = Number(options.count ?? 9);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 10 || to > 30000 || to <= from || !Number.isInteger(count) || count < 3 || count > 31) throw new Error('Enter an increasing RPM range and 3 to 31 points.');
    const points = [];
    for (let i = 0; i < count; i += 1) {
      const rpm = from + (to - from) * i / (count - 1);
      try {
        const result = solve({ ...c, rpm });
        points.push({ rpm, converged: result.converged, thrust: result.summary.TDIM, power: result.summary.PDIM, efficiency: result.summary.EFFTOT });
      } catch (error) { points.push({ rpm, converged: false, error: error.message }); }
      progress({ completed: i + 1, total: count });
    }
    return points;
  }

  function noise(input, observer = {}) {
    const result = solve(input);
    if (!result.converged) throw new Error('Noise requires a converged operating point.');
    const position = [observer.x ?? 0, observer.y ?? 0, observer.z ?? -30].map(Number);
    if (!position.every(Number.isFinite) || Math.hypot(...position) < 2 * result.config.radius) throw new Error('Place the observer at least one rotor diameter from the hub.');
    const aoc = Number(observer.aoc ?? 0.08);
    if (!Number.isFinite(aoc) || aoc < 0 || aoc > 0.4) throw new Error('Section area / chord squared must be between 0 and 0.4.');
    module.HEAPF64.set([...position, aoc], observerPtr / 8);
    messages.length = 0;
    module._vrnoise_(observerPtr, tracePtr, harmonicsPtr, totalsPtr);
    const trace = read(tracePtr, 162), harmonics = read(harmonicsPtr, 120), totals = read(totalsPtr, 3);
    if (!trace.every(Number.isFinite)) throw new Error('The WASM acoustic trace is non-finite. Check the observer position.');
    return {
      spl: Number.isFinite(totals[1]) ? totals[1] : null, bpf: totals[2],
      time: Array.from(trace.slice(0, 81)), pressure: Array.from(trace.slice(81)),
      warnings: messages.filter(line => /WARNING|out of spline range/.test(line)),
      harmonics: Array.from({ length: 20 }, (_, i) => ({ frequency: totals[2] * (i + 1), db: Number.isFinite(harmonics[80 + i]) ? harmonics[80 + i] : null })),
    };
  }

  return {
    solve, sweep, noise, validate: jsSolver.validate,
    // The low-level Fortran ABI is available for parity tests of shared helpers.
    raw: module,
    dispose() { if (!disposed) { allocated.forEach(pointer => module._free(pointer)); disposed = true; } },
  };
}
