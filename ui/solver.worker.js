import jsSolver from './solver.cjs';
import { createWasmSolver } from '../wasm/solver.mjs';

let wasm;
self.onmessage = async ({ data }) => {
  const { id, action, config, options, backend = 'wasm' } = data;
  try {
    if (!['wasm', 'js'].includes(backend)) throw new Error('Unknown numerical backend.');
    const solver = action === 'validate' || backend === 'js' ? jsSolver : await (wasm ||= createWasmSolver().catch(error => {
      wasm = undefined;
      throw new Error('WASM could not load. Retry or select JavaScript in Atmosphere & solver. ' + error.message);
    }));
    let result;
    if (action === 'sweep') result = solver.sweep(config, options, progress => self.postMessage({ id, progress }));
    else if (action === 'noise') result = solver.noise(config, options);
    else if (action === 'validate') result = solver.validate(config);
    else if (action === 'operate' || action === 'design') result = solver.solve(config, action);
    else throw new Error('Unknown solver action.');
    self.postMessage({ id, result, backend });
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
