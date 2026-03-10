const els = {
  appRoot: document.getElementById('appRoot'),
  navSettings: document.getElementById('navSettings'),
  navPlots: document.getElementById('navPlots'),
  navOutputs: document.getElementById('navOutputs'),
  settingsCol: document.getElementById('settingsCol'),
  plotsCol: document.getElementById('plotsCol'),
  outputsCol: document.getElementById('outputsCol'),
  rotorMeta: document.getElementById('rotorMeta'),
  rotorName: document.getElementById('rotorName'),
  bladeCount: document.getElementById('bladeCount'),
  rpm: document.getElementById('rpm'),
  tipRadius: document.getElementById('tipRadius'),
  hubRadius: document.getElementById('hubRadius'),
  meanChord: document.getElementById('meanChord'),
  tipTwist: document.getElementById('tipTwist'),
  airspeed: document.getElementById('airspeed'),
  density: document.getElementById('density'),
  soundSpeed: document.getElementById('soundSpeed'),
  targetThrust: document.getElementById('targetThrust'),
  collective: document.getElementById('collective'),
  ducted: document.getElementById('ducted'),
  micX: document.getElementById('micX'),
  micY: document.getElementById('micY'),
  micZ: document.getElementById('micZ'),
  gridRadius: document.getElementById('gridRadius'),
  gridResolution: document.getElementById('gridResolution'),
  aWeighting: document.getElementById('aWeighting'),
  micDistance: document.getElementById('micDistance'),
  advanceRatioPill: document.getElementById('advanceRatioPill'),
  viewerSubtitle: document.getElementById('viewerSubtitle'),
  viewerAircraftName: document.getElementById('viewerAircraftName'),
  rotorSvg: document.getElementById('rotorSvg'),
  spanwiseSvg: document.getElementById('spanwiseSvg'),
  footprintCanvas: document.getElementById('footprintCanvas'),
  outTipSpeed: document.getElementById('outTipSpeed'),
  outAdvanceRatio: document.getElementById('outAdvanceRatio'),
  outDiskLoading: document.getElementById('outDiskLoading'),
  outSolidity: document.getElementById('outSolidity'),
  outPower: document.getElementById('outPower'),
  outSpl: document.getElementById('outSpl'),
  outTipMach: document.getElementById('outTipMach'),
  outWakeSkew: document.getElementById('outWakeSkew'),
  stationTable: document.getElementById('stationTable'),
  previewLog: document.getElementById('previewLog'),
};

const viewButtons = Array.from(document.querySelectorAll('[data-view]'));
const presetButtons = Array.from(document.querySelectorAll('[data-preset]'));
const panels = Array.from(document.querySelectorAll('.panel'));
const inputs = Array.from(document.querySelectorAll('input, select'));

const PRESETS = {
  cruise: {
    rotorName: 'VibeRotor Cruise Prop',
    bladeCount: 4,
    rpm: 1680,
    tipRadius: 1.28,
    hubRadius: 0.18,
    meanChord: 0.162,
    tipTwist: 18.5,
    airspeed: 34,
    density: 1.225,
    soundSpeed: 340,
    targetThrust: 980,
    collective: 4.5,
    ducted: false,
    micX: 12,
    micY: 4,
    micZ: 1.6,
    gridRadius: 24,
    gridResolution: 42,
    aWeighting: true,
  },
  hover: {
    rotorName: 'VibeRotor Hover Rig',
    bladeCount: 5,
    rpm: 1180,
    tipRadius: 1.54,
    hubRadius: 0.24,
    meanChord: 0.186,
    tipTwist: 26,
    airspeed: 6,
    density: 1.225,
    soundSpeed: 340,
    targetThrust: 1680,
    collective: 9.8,
    ducted: false,
    micX: 10,
    micY: 0,
    micZ: 2.4,
    gridRadius: 28,
    gridResolution: 48,
    aWeighting: false,
  },
  quiet: {
    rotorName: 'VibeRotor Quiet Duct',
    bladeCount: 7,
    rpm: 980,
    tipRadius: 0.96,
    hubRadius: 0.22,
    meanChord: 0.142,
    tipTwist: 14,
    airspeed: 22,
    density: 1.18,
    soundSpeed: 336,
    targetThrust: 760,
    collective: 3.1,
    ducted: true,
    micX: 16,
    micY: 6,
    micZ: 1.8,
    gridRadius: 22,
    gridResolution: 36,
    aWeighting: true,
  },
};

const uiState = {
  viewMode: 'top',
  activeColumn: 'settingsCol',
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function format(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function readNumber(element, fallback) {
  const value = Number(element.value);
  return Number.isFinite(value) ? value : fallback;
}

function setControlValue(key, value) {
  const element = els[key];
  if (!element) {
    return;
  }
  if (element.type === 'checkbox') {
    element.checked = Boolean(value);
  } else {
    element.value = String(value);
  }
}

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) {
    return;
  }
  Object.entries(preset).forEach(([key, value]) => setControlValue(key, value));
  updateApp();
}

function attachPresets() {
  presetButtons.forEach((button) => {
    button.addEventListener('click', () => applyPreset(button.dataset.preset));
  });
}

function attachPanelToggles() {
  panels.forEach((panel) => {
    const toggle = panel.querySelector('[data-toggle-panel]');
    if (!toggle) {
      return;
    }
    toggle.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      toggle.textContent = panel.classList.contains('collapsed') ? '+' : '-';
    });
  });
}

function setActiveNav(targetId) {
  [els.navSettings, els.navPlots, els.navOutputs].forEach((button) => {
    button.classList.toggle('active', button.dataset.target === targetId);
  });
  uiState.activeColumn = targetId;
}

function attachMobileNav() {
  [els.navSettings, els.navPlots, els.navOutputs].forEach((button) => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.target);
      if (!target) {
        return;
      }
      setActiveNav(button.dataset.target);
      target.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    });
  });

  const observer = new IntersectionObserver((entries) => {
    let bestEntry = null;
    for (const entry of entries) {
      if (!bestEntry || entry.intersectionRatio > bestEntry.intersectionRatio) {
        bestEntry = entry;
      }
    }
    if (bestEntry && bestEntry.isIntersecting) {
      setActiveNav(bestEntry.target.id);
    }
  }, {
    root: window.matchMedia('(max-width: 900px)').matches ? els.appRoot : null,
    threshold: [0.3, 0.55, 0.8],
  });

  [els.settingsCol, els.plotsCol, els.outputsCol].forEach((section) => observer.observe(section));
}

function attachViewButtons() {
  viewButtons.forEach((button) => {
    button.addEventListener('click', () => {
      uiState.viewMode = button.dataset.view;
      viewButtons.forEach((item) => item.classList.toggle('active', item === button));
      updateApp();
    });
  });
}

function collectInputs() {
  const tipRadius = clamp(readNumber(els.tipRadius, 1.28), 0.3, 4.0);
  const hubRadius = clamp(readNumber(els.hubRadius, 0.18), 0.05, tipRadius - 0.05);
  const blades = clamp(Math.round(readNumber(els.bladeCount, 4)), 2, 8);
  const rpm = clamp(readNumber(els.rpm, 1680), 300, 4500);
  const meanChord = clamp(readNumber(els.meanChord, 0.162), 0.03, 0.5);
  const tipTwist = clamp(readNumber(els.tipTwist, 18.5), 0, 45);
  const airspeed = clamp(readNumber(els.airspeed, 34), 0, 150);
  const density = clamp(readNumber(els.density, 1.225), 0.2, 2.0);
  const soundSpeed = clamp(readNumber(els.soundSpeed, 340), 250, 360);
  const targetThrust = clamp(readNumber(els.targetThrust, 980), 10, 8000);
  const collective = clamp(readNumber(els.collective, 4.5), -5, 25);
  const micX = readNumber(els.micX, 12);
  const micY = readNumber(els.micY, 4);
  const micZ = readNumber(els.micZ, 1.6);
  const gridRadius = clamp(readNumber(els.gridRadius, 24), 5, 100);
  const gridResolution = clamp(Math.round(readNumber(els.gridResolution, 42)), 16, 80);

  return {
    rotorName: els.rotorName.value.trim() || 'VibeRotor Demo Prop',
    blades,
    rpm,
    tipRadius,
    hubRadius,
    meanChord,
    tipTwist,
    airspeed,
    density,
    soundSpeed,
    targetThrust,
    collective,
    ducted: els.ducted.checked,
    micX,
    micY,
    micZ,
    gridRadius,
    gridResolution,
    aWeighting: els.aWeighting.checked,
  };
}

function computeModel(input) {
  const omega = input.rpm * 2.0 * Math.PI / 60.0;
  const diskArea = Math.PI * (input.tipRadius ** 2 - input.hubRadius ** 2);
  const tipSpeed = omega * input.tipRadius;
  const hubRatio = input.hubRadius / input.tipRadius;
  const advanceRatio = input.airspeed / ((input.rpm / 60.0) * (2.0 * input.tipRadius));
  const solidity = input.blades * input.meanChord / (Math.PI * input.tipRadius);
  const thrustCoeff = input.targetThrust / (input.density * (input.rpm / 60.0) ** 2 * (2.0 * input.tipRadius) ** 4);
  const powerCoeff = thrustCoeff * (0.56 + 0.18 * advanceRatio + (input.ducted ? -0.04 : 0.06));
  const shaftPower = powerCoeff * input.density * (input.rpm / 60.0) ** 3 * (2.0 * input.tipRadius) ** 5;
  const diskLoading = input.targetThrust / diskArea;
  const wakeSkewDeg = Math.atan2(input.airspeed, Math.max(tipSpeed * 0.64, 1.0)) * 180.0 / Math.PI;
  const tipMach = Math.sqrt(input.airspeed ** 2 + tipSpeed ** 2) / input.soundSpeed;
  const micDistance = Math.sqrt(input.micX ** 2 + input.micY ** 2 + input.micZ ** 2);
  let spl = 67.0 + 8.5 * Math.log10(Math.max(shaftPower, 1200.0) / 1000.0) + 0.045 * tipSpeed - 9.5 * Math.log10(Math.max(micDistance, 1.0));
  if (input.ducted) {
    spl -= 2.4;
  }
  if (input.aWeighting) {
    spl -= 1.8;
  }

  const stations = [];
  const stationCount = 18;
  for (let i = 0; i < stationCount; i += 1) {
    const t = i / (stationCount - 1);
    const rOverR = hubRatio + (1.0 - hubRatio) * t;
    const radius = input.tipRadius * rOverR;
    const taper = 1.08 - 0.38 * t + 0.04 * Math.sin(2.6 * Math.PI * t);
    const chord = input.meanChord * taper;
    const beta = input.collective + input.tipTwist * (0.10 + 0.90 * (1.0 - t) ** 1.08);
    const cl = clamp(
      0.34
      + 0.26 * (1.0 - t)
      + thrustCoeff * 26.0
      - advanceRatio * 0.18
      + (input.ducted ? 0.03 : 0.0),
      0.12,
      1.25,
    );
    const localSpeed = Math.sqrt(input.airspeed ** 2 + (omega * radius) ** 2);
    const mach = localSpeed / input.soundSpeed;
    stations.push({ rOverR, radius, chord, beta, cl, mach });
  }

  return {
    ...input,
    omega,
    diskArea,
    tipSpeed,
    advanceRatio,
    solidity,
    thrustCoeff,
    shaftPower,
    diskLoading,
    wakeSkewDeg,
    tipMach,
    spl,
    micDistance,
    hubRatio,
    stations,
  };
}

function pathFromSeries(points) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0].toFixed(2)} ${point[1].toFixed(2)}`).join(' ');
}

function polarPoint(cx, cy, radius, angle) {
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function buildBladePath(model, angle, cx, cy, radiusScale) {
  const outline = [];
  const inner = [];
  for (let i = 0; i < model.stations.length; i += 1) {
    const station = model.stations[i];
    const r = station.rOverR * radiusScale;
    const halfWidth = clamp((station.chord / model.tipRadius) * radiusScale * 0.56, 8, 26);
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    outline.push(`${i === 0 ? 'M' : 'L'} ${(px + nx * halfWidth).toFixed(2)} ${(py + ny * halfWidth).toFixed(2)}`);
    inner.unshift(`L ${(px - nx * halfWidth).toFixed(2)} ${(py - ny * halfWidth).toFixed(2)}`);
  }
  return `${outline.join(' ')} ${inner.join(' ')} Z`;
}

function buildTopRotorMarkup(model) {
  const width = 920;
  const height = 520;
  const cx = width * 0.5;
  const cy = height * 0.52;
  const radiusScale = 182;
  const rings = [0.25, 0.5, 0.75, 1.0].map((fraction) => `
    <circle cx="${cx}" cy="${cy}" r="${(radiusScale * fraction).toFixed(2)}" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="1" />
  `).join('');
  const spokes = Array.from({ length: 6 }, (_, index) => {
    const angle = index * Math.PI / 3.0;
    const [x1, y1] = polarPoint(cx, cy, radiusScale, angle);
    const [x2, y2] = polarPoint(cx, cy, radiusScale, angle + Math.PI);
    return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="rgba(255,255,255,0.06)" stroke-width="1" />`;
  }).join('');

  const blades = Array.from({ length: model.blades }, (_, index) => {
    const angle = -Math.PI / 2 + index * (2 * Math.PI / model.blades);
    const bladePath = buildBladePath(model, angle, cx, cy, radiusScale);
    const wakeStart = polarPoint(cx, cy, radiusScale * 0.92, angle);
    const wakeMid = polarPoint(cx, cy, radiusScale * 1.16, angle + 0.22 + model.advanceRatio * 0.1);
    const wakeEnd = polarPoint(cx, cy, radiusScale * 1.35, angle + 0.35 + model.advanceRatio * 0.16);
    return `
      <path d="${bladePath}" fill="rgba(127,179,255,0.20)" stroke="rgba(127,179,255,0.90)" stroke-width="1.8" />
      <path d="M ${wakeStart[0].toFixed(2)} ${wakeStart[1].toFixed(2)} Q ${wakeMid[0].toFixed(2)} ${wakeMid[1].toFixed(2)} ${wakeEnd[0].toFixed(2)} ${wakeEnd[1].toFixed(2)}" fill="none" stroke="rgba(111,207,151,0.62)" stroke-width="1.4" stroke-dasharray="5 5" />
    `;
  }).join('');

  const ductMarkup = model.ducted
    ? `<ellipse cx="${cx}" cy="${cy}" rx="${(radiusScale + 20).toFixed(2)}" ry="${(radiusScale + 20).toFixed(2)}" fill="none" stroke="rgba(251,191,36,0.65)" stroke-width="5" />`
    : '';

  return `
    <rect width="${width}" height="${height}" fill="transparent" />
    ${rings}
    ${spokes}
    ${ductMarkup}
    <circle cx="${cx}" cy="${cy}" r="${(radiusScale * model.hubRatio).toFixed(2)}" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.25)" stroke-width="1.4" />
    ${blades}
    <text x="${cx - radiusScale - 20}" y="${cy + radiusScale + 28}" fill="#9aa4af" font-size="12">r/R rings: 0.25 · 0.50 · 0.75 · 1.00</text>
  `;
}

function buildSideRotorMarkup(model) {
  const width = 920;
  const height = 520;
  const left = 120;
  const right = width - 120;
  const baseline = height * 0.62;
  const hubX = width * 0.36;
  const rotorHeight = 280;
  const ductOffset = model.ducted ? 28 : 0;
  const streamlines = Array.from({ length: 5 }, (_, index) => {
    const y = baseline - 120 + index * 56;
    const skew = model.wakeSkewDeg * 1.6;
    return `<path d="M ${left} ${y} C ${left + 180} ${y - 10}, ${hubX + 120} ${y + skew * 0.08}, ${right} ${y + skew * 0.42}" fill="none" stroke="rgba(111,207,151,0.55)" stroke-width="1.4" stroke-dasharray="6 6" />`;
  }).join('');

  return `
    <rect width="${width}" height="${height}" fill="transparent" />
    <line x1="${left}" y1="${baseline}" x2="${right}" y2="${baseline}" stroke="rgba(255,255,255,0.10)" stroke-width="1" />
    <ellipse cx="${hubX}" cy="${baseline}" rx="${(20 + ductOffset).toFixed(2)}" ry="${(rotorHeight * 0.5 + ductOffset).toFixed(2)}" fill="rgba(127,179,255,0.08)" stroke="rgba(127,179,255,0.85)" stroke-width="3" />
    <ellipse cx="${hubX}" cy="${baseline}" rx="10" ry="30" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.22)" stroke-width="1.2" />
    <path d="M ${hubX - 16} ${baseline - 0.5 * rotorHeight} L ${hubX + 150} ${baseline - 0.42 * rotorHeight} L ${hubX + 220} ${baseline - 16} L ${hubX + 150} ${baseline - 6} Z" fill="rgba(127,179,255,0.20)" stroke="rgba(127,179,255,0.90)" stroke-width="1.8" />
    <path d="M ${hubX - 16} ${baseline + 0.5 * rotorHeight} L ${hubX + 150} ${baseline + 0.42 * rotorHeight} L ${hubX + 220} ${baseline + 16} L ${hubX + 150} ${baseline + 6} Z" fill="rgba(127,179,255,0.20)" stroke="rgba(127,179,255,0.90)" stroke-width="1.8" />
    ${streamlines}
    <text x="${left}" y="${baseline - 142}" fill="#9aa4af" font-size="12">Wake skew ≈ ${format(model.wakeSkewDeg, 1)} deg</text>
    <text x="${left}" y="${baseline + 42}" fill="#9aa4af" font-size="12">Airspeed ${format(model.airspeed, 1)} m/s · Tip speed ${format(model.tipSpeed, 1)} m/s</text>
  `;
}

function buildNoiseRotorMarkup(model) {
  const width = 920;
  const height = 520;
  const cx = width * 0.43;
  const cy = height * 0.52;
  const baseRadius = 88;
  const lobe = model.spl * 1.15;
  const micX = cx + clamp(model.micY / model.gridRadius, -1, 1) * 180;
  const micY = cy - clamp(model.micX / model.gridRadius, -1, 1) * 180;
  return `
    <defs>
      <radialGradient id="noiseGlow" cx="50%" cy="50%" r="65%">
        <stop offset="0%" stop-color="rgba(251,191,36,0.45)" />
        <stop offset="45%" stop-color="rgba(64,162,216,0.28)" />
        <stop offset="100%" stop-color="rgba(15,17,21,0.0)" />
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="transparent" />
    <ellipse cx="${cx}" cy="${cy}" rx="${(baseRadius + lobe * 0.55).toFixed(2)}" ry="${(baseRadius * 0.85 + lobe * 0.20).toFixed(2)}" fill="url(#noiseGlow)" />
    <ellipse cx="${cx + 44}" cy="${cy - 18}" rx="${(baseRadius + lobe * 0.30).toFixed(2)}" ry="${(baseRadius * 0.60 + lobe * 0.15).toFixed(2)}" fill="none" stroke="rgba(251,191,36,0.55)" stroke-width="2.2" />
    <ellipse cx="${cx - 12}" cy="${cy + 8}" rx="${(baseRadius + lobe * 0.12).toFixed(2)}" ry="${(baseRadius * 0.45).toFixed(2)}" fill="none" stroke="rgba(64,162,216,0.45)" stroke-width="1.8" />
    <circle cx="${cx}" cy="${cy}" r="${baseRadius.toFixed(2)}" fill="rgba(127,179,255,0.10)" stroke="rgba(127,179,255,0.85)" stroke-width="1.8" />
    <circle cx="${micX.toFixed(2)}" cy="${micY.toFixed(2)}" r="7" fill="#f8fafc" stroke="#7fb3ff" stroke-width="2" />
    <line x1="${cx}" y1="${cy}" x2="${micX.toFixed(2)}" y2="${micY.toFixed(2)}" stroke="rgba(255,255,255,0.20)" stroke-dasharray="4 5" />
    <text x="${micX + 12}" y="${micY - 10}" fill="#e8edf2" font-size="12">mic</text>
    <text x="${cx - 26}" y="${cy + baseRadius + 30}" fill="#9aa4af" font-size="12">preview lobe at ${format(model.spl, 1)} dBA</text>
  `;
}

function drawRotorStage(model) {
  let subtitle = 'Top-down blade planform and wake framing.';
  if (uiState.viewMode === 'side') {
    subtitle = 'Side elevation with skewed wake streamlines.';
    els.rotorSvg.innerHTML = buildSideRotorMarkup(model);
  } else if (uiState.viewMode === 'noise') {
    subtitle = 'Acoustic directivity cue around the rotor disk.';
    els.rotorSvg.innerHTML = buildNoiseRotorMarkup(model);
  } else {
    els.rotorSvg.innerHTML = buildTopRotorMarkup(model);
  }
  els.viewerSubtitle.textContent = subtitle;
  els.viewerAircraftName.textContent = model.rotorName;
}

function drawSpanwisePlot(model) {
  const width = 920;
  const height = 280;
  const left = 64;
  const right = width - 18;
  const top = 18;
  const bottom = height - 34;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const x = (t) => left + t * plotWidth;
  const y = (value) => bottom - value * plotHeight;

  const chordValues = model.stations.map((station) => station.chord / Math.max(model.meanChord * 1.15, 1e-6));
  const betaValues = model.stations.map((station) => station.beta / Math.max(model.collective + model.tipTwist + 6.0, 1e-6));
  const clValues = model.stations.map((station) => station.cl / 1.3);

  const series = [
    { label: 'c/R cue', color: '#7fb3ff', values: chordValues },
    { label: 'beta cue', color: '#fb923c', values: betaValues },
    { label: 'CL cue', color: '#6fcf97', values: clValues },
  ];

  const grid = [0, 0.25, 0.5, 0.75, 1].map((fraction) => `
    <line x1="${left}" y1="${y(fraction)}" x2="${right}" y2="${y(fraction)}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
    <text x="${left - 12}" y="${y(fraction) + 4}" fill="#9aa4af" font-size="11" text-anchor="end">${format(fraction, 2)}</text>
  `).join('');

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => `
    <line x1="${x(fraction)}" y1="${bottom}" x2="${x(fraction)}" y2="${top}" stroke="rgba(255,255,255,0.05)" stroke-width="1" />
    <text x="${x(fraction)}" y="${height - 12}" fill="#9aa4af" font-size="11" text-anchor="middle">${format(model.hubRatio + (1 - model.hubRatio) * fraction, 2)}</text>
  `).join('');

  const lines = series.map((seriesItem) => {
    const points = seriesItem.values.map((value, index) => {
      const t = index / (seriesItem.values.length - 1);
      return [x(t), y(clamp(value, 0, 1.1))];
    });
    return `<path d="${pathFromSeries(points)}" fill="none" stroke="${seriesItem.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />`;
  }).join('');

  const legend = series.map((seriesItem, index) => `
    <g transform="translate(${left + index * 146}, ${top + 8})">
      <line x1="0" y1="0" x2="22" y2="0" stroke="${seriesItem.color}" stroke-width="2.2" />
      <text x="30" y="4" fill="#9aa4af" font-size="11">${seriesItem.label}</text>
    </g>
  `).join('');

  els.spanwiseSvg.innerHTML = `
    <rect width="${width}" height="${height}" fill="transparent" />
    ${grid}
    ${ticks}
    <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="rgba(255,255,255,0.16)" stroke-width="1.1" />
    <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="rgba(255,255,255,0.16)" stroke-width="1.1" />
    ${lines}
    ${legend}
    <text x="${(left + right) / 2}" y="${height - 8}" fill="#9aa4af" font-size="11" text-anchor="middle">r/R</text>
  `;
}

function colorForLevel(level, min, max) {
  const t = clamp((level - min) / Math.max(max - min, 1e-6), 0, 1);
  const stops = [
    [7, 21, 31],
    [18, 48, 74],
    [34, 93, 136],
    [64, 162, 216],
    [251, 191, 36],
    [251, 113, 133],
  ];
  const scaled = t * (stops.length - 1);
  const index = Math.floor(scaled);
  const local = scaled - index;
  const a = stops[index];
  const b = stops[Math.min(index + 1, stops.length - 1)];
  const mix = a.map((value, channel) => Math.round(value + (b[channel] - value) * local));
  return `rgb(${mix[0]} ${mix[1]} ${mix[2]})`;
}

function drawFootprint(model) {
  const canvas = els.footprintCanvas;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width || 920));
  const height = Math.max(220, Math.round(rect.height || 340));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0f1115';
  ctx.fillRect(0, 0, width, height);

  const padding = 18;
  const minLevel = model.spl - 24;
  const maxLevel = model.spl + 3;
  const gridSteps = model.gridResolution;
  const xExtent = model.gridRadius;
  const yExtent = model.gridRadius * 0.72;

  for (let ix = 0; ix < gridSteps; ix += 1) {
    for (let iy = 0; iy < gridSteps; iy += 1) {
      const x0 = padding + ix / gridSteps * (width - 2 * padding);
      const y0 = padding + iy / gridSteps * (height - 2 * padding);
      const x = -xExtent + (ix + 0.5) / gridSteps * (2 * xExtent);
      const y = -yExtent + (iy + 0.5) / gridSteps * (2 * yExtent);
      const r = Math.sqrt((x / (model.tipRadius * 4.2)) ** 2 + (y / (model.tipRadius * 2.8)) ** 2);
      const skew = Math.cos(Math.atan2(y, x + 1e-6) - model.wakeSkewDeg * Math.PI / 180.0);
      let level = model.spl - 12.0 * Math.log10(1.0 + r ** 2 * 2.3) + skew * 2.2;
      level += model.ducted ? -1.8 * Math.exp(-(r ** 2) * 0.8) : 0.0;
      if (!model.aWeighting) {
        level += 1.5;
      }
      ctx.fillStyle = colorForLevel(level, minLevel, maxLevel);
      ctx.globalAlpha = 0.82;
      ctx.fillRect(x0, y0, (width - 2 * padding) / gridSteps + 1, (height - 2 * padding) / gridSteps + 1);
    }
  }
  ctx.globalAlpha = 1.0;

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const x = padding + i / 4 * (width - 2 * padding);
    const y = padding + i / 4 * (height - 2 * padding);
    ctx.beginPath();
    ctx.moveTo(x, padding);
    ctx.lineTo(x, height - padding);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(127,179,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.5, 16, 16, 0, 0, Math.PI * 2);
  ctx.stroke();

  const micPx = padding + clamp((model.micY + xExtent) / (2 * xExtent), 0, 1) * (width - 2 * padding);
  const micPy = padding + clamp(1 - (model.micX + yExtent) / (2 * yExtent), 0, 1) * (height - 2 * padding);
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#7fb3ff';
  ctx.beginPath();
  ctx.arc(micPx, micPy, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#9aa4af';
  ctx.font = '11px Consolas, "Courier New", monospace';
  ctx.fillText(`preview footprint ${format(model.spl, 1)} dBA`, padding, 14);
  ctx.fillText('mic', micPx + 10, micPy - 6);
}

function updateOutputs(model) {
  els.rotorMeta.textContent = `${model.blades}-blade preview · ${format(model.tipRadius * 2, 2)} m diameter · ${model.ducted ? 'ducted shell' : 'open rotor shell'}`;
  els.micDistance.textContent = `${format(model.micDistance, 1)} m`;
  els.advanceRatioPill.textContent = format(model.advanceRatio, 3);
  els.outTipSpeed.textContent = `${format(model.tipSpeed, 1)} m/s`;
  els.outAdvanceRatio.textContent = format(model.advanceRatio, 3);
  els.outDiskLoading.textContent = `${format(model.diskLoading, 1)} N/m²`;
  els.outSolidity.textContent = format(model.solidity, 3);
  els.outPower.textContent = `${format(model.shaftPower / 1000, 1)} kW`;
  els.outSpl.textContent = `${format(model.spl, 1)} ${model.aWeighting ? 'dBA' : 'dB'}`;
  els.outTipMach.textContent = format(model.tipMach, 3);
  els.outWakeSkew.textContent = `${format(model.wakeSkewDeg, 1)}°`;

  const tableLines = [
    ' i   r/R   chord(m)  beta(deg)   CL    Mach',
    '---------------------------------------------',
  ];
  model.stations.forEach((station, index) => {
    if (index % 2 !== 0 && index !== model.stations.length - 1) {
      return;
    }
    tableLines.push(
      `${String(index + 1).padStart(2)}  ${format(station.rOverR, 3).padStart(5)}   ${format(station.chord, 3).padStart(7)}   ${format(station.beta, 2).padStart(8)}  ${format(station.cl, 3).padStart(5)}  ${format(station.mach, 3).padStart(5)}`,
    );
  });
  els.stationTable.textContent = tableLines.join('\n');

  const logLines = [
    `[preview] ${model.rotorName}`,
    `[geometry] blades=${model.blades} radius=${format(model.tipRadius, 3)}m hub=${format(model.hubRadius, 3)}m chord=${format(model.meanChord, 3)}m twist=${format(model.tipTwist, 1)}deg`,
    `[operating] rpm=${format(model.rpm, 0)} airspeed=${format(model.airspeed, 1)}m/s thrust=${format(model.targetThrust, 1)}N J=${format(model.advanceRatio, 3)} Ct=${format(model.thrustCoeff, 4)}`,
    `[noise] mic=(${format(model.micX, 1)}, ${format(model.micY, 1)}, ${format(model.micZ, 1)})m SPL=${format(model.spl, 1)}${model.aWeighting ? ' dBA' : ' dB'}`,
    `[note] UI values are generated previews so the shell stays useful before the full XROTOR-backed app lands.`,
  ];
  els.previewLog.textContent = logLines.join('\n');
}

function updateApp() {
  const model = computeModel(collectInputs());
  updateOutputs(model);
  drawRotorStage(model);
  drawSpanwisePlot(model);
  drawFootprint(model);
}

function attachInputs() {
  inputs.forEach((element) => {
    element.addEventListener('input', updateApp);
    element.addEventListener('change', updateApp);
  });
}

function attachResizeHandler() {
  window.addEventListener('resize', updateApp);
}

attachPanelToggles();
attachPresets();
attachMobileNav();
attachViewButtons();
attachInputs();
attachResizeHandler();
applyPreset('cruise');
