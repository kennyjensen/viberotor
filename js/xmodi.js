'use strict';

const xoper = require('./xoper.js');
const { SCALIT } = require('./xnoise.js');
const { CRSMOD } = require('./modify.js');
const { SPLINE, SEVAL } = require('./spline.js');

const PI = xoper.PI;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isArrayLike(value) {
  return Array.isArray(value) || ArrayBuffer.isView(value);
}

function ensureVector(value, length, name) {
  assert(isArrayLike(value), `${name}: expected an array-like value`);
  assert(value.length >= length, `${name}: expected length >= ${length}`);
  return value;
}

function getXrotor() {
  return require('./xrotor.js');
}

function getXdesi() {
  return require('./xdesi.js');
}

function helpText() {
  return [
    'BLAD i  Set new number of blades',
    'MODC    Modify chord distribution',
    'MODB    Modify blade twist angle distribution',
    'SCAL rr Scale current chords',
    'TLIN r  Add linear blade twist (proportional to r/R)',
    'RTIP r  Change tip radius (preserve chord/R)',
    'RHUB r  Change hub radius',
    'RWAK r  Change hub wake displacement body radius',
    'RAKE r  Change blade rake angle',
    'XPAX r  Change pitch-axis x/c',
    'CLPI r  Clip current prop at inner radius (preserve chord)',
    'CLPO r  Clip current prop at outer radius (preserve chord)',
    'OPTI    Optimize blade twist angles for current planform',
    'PLOT i  Plot various rotor parameters',
    'ANNO    Annotate current plot',
    'HARD    Hardcopy current plot',
    'SIZE r  Change plot-object size',
  ];
}

function PLOT_INFO(plotNumber) {
  const info = {
    1: { label: 'Geometry', routine: 'GEOPLT', args: ['ALUE'], factor: 0.7, origin: { x: 0.15, y: 0.10 }, landscape: 'state' },
    2: { label: 'Axial Geometry', routine: 'PRPPLT', args: [], factor: 0.6, origin: { x: 0.175, y: 0.175 }, landscape: 'invert' },
    3: { label: 'Current Case', routine: 'CLPLT', args: [], factor: 0.85, origin: { x: 0.15, y: 0.10 }, landscape: 'state' },
    4: { label: 'Geometry And Case', routine: 'GEOPLT+CLPLT', args: ['AL'], factor: 0.6, origin: { x: 0.175, y: 0.075 }, landscape: 'invert' },
    7: { label: 'Induced Velocities On Blade', routine: 'UVIPLT', args: [], factor: null, origin: null, landscape: null },
    8: { label: 'Induced Velocities In Slipstream', routine: 'UVIPLT3', args: [], factor: null, origin: null, landscape: null },
    9: { label: 'Velocity Triangles', routine: 'TRIPLT', args: [], factor: null, origin: null, landscape: null },
    10: { label: 'External Slipstream Profiles', routine: 'VELPLT', args: [], factor: null, origin: null, landscape: null },
    11: { label: 'Reference XY Data', routine: 'REFPLT', args: [], factor: null, origin: null, landscape: null },
    12: { label: 'Blade Data Plot', routine: 'PLOT_DATA', args: [], factor: null, origin: null, landscape: null },
  };
  return info[plotNumber] ?? null;
}

function makeOutputBundle(state) {
  return state.CONV ? getXrotor().OUTPUT(state, state.LUWRIT) : null;
}

function PLTMOD(state, N, X, Y, DYMIN, YLIMS, PLFAC, PLPAR, NSPLT) {
  const n = Math.trunc(N);
  ensureVector(X, n, 'X');
  ensureVector(Y, n, 'Y');
  ensureVector(YLIMS, 2, 'YLIMS');

  let yMin = Y[0];
  let yMax = Y[0];
  for (let i = 1; i < n; i += 1) {
    yMin = Math.min(yMin, Y[i]);
    yMax = Math.max(yMax, Y[i]);
  }
  if (YLIMS[0] !== 999.0) {
    yMin = YLIMS[0];
  }
  if (YLIMS[1] !== 999.0) {
    yMax = YLIMS[1];
  }

  if (Math.abs(yMax - yMin) === 0.0) {
    if (yMax !== 0.0) {
      yMin = 0.5 * yMax;
      yMax = 1.5 * yMax;
    } else {
      yMax = yMin + 1.0;
    }
  }

  const yFac = SCALIT(1, new Float64Array([yMax]), yMin);
  let yDel = Math.max(1.0 / (5.0 * yFac), DYMIN);
  yMin = yDel * (Math.trunc(yMin / yDel + 1000.8) - 1001.0);
  yMax = yDel * (Math.trunc(yMax / yDel + 1001.2) - 1000.0);

  if ((yMax - yMin) < 0.5 * (yMax + yMin)) {
    yMax += yDel;
    yMin -= yDel;
  }
  if ((yMax - yMin) < 0.5 * (yMax + yMin)) {
    yMax += yDel;
    yMin -= yDel;
  }

  const ysf = PLPAR / (yMax - yMin);
  const yoff = yMin;
  const xsf = 1.0;
  const xoff = 0.0;
  const nyg = Math.trunc((yMax - yMin) / (0.5 * yDel) + 0.01);

  return {
    XOFF: xoff,
    XSF: xsf,
    YOFF: yoff,
    YSF: ysf,
    DYMIN: yDel,
    plot: {
      factor: PLFAC * state.SIZE,
      landscape: Boolean(state.LLAND),
      plotParameter: PLPAR,
      nSplineSegments: NSPLT,
      xAxis: {
        start: 0.0,
        length: 1.0,
        tick: 0.2,
        label: 'r/R',
      },
      yAxis: {
        start: 0.0,
        length: PLPAR,
        tickScaled: yDel * ysf,
        min: yMin,
        tick: yDel,
      },
      grid: state.LGRID ? {
        nx: 10,
        dx: 0.1,
        ny: nyg,
        dy: 0.5 * yDel * ysf,
      } : null,
      points: Array.from({ length: n }, (_, i) => ({
        x: X[i],
        y: Y[i],
      })),
    },
  };
}

function MODBE(state, action = {}) {
  const RTD = 180.0 / PI;
  const PLFAC = 0.95;
  const PLPAR = 1.20 * state.PAR;
  const SH = 0.3 * state.CSIZE;
  const NSPLT = 20;
  const w1 = new Float64Array(state.II);
  const w2 = new Float64Array(state.II);
  const w3 = new Float64Array(state.II);

  let betMin = state.BETA[0] * RTD;
  let betMax = state.BETA[0] * RTD;
  for (let i = 0; i < state.II; i += 1) {
    w1[i] = state.XI[i];
    w2[i] = state.BETA[i] * RTD;
    betMin = Math.min(state.BETA[i] * RTD, betMin);
    betMax = Math.max(state.BETA[i] * RTD, betMax);
  }
  SPLINE(w2, w3, w1, state.II);

  const dy = 5.0;
  const dBet = betMax - betMin;
  const ylims = new Float64Array([betMin - 0.25 * dBet, betMax + 0.25 * dBet]);
  const plot = PLTMOD(state, state.II, w1, w2, dy, ylims, PLFAC, PLPAR, NSPLT);
  const cursor = CRSMOD(
    state.II,
    w1,
    w2,
    w3,
    plot.XOFF,
    plot.XSF,
    plot.YOFF,
    plot.YSF,
    SH,
    NSPLT,
    Boolean(action.lslope ?? state.LSLOPE),
    action,
  );

  for (let i = cursor.IMOD1; i <= cursor.IMOD2; i += 1) {
    const idx = i - 1;
    const dBetRad = (w2[idx] * PI) / 180.0 - state.BETA[idx];
    state.BETA[idx] += dBetRad;
    state.BETA0[idx] += dBetRad;
  }

  return {
    IMOD1: cursor.IMOD1,
    IMOD2: cursor.IMOD2,
    plot,
    cursor,
    betaDeg: w2,
  };
}

function MODCH(state, action = {}) {
  const PLFAC = 0.95;
  const PLPAR = 1.20 * state.PAR;
  const SH = 0.3 * state.CSIZE;
  const NSPLT = 20;
  const w1 = new Float64Array(state.II);
  const w2 = new Float64Array(state.II);
  const w3 = new Float64Array(state.II);

  let chMax = state.CH[0];
  for (let i = 0; i < state.II; i += 1) {
    w1[i] = state.XI[i];
    w2[i] = state.CH[i];
    chMax = Math.max(state.CH[i], chMax);
  }
  SPLINE(w2, w3, w1, state.II);

  const dy = 0.01;
  const ylims = new Float64Array([0.0, 1.25 * chMax]);
  const plot = PLTMOD(state, state.II, w1, w2, dy, ylims, PLFAC, PLPAR, NSPLT);
  const cursor = CRSMOD(
    state.II,
    w1,
    w2,
    w3,
    plot.XOFF,
    plot.XSF,
    plot.YOFF,
    plot.YSF,
    SH,
    NSPLT,
    Boolean(action.lslope ?? state.LSLOPE),
    action,
  );

  for (let i = cursor.IMOD1; i <= cursor.IMOD2; i += 1) {
    state.CH[i - 1] = w2[i - 1];
  }

  return {
    IMOD1: cursor.IMOD1,
    IMOD2: cursor.IMOD2,
    plot,
    cursor,
    chord: w2,
  };
}

function optimizeTwist(state, action = {}, hooks = {}) {
  const oldBeta = state.BETA.slice(0, state.II);
  const oldBeta0 = state.BETA0.slice(0, state.II);
  state.TDES = state.TTOT;
  state.PDES = state.PTOT;
  state.CONV = false;

  state.EFFINV = state.PWAK / state.TWAK;
  const blds = Number(state.NBLDS);
  const zeta = 2.0 * (state.EFFINV - 1.0);
  const sFac = Math.sqrt(1.0 + 1.0 / state.ADW ** 2);
  for (let i = 0; i < state.II; i += 1) {
    const yy = state.XW[i] / state.ADV;
    let f;
    if (state.DUCT) {
      f = 1.0;
    } else {
      const arg = Math.min(20.0, 0.5 * blds * (1.0 - state.XW[i] / state.XWTIP) * sFac);
      const ek = Math.exp(-arg);
      const fk = Math.sqrt(1.0 - ek * ek);
      f = (Math.atan2(fk, ek) * 2.0) / PI;
    }
    state.GAM[i] = f * yy * yy / (1.0 + yy * yy) * (2.0 * PI * state.ADV / blds) * zeta * state.EFFINV;
  }

  const desmil = action.designSolver ?? hooks.DESMIL ?? ((solverState, icase) => getXdesi().DESMIL(solverState, icase));
  assert(typeof desmil === 'function', 'MODI OPTI: DESMIL solver is not available');
  const designResult = desmil(state, 3, action, hooks) ?? {};

  if (!state.CONV) {
    for (let i = 0; i < state.II; i += 1) {
      state.BETA[i] = oldBeta[i];
      state.BETA0[i] = oldBeta0[i];
    }
    return {
      converged: false,
      restored: true,
      designResult,
    };
  }

  const bladeAngleChanges = Array.from({ length: state.II }, (_, i) => ({
    index: i + 1,
    rOverR: state.XI[i],
    dBetaDeg: ((state.BETA[i] - oldBeta[i]) * 180.0) / PI,
  }));

  const brlx = action.relaxation ?? 1.0;
  if (brlx !== 0.0) {
    for (let i = 0; i < state.II; i += 1) {
      state.BETA[i] = oldBeta[i] + brlx * (state.BETA[i] - oldBeta[i]);
      state.BETA0[i] = oldBeta0[i] + brlx * (state.BETA0[i] - oldBeta0[i]);
    }

    if (state.DEST) {
      state.TSPEC = state.TTOT * (state.RHO * state.VEL ** 2 * state.RAD ** 2);
      xoper.APER(state, 1, 2, true);
    }
    if (state.DESP) {
      state.PSPEC = state.PTOT * (state.RHO * state.VEL ** 3 * state.RAD ** 2);
      xoper.APER(state, 3, 2, true);
    }
  }

  return {
    converged: state.CONV,
    designResult,
    relaxation: brlx,
    bladeAngleChanges,
    output: brlx !== 0.0 ? makeOutputBundle(state) : null,
    modified: brlx !== 0.0,
  };
}

function MODI(state, action = {}, hooks = {}) {
  const command = String(
    action.subcommand
    ?? action.modiCommand
    ?? action.action
    ?? (String(action.command ?? '').trim().toUpperCase() === 'MODI' ? '' : action.command)
    ?? action.name
    ?? action.value
    ?? '',
  ).trim().toUpperCase();
  if (command.length === 0) {
    return { commands: helpText() };
  }
  if (command === '?' || command === 'HELP') {
    return { commands: helpText() };
  }

  if (command === 'BLAD') {
    state.NBLDS = Math.trunc(action.nblades ?? action.value ?? state.NBLDS);
    return { NBLDS: state.NBLDS };
  }

  if (command === 'MODB') {
    return MODBE(state, action);
  }
  if (command === 'MODC') {
    return MODCH(state, action);
  }

  if (command === 'SCAL') {
    const a = action.a ?? action.A ?? action.value?.[0] ?? 1.0;
    const b = action.b ?? action.B ?? action.value?.[1] ?? 0.0;
    for (let i = 0; i < state.II; i += 1) {
      state.CH[i] = state.CH[i] * (a + b * state.XI[i]);
    }
    return { A: a, B: b, CH: state.CH.slice(0, state.II) };
  }

  if (command === 'TLIN') {
    const tdeg = action.tipAngleDeg ?? action.deg ?? action.value ?? 0.0;
    const trad = (tdeg * PI) / 180.0;
    for (let i = 0; i < state.II; i += 1) {
      state.BETA[i] += trad * state.XI[i] / state.XITIP;
      state.BETA0[i] += trad * state.XI[i] / state.XITIP;
    }
    return { tipAngleDeg: tdeg, BETA: state.BETA.slice(0, state.II), BETA0: state.BETA0.slice(0, state.II) };
  }

  if (command === 'RTIP') {
    const radNew = action.radius ?? action.value ?? state.RAD;
    state.XI0 = state.XI0 * state.RAD / radNew;
    state.XW0 = state.XW0 * state.RAD / radNew;
    state.RAD = radNew;
    getXrotor().SETX(state);
    xoper.XWINIT(state);
    return {
      RAD: state.RAD,
      XI0: state.XI0,
      XW0: state.XW0,
      XI: state.XI.slice(0, state.II),
      DXI: state.DXI.slice(0, state.II),
      XW: state.XW.slice(0, state.II),
      DXW: state.DXW.slice(0, state.II),
    };
  }

  if (command === 'RHUB') {
    const rhub = action.radius ?? action.value ?? (state.XI0 * state.RAD);
    state.XI0 = rhub / state.RAD;
    getXrotor().SETX(state);
    xoper.XWINIT(state);
    return {
      XI0: state.XI0,
      XI: state.XI.slice(0, state.II),
      DXI: state.DXI.slice(0, state.II),
      XW: state.XW.slice(0, state.II),
      DXW: state.DXW.slice(0, state.II),
    };
  }

  if (command === 'RWAK') {
    const rwak = action.radius ?? action.value ?? (state.XW0 * state.RAD);
    state.XW0 = rwak / state.RAD;
    xoper.XWINIT(state);
    return {
      XW0: state.XW0,
      XW: state.XW.slice(0, state.II),
      DXW: state.DXW.slice(0, state.II),
    };
  }

  if (command === 'RAKE') {
    const rakeDeg = action.deg ?? action.value ?? ((state.RAKE * 180.0) / PI);
    state.RAKE = (rakeDeg * PI) / 180.0;
    return { RAKE: state.RAKE, rakeDeg };
  }

  if (command === 'XPAX') {
    state.XPITCH = action.value ?? action.xPitch ?? state.XPITCH;
    return { XPITCH: state.XPITCH };
  }

  if (command === 'CLPI') {
    const hasInlineRadius = action.radius !== undefined || action.value !== undefined;
    const radInr = hasInlineRadius ? 0.0 : (state.XI0 * state.RAD);
    const w0 = state.XI.slice(0, state.II);
    const w1 = state.CH.slice(0, state.II);
    const w2 = new Float64Array(state.II);
    const w3 = state.BETA.slice(0, state.II);
    const w4 = new Float64Array(state.II);
    SPLINE(w1, w2, w0, state.II);
    SPLINE(w3, w4, w0, state.II);
    state.XI0 = radInr / state.RAD;
    getXrotor().SETX(state);
    xoper.XWINIT(state);
    for (let i = 0; i < state.II; i += 1) {
      state.CH[i] = SEVAL(state.XI[i], w1, w2, w0, w0.length);
      state.BETA[i] = SEVAL(state.XI[i], w3, w4, w0, w0.length);
    }
    return {
      XI0: state.XI0,
      XI: state.XI.slice(0, state.II),
      CH: state.CH.slice(0, state.II),
      BETA: state.BETA.slice(0, state.II),
      BETA0: state.BETA0.slice(0, state.II),
    };
  }

  if (command === 'CLPO') {
    const radNew = action.radius ?? action.value;
    const w0 = state.XI.slice(0, state.II);
    const w1 = state.CH.slice(0, state.II);
    const w2 = new Float64Array(state.II);
    const w3 = state.BETA.slice(0, state.II);
    const w4 = new Float64Array(state.II);
    SPLINE(w1, w2, w0, state.II);
    SPLINE(w3, w4, w0, state.II);
    const rrat = state.RAD / radNew;
    state.XI0 = state.XI0 * rrat;
    state.XW0 = state.XW0 * rrat;
    state.RAD = radNew;
    getXrotor().SETX(state);
    xoper.XWINIT(state);
    for (let i = 0; i < state.II; i += 1) {
      state.CH[i] = SEVAL(state.XI[i] / rrat, w1, w2, w0, w0.length) * rrat;
      state.BETA[i] = SEVAL(state.XI[i] / rrat, w3, w4, w0, w0.length);
    }
    return {
      RAD: state.RAD,
      XI0: state.XI0,
      XW0: state.XW0,
      XI: state.XI.slice(0, state.II),
      CH: state.CH.slice(0, state.II),
      BETA: state.BETA.slice(0, state.II),
      BETA0: state.BETA0.slice(0, state.II),
    };
  }

  if (command === 'OPTI') {
    return optimizeTwist(state, action, hooks);
  }

  if (command === 'PLOT') {
    const plotNumber = Math.trunc(action.plotNumber ?? action.value ?? 0);
    if (plotNumber === 0) {
      return { cancelled: true, plotNumber };
    }
    if (plotNumber === 10 && state.NADD < 2) {
      return { plotNumber, error: 'No slipstream profiles present' };
    }
    const info = PLOT_INFO(plotNumber);
    if (!info) {
      throw new Error('MODI: unsupported plot number');
    }
    const plotHook = hooks.PLOT ?? hooks[`PLOT${plotNumber}`];
    if (plotHook) {
      return plotHook(state, { ...action, plotNumber, info });
    }
    return {
      plotNumber,
      ...info,
      size: state.SIZE,
      statePlotEnabled: state.LPLOT,
      landscape: info.landscape === 'state' ? state.LLAND : info.landscape === 'invert' ? !state.LLAND : null,
      requiresHook: true,
    };
  }

  if (command === 'ANNO') {
    if (!state.LPLOT) {
      return { error: 'No current plot' };
    }
    const annotateHook = hooks.ANNO;
    if (annotateHook) {
      return annotateHook(state, action);
    }
    return { annotated: true, size: 1.2 * state.CSIZE };
  }

  if (command === 'HARD') {
    if (!state.LPLOT) {
      return { error: 'No current plot' };
    }
    const hardcopyHook = hooks.HARD;
    if (hardcopyHook) {
      return hardcopyHook(state, action);
    }
    return { hardcopy: true };
  }

  if (command === 'SIZE') {
    state.SIZE = action.size ?? action.value ?? state.SIZE;
    return { SIZE: state.SIZE };
  }

  throw new Error(`MODI: unsupported command ${command}`);
}

module.exports = {
  MODI,
  MODBE,
  MODCH,
  PLTMOD,
};
