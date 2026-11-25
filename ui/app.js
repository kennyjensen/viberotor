import {
  createIcons, FolderOpen, Save, RotateCcw, Fan, Gauge, Wind, ChevronDown,
  Play, Square, Box, ChartNoAxesCombined, AudioLines, Scan, PanelLeft,
  Maximize, RotateCw, Grid3x3, Download, LoaderCircle, Plus, X, Check, AlertTriangle,
} from 'lucide';
import defaults from './config.cjs';
import examples from './examples.js';
import { Plot } from './plots.js';
import { RotorView } from './rotor-view.js';

const $ = id => document.getElementById(id);
const all = selector => [...document.querySelectorAll(selector)];
const icons = { FolderOpen, Save, RotateCcw, Fan, Gauge, Wind, ChevronDown,
  Play, Square, Box, ChartNoAxesCombined, AudioLines, Scan, PanelLeft,
  Maximize, RotateCw, Grid3x3, Download, LoaderCircle, Plus, X, Check, AlertTriangle };
const icon = name => {
  const node = document.createElement('i');
  node.dataset.lucide = name;
  return node;
};
const refreshIcons = () => createIcons({ icons });
const form = $('rotorForm');
const presets = {
  baseline: defaults,
  two: { ...defaults, name: 'Two-blade propeller', blades: 2, radius: 0.9, rootChord: 0.18, tipChord: 0.09, pitch: 28, rpm: 1500, velocity: 45, target: 400 },
  compact: { ...defaults, name: 'Compact propeller', blades: 2, radius: 0.3, rootChord: 0.065, tipChord: 0.025, pitch: 25, rpm: 4500, velocity: 35, target: 50 },
};
const exampleGroup = document.createElement('optgroup');
exampleGroup.label = 'XROTOR examples';
for (const [id, { label }] of Object.entries(examples)) exampleGroup.append(new Option(label, id));
$('preset').append(exampleGroup);
let mode = 'operate';
let geometry;
let lastResult;
let sweepPoints;
let dirty = true;
let busy = false;
let worker;
let pending;
let sequence = 0;
let cases = [];
const storageKey = 'viberotor.cases.v1';
const plots = {
  loading: new Plot($('loadingChart'), { xMin: 0.2, xMax: 1, zero: true }),
  geometry: new Plot($('geometryChart'), { color: '#79b9d5', xMin: 0.2, xMax: 1 }),
  history: new Plot($('historyChart'), { xLabel: 'Iteration', log: true }),
  sweepThrust: new Plot($('sweepThrust'), { xLabel: 'rpm', zero: true }),
  sweepEfficiency: new Plot($('sweepEfficiency'), { xLabel: 'rpm', color: '#79b9d5' }),
  spectrum: new Plot($('noiseSpectrum'), { xLabel: 'Hz', color: '#dfb578', bars: true }),
  trace: new Plot($('noiseTrace'), { xLabel: 'ms', color: '#79b9d5' }),
};
let rotor;
try { rotor = new RotorView($('rotorScene')); }
catch (error) {
  $('webglFallback').hidden = false;
  all('.scene-tools button').forEach(button => { button.disabled = true; });
  console.warn('3D renderer unavailable:', error.message);
}

function message(text, kind = '') {
  $('message').className = 'message-bar' + (kind ? ' ' + kind : '');
  const label = document.createElement('span');
  label.textContent = text;
  $('message').replaceChildren(icon(kind === 'error' || kind === 'warning' ? 'alert-triangle' : busy ? 'loader-circle' : 'check'), label);
  if (busy) {
    const cancel = document.createElement('button');
    cancel.className = 'icon-button';
    cancel.title = 'Cancel calculation';
    cancel.setAttribute('aria-label', 'Cancel calculation');
    cancel.append(icon('square'));
    cancel.addEventListener('click', () => cancelTask());
    $('message').append(cancel);
  }
  refreshIcons();
}
function status(text, type = '') {
  $('solutionStatus').textContent = text;
  $('solutionStatus').className = 'status-badge ' + type;
}
function setBusy(value) {
  busy = value;
  document.body.classList.toggle('busy', value);
  all('#rotorForm input, #rotorForm select, #rotorForm button:not(#cancel), #sweepForm input, #noiseForm input, #runSweep, #runNoise, #openFile, #reset, [data-mode], .case-row button').forEach(el => { el.disabled = value; });
  $('cancel').hidden = !value;
  $('saveCase').disabled = value || dirty || !lastResult?.converged;
  $('saveFile').disabled = value;
}
function newWorker() {
  worker = new Worker(new URL('./solver.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (!pending || data.id !== pending.id) return;
    if (data.progress) { pending.progress?.(data.progress); return; }
    const task = pending;
    pending = null;
    clearTimeout(task.timeout);
    if (data.error) task.reject(new Error(data.error)); else task.resolve(data.result);
  };
  worker.onerror = event => {
    event.preventDefault();
    if (pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(event.message || 'The solver worker could not start.'));
      pending = null;
    }
    worker.terminate();
    worker = undefined;
  };
}
function request(action, config, options, progress) {
  if (pending) return Promise.reject(new Error('A calculation is already running.'));
  if (!worker) newWorker();
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => cancelTask('Calculation timed out. Reduce the station count or iteration limit.'), 90000);
    pending = { id, resolve, reject, progress, timeout };
    worker.postMessage({ id, action, config, options, backend: $('backend').value });
  });
}
function cancelTask(reason = 'Calculation cancelled.') {
  if (!pending) return;
  clearTimeout(pending.timeout);
  pending.reject(new Error(reason));
  pending = null;
  worker.terminate();
  newWorker();
}
async function task(label, action, config, options, onResult, onProgress) {
  if (busy) return;
  setBusy(true);
  message(label);
  try {
    const result = await request(action, config, options, onProgress);
    setBusy(false);
    onResult(result);
  } catch (error) {
    setBusy(false);
    message(error.message, 'error');
    if (action === 'operate' || action === 'design') status('Not solved', 'warning');
    if (action === 'sweep') $('sweepStatus').textContent = error.message;
    if (action === 'noise') $('noiseStatus').textContent = error.message;
  }
}
function readConfig() {
  const c = {};
  for (const [key, value] of Object.entries(defaults)) {
    const field = form.elements.namedItem(key);
    c[key] = typeof value === 'boolean' ? field.checked : typeof value === 'number' ? Number(field.value) : field.value;
  }
  if (geometry) c.geometry = geometry;
  return c;
}
function applyConfig(c, preset = 'custom') {
  geometry = c.geometry;
  for (const [key, fallback] of Object.entries(defaults)) {
    const field = form.elements.namedItem(key);
    const value = c[key] ?? fallback;
    if (field.tagName === 'SELECT' && ![...field.options].some(option => option.value === String(value))) field.add(new Option(String(value), String(value)));
    if (typeof fallback === 'boolean') field.checked = value;
    else field.value = value;
  }
  $('preset').value = preset;
  syncControls();
  markDirty();
  preview();
}
function syncControls() {
  $('exampleNote').hidden = !examples[$('preset').value];
  $('pitchRange').value = form.elements.pitch.value;
  $('ductField').hidden = !form.elements.duct.checked;
  $('targetUnit').textContent = form.elements.targetType.value === 'thrust' ? 'N' : 'W';
  $('geometryBadge').hidden = !geometry;
  $('geometryBadge').textContent = 'Custom';
  $('headerName').textContent = form.elements.name.value || 'Untitled rotor';
  $('sceneGeometry').textContent = geometry ? 'Custom geometry' : 'Prescribed';
}
function markDirty() {
  $('engineLabel').textContent = ($('backend').value === 'wasm' ? 'WASM' : 'JS') + ' / FLOAT64';
  dirty = true;
  $('dirtyTag').hidden = false;
  $('saveCase').disabled = true;
  $('exportCsv').disabled = true;
  invalidateAnalyses();
  status(lastResult ? 'Modified' : 'Not solved', 'warning');
  $('footerState').textContent = 'Inputs modified';
}
function invalidateAnalyses() {
  $('exportSweep').disabled = true;
  $('sweepStatus').textContent = sweepPoints ? 'Inputs changed. Sweep is from the previous configuration.' : 'No sweep calculated.';
  if ($('noiseSpl').dataset.calculated) $('noiseStatus').textContent = 'Inputs changed. Acoustics are from the previous configuration.';
}
function preview() {
  const c = readConfig();
  if (![c.radius, c.hub, c.rootChord, c.tipChord, c.pitch, c.blades].every(Number.isFinite) ||
      c.radius <= 0 || c.hub < 0 || c.hub >= 1 || c.blades < 1 || c.blades > 12) return;
  const rows = geometry || Array.from({ length: 30 }, (_, i) => {
    const r = c.hub + (1 - c.hub) * (i + 0.5) / 30;
    return { r, chord: c.rootChord + (c.tipChord - c.rootChord) * (r - c.hub) / (1 - c.hub),
      pitch: Math.atan2(0.75 * Math.tan(c.pitch * Math.PI / 180), r) * 180 / Math.PI };
  });
  rotor?.update(c, rows);
  $('sceneMeta').textContent = c.blades + ' blades / ' + (c.radius * 2).toFixed(2) + ' m diameter';
  $('sceneRadius').textContent = 'R = ' + c.radius.toFixed(3) + ' m';
}
const format = (value, digits = 1) => Number.isFinite(value) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits, notation: Math.abs(value) >= 1e6 ? 'compact' : 'standard' }).format(value) : '--';
function metric(id, value, unit, digits = 1) {
  const small = document.createElement('small');
  small.textContent = unit;
  $(id).replaceChildren(document.createTextNode(format(value, digits)), small);
}
function drawGeometry() {
  if (!lastResult) return;
  const quantity = $('geometryPlot').value;
  plots.geometry.set(lastResult.stations.map(s => ({ x: s.r, y: s[quantity] })), { xMin: lastResult.config.hub });
}
function renderResult(result, solvedMode) {
  lastResult = result;
  if (solvedMode === 'design' && result.converged) {
    invalidateAnalyses();
    geometry = result.geometry;
    result.config.geometry = geometry;
    syncControls();
    $('geometryBadge').textContent = 'Designed';
    $('sceneGeometry').textContent = 'Designed';
  }
  dirty = false;
  $('dirtyTag').hidden = true;
  const s = result.summary;
  status(result.converged ? 'Converged' : 'Not converged', result.converged ? 'converged' : 'warning');
  if (Math.abs(s.TDIM) < 1) metric('thrust', s.TDIM * 1000, 'mN');
  else metric('thrust', s.TDIM, 'N', 0);
  if (Math.abs(s.PDIM) < 1) metric('power', s.PDIM * 1000, 'mW');
  else if (Math.abs(s.PDIM) < 1000) metric('power', s.PDIM, 'W');
  else metric('power', s.PDIM / 1000, 'kW');
  metric('efficiency', s.EFFTOT * 100, '%');
  if (Math.abs(s.QDIM) < 1) metric('torque', s.QDIM * 1000, 'mN m');
  else metric('torque', s.QDIM, 'N m', 0);
  $('advance').textContent = format(s.J, 3);
  $('ct').textContent = format(s.CT, 3);
  $('cp').textContent = format(s.CP, 3);
  $('solverModel').textContent = result.model;
  $('solverTiming').textContent = format(result.elapsed, 0) + ' ms';
  $('footerState').textContent = result.stations.length + ' stations / ' + result.history.length + ' iterations';
  const fragment = document.createDocumentFragment();
  result.stations.forEach((station, i) => {
    const row = document.createElement('tr');
    [String(i + 1).padStart(2, '0'), station.r.toFixed(3), station.chord.toFixed(4), station.pitch.toFixed(2), station.cl.toFixed(3), station.cd.toFixed(4), station.mach.toFixed(3)].forEach(value => {
      const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
    });
    if (station.stalled) { row.classList.add('stalled'); row.title = 'Section stalled'; }
    fragment.append(row);
  });
  $('stationRows').replaceChildren(fragment);
  plots.loading.set(result.stations.map(row => ({ x: row.r, y: row.cl })), { xMin: result.config.hub });
  drawGeometry();
  plots.history.set(result.history.map(row => ({ x: row.ITER, y: Math.log10(Math.max(row.RMS, 1e-16)) })));
  $('historyMeta').textContent = 'RMS ' + result.rms.toExponential(3) + ' / ' + result.history.length + ' iterations';
  rotor?.update(result.config, result.stations);
  $('exportCsv').disabled = false;
  $('saveCase').disabled = !result.converged;
  const warning = !result.converged ? 'Iteration limit reached. Results are provisional.' :
    result.stalled ? result.stalled + ' blade sections stalled.' : '';
  message((solvedMode === 'design' ? 'Design' : 'Operating point') + (result.converged ? ' converged' : ' did not converge') +
    ' in ' + result.history.length + ' iterations.' + (warning ? ' ' + warning : ''), warning ? 'warning' : '');
}
async function runSolve() {
  if (!form.reportValidity()) return;
  const solvedMode = mode;
  status('Solving');
  await task(solvedMode === 'design' ? 'Designing minimum-induced-loss rotor...' : 'Solving operating point...', solvedMode, readConfig(), undefined, result => renderResult(result, solvedMode));
}
function switchMode(value) {
  mode = value;
  all('[data-mode]').forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active);
  });
  $('designFields').hidden = mode !== 'design';
  $('solve').querySelector('span').textContent = mode === 'design' ? 'Design rotor' : 'Run analysis';
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function filename() { return (form.elements.name.value.trim() || 'rotor').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80); }
function persistCases() {
  try { localStorage.setItem(storageKey, JSON.stringify(cases)); return true; }
  catch { message('Browser storage is unavailable. Save a project file to keep this case.', 'warning'); return false; }
}
function renderCases() {
  $('caseCount').textContent = cases.length;
  $('caseList').replaceChildren();
  if (!cases.length) {
    const p = document.createElement('p'); p.className = 'empty-state'; p.textContent = 'No saved cases'; $('caseList').append(p);
  }
  for (const entry of cases) {
    const row = document.createElement('div'); row.className = 'case-row';
    const restore = document.createElement('button');
    restore.title = 'Load ' + entry.config.name;
    const name = document.createElement('span'); name.className = 'case-name'; name.textContent = entry.config.name;
    const value = document.createElement('span'); value.className = 'case-value'; value.textContent = format(entry.thrust, 0) + ' N';
    restore.append(name, value);
    restore.addEventListener('click', () => {
      task('Loading saved case...', 'validate', entry.config, undefined, config => {
        applyConfig(config); switchMode('operate'); runSolve();
      });
    });
    const remove = document.createElement('button'); remove.className = 'icon-button';
    remove.title = 'Delete ' + entry.config.name; remove.setAttribute('aria-label', remove.title); remove.append(icon('x'));
    remove.addEventListener('click', () => { cases = cases.filter(c => c.id !== entry.id); persistCases(); renderCases(); });
    row.append(restore, remove); $('caseList').append(row);
  }
  refreshIcons();
}

all('#rotorForm input[type=number]').forEach(input => {
  if (!['blades', 'iterations'].includes(input.name)) input.step = 'any';
  input.required = true;
});
form.addEventListener('submit', event => { event.preventDefault(); runSolve(); });
form.addEventListener('input', event => {
  if (event.target.id === 'preset') return;
  if (event.target.id === 'pitchRange') form.elements.pitch.value = event.target.value;
  if (['rootChord', 'tipChord', 'pitch', 'radius', 'hub'].includes(event.target.name) || event.target.id === 'pitchRange') geometry = undefined;
  $('preset').value = 'custom';
  syncControls(); markDirty(); preview();
  message('Inputs modified. Run ' + (mode === 'design' ? 'design' : 'analysis') + ' to update results.', 'warning');
});
$('preset').addEventListener('change', () => {
  const id = $('preset').value;
  applyConfig(examples[id]?.config || presets[id] || defaults, id);
  switchMode('operate');
  runSolve();
});
all('[data-mode]').forEach(button => button.addEventListener('click', () => switchMode(button.dataset.mode)));
$('cancel').addEventListener('click', () => cancelTask());
all('[data-panel]').filter(button => button.tagName === 'BUTTON').forEach(button => button.addEventListener('click', () => {
  document.querySelector('.workbench').dataset.panel = button.dataset.panel;
  all('.mobile-tabs button').forEach(tab => tab.classList.toggle('active', tab === button));
}));
all('[data-view]').forEach(button => {
  button.addEventListener('click', () => {
    all('[data-view]').forEach(tab => {
      const active = tab === button;
      tab.classList.toggle('active', active); tab.setAttribute('aria-selected', active); tab.tabIndex = active ? 0 : -1;
      $('view-' + tab.dataset.view).hidden = !active;
    });
  });
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = all('[data-view]'), index = tabs.indexOf(button);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click(); tabs[next].focus();
  });
});
all('[data-table]').forEach(button => button.addEventListener('click', () => {
  all('[data-table]').forEach(tab => tab.classList.toggle('active', tab === button));
  $('stationPanel').hidden = button.dataset.table !== 'stations';
  $('historyPanel').hidden = button.dataset.table !== 'history';
}));
for (const [id, view] of Object.entries({ viewIso: 'iso', viewFront: 'front', viewSide: 'side', fitView: 'iso' })) {
  $(id).addEventListener('click', () => {
    rotor?.setView(view);
    ['viewIso', 'viewFront', 'viewSide'].forEach(key => $(key).classList.toggle('active', key.toLowerCase().endsWith(view)));
  });
}
$('spin').addEventListener('click', () => {
  if (rotor) { rotor.spinning = !rotor.spinning; $('spin').setAttribute('aria-pressed', rotor.spinning); }
});
$('wireframe').addEventListener('click', () => $('wireframe').setAttribute('aria-pressed', rotor?.toggleWire() || false));
$('geometryPlot').addEventListener('change', drawGeometry);
$('sweepForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const options = { from: Number($('sweepFrom').value), to: Number($('sweepTo').value), count: Number($('sweepCount').value) };
  task('Running RPM sweep...', 'sweep', readConfig(), options, points => {
    sweepPoints = points;
    plots.sweepThrust.set(points.map(p => ({ x: p.rpm, y: p.converged ? p.thrust : null })));
    plots.sweepEfficiency.set(points.map(p => ({ x: p.rpm, y: p.converged ? 100 * p.efficiency : null })));
    const count = points.filter(p => p.converged).length;
    $('sweepStatus').textContent = count + ' of ' + points.length + ' operating points converged.' + (count < points.length ? ' Unconverged points omitted from plots.' : '');
    $('exportSweep').disabled = false;
    message($('sweepStatus').textContent, count < points.length ? 'warning' : '');
  }, ({ completed, total }) => {
    $('sweepStatus').textContent = 'Solving point ' + completed + ' / ' + total;
  });
});
$('noiseForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  task('Calculating observer acoustics...', 'noise', readConfig(), {
    x: Number($('observerX').value), y: Number($('observerY').value), z: Number($('observerZ').value), aoc: Number($('observerArea').value),
  }, result => {
    metric('noiseSpl', result.spl, 'dB'); metric('noiseBpf', result.bpf, 'Hz');
    $('noiseSpl').dataset.calculated = 'true';
    plots.spectrum.set(result.harmonics.map(p => ({ x: p.frequency, y: p.db })));
    plots.trace.set(result.time.map((t, i) => ({ x: t * 1000, y: result.pressure[i] })));
    const warnings = result.warnings?.length ? ' ' + result.warnings.join(' ') : '';
    $('noiseStatus').textContent = '20 harmonics / 80 time intervals.' + warnings;
    message('Observer acoustics calculated.' + warnings, warnings ? 'warning' : '');
  });
});
$('sweepForm').addEventListener('input', () => {
  $('exportSweep').disabled = true;
  if (sweepPoints) $('sweepStatus').textContent = 'Sweep settings modified. Recalculate to update plots.';
});
$('noiseForm').addEventListener('input', () => { if ($('noiseSpl').dataset.calculated) $('noiseStatus').textContent = 'Observer settings modified. Recalculate to update acoustics.'; });
$('saveCase').addEventListener('click', () => {
  if (dirty || !lastResult?.converged || cases.length >= 20) { message('Up to 20 saved cases are supported. Delete a case to make room.', 'warning'); return; }
  cases.unshift({ id: crypto.randomUUID(), config: structuredClone(readConfig()), thrust: lastResult.summary.TDIM });
  const saved = persistCases(); renderCases();
  if (saved) message('Case saved in this browser.');
});
$('openFile').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', async () => {
  const file = $('fileInput').files[0]; $('fileInput').value = '';
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('Project files must be smaller than 1 MB.');
    const project = JSON.parse(await file.text());
    if (project?.format !== 'viberotor' || project.version !== 1 || !project.config || typeof project.config !== 'object') throw new Error('Not a supported VibeRotor project.');
    await task('Opening rotor project...', 'validate', project.config, undefined, config => {
      applyConfig(config); switchMode('operate'); runSolve();
    });
  } catch (error) { message('Could not open project: ' + error.message, 'error'); }
});
$('saveFile').addEventListener('click', () => {
  if (!form.reportValidity()) return;
  download(filename() + '.json', JSON.stringify({ format: 'viberotor', version: 1, config: readConfig() }, null, 2) + '\n', 'application/json');
  message('Rotor project exported.');
});
$('exportCsv').addEventListener('click', () => {
  if (!lastResult || dirty) return;
  const keys = ['r', 'chord', 'pitch', 'cl', 'cd', 'mach', 'reynolds', 'circulation', 'axial', 'stalled'];
  download(filename() + '-stations.csv', 'r_over_R,chord_m,pitch_deg,CL,CD,Mach,Re,circulation,axial_m_s,stalled\n' + lastResult.stations.map(row => keys.map(key => row[key]).join(',')).join('\n') + '\n', 'text/csv');
});
$('exportSweep').addEventListener('click', () => {
  if (!sweepPoints) return;
  download(filename() + '-sweep.csv', 'rpm,converged,thrust_N,power_W,efficiency\n' + sweepPoints.map(p => [p.rpm, p.converged, p.thrust ?? '', p.power ?? '', p.efficiency ?? ''].join(',')).join('\n') + '\n', 'text/csv');
});
$('reset').addEventListener('click', () => $('confirmReset').showModal());
$('confirmReset').addEventListener('close', () => {
  if ($('confirmReset').returnValue === 'reset') { applyConfig(defaults, 'baseline'); switchMode('operate'); runSolve(); }
});

try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (Array.isArray(saved)) cases = saved.filter(entry => entry && typeof entry.id === 'string' && entry.config && typeof entry.config.name === 'string' && Number.isFinite(entry.thrust)).slice(0, 20);
} catch { /* Private browsing may disable persistent storage. */ }
newWorker();
refreshIcons();
renderCases();
syncControls();
preview();
$('tab-rotor').click();
runSolve();
