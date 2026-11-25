/*! SPDX-License-Identifier: GPL-2.0-or-later
 * Original Fortran copyright (C) 2011 Mark Drela. JavaScript port: 2026-03-10.
 * Port corrections: 2026-11-25.
 */
'use strict';

const fs = require('node:fs');

const xoper = require('./xoper.js');
const xaero = require('./xaero.js');
const { GAUSS } = require('./xutils.js');
const { VRTXCO } = require('./vortex.js');
const { SCALIT } = require('./xnoise.js');
const { CRSMOD } = require('./modify.js');
const { SPLINE, SEVAL, SEGSPL } = require('./spline.js');

const IX = xoper.IX;
const IQ = xoper.IQ;
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

function allocateMatrix(rows, cols) {
  return Array.from({ length: rows }, () => new Float64Array(cols));
}

function getXrotor() {
  return require('./xrotor.js');
}

function helpText() {
  return [
    'INPU    Input  design parameters... design rotor',
    '.EDIT    Change design parameters... design rotor',
    '.FORM    Select slipstream and velocity formulation',
    'ATMO r  Set fluid properties from standard atmosphere',
    'DISP    Display current design point',
    'TERS    Toggle between terse and verbose output',
    'ITER i  Change max number of Newton iterations',
    'N    i  Change number of radial points',
    'NAME s  Set or change case name',
    'PLOT i  Plot various rotor parameters',
    'ANNO    Annotate current plot',
    'HARD    Hardcopy current plot',
    'SIZE r  Change plot-object size',
  ];
}

function editHelpText() {
  return [
    'I        Toggle rotor initialization before iteration',
    'B        Set number of blades',
    'RT/RTIP  Set tip radius',
    'RH/RHUB  Set hub radius',
    'RW/RWAK  Set hub wake displacement body radius',
    'V/VEL    Set airspeed',
    'A/ADV    Set advance ratio',
    'R/RPM    Set rpm',
    'T        Set thrust target',
    'P        Set power target',
    'CC       Set constant lift coefficient',
    'CL       Set linear lift coefficient (root, tip)',
    'CX       Modify CL(r/R) with cursor events',
    'CR       Read CL(r/R) from file',
    'CW       Write CL(r/R) to file',
  ];
}

function plotInfo(plotNumber) {
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

function buildPlotResult(state, plotNumber, action = {}, hooks = {}) {
  if (plotNumber === 0) {
    return { cancelled: true, plotNumber };
  }
  if (plotNumber === 10 && state.NADD < 2) {
    return { plotNumber, error: 'No slipstream profiles present' };
  }
  const info = plotInfo(plotNumber);
  if (!info) {
    throw new Error('DESI: unsupported plot number');
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

function currentDesignParameters(state) {
  return {
    NBLDS: state.NBLDS,
    RADDES: state.RADDES,
    R0DES: state.R0DES,
    RWDES: state.RWDES,
    VELDES: state.VELDES,
    ADVDES: state.ADVDES,
    RPMDES: state.RPMDES,
    TDDES: state.TDDES,
    PDDES: state.PDDES,
    CLDES0: state.CLDES0,
    DEST: state.DEST,
    DESP: state.DESP,
    LDESINI: state.LDESINI,
    CLDES: state.CLDES.slice(0, state.II),
  };
}

function makeOutputBundle(state) {
  return getXrotor().OUTPUT(state, state.LUWRIT);
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

function readClPoints(options = {}) {
  if (options.points) {
    return options.points.map((point) => [Number(point[0]), Number(point[1])]);
  }
  const text = options.text ?? fs.readFileSync(options.fileName, 'utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(/\s+/).slice(0, 2).map(Number))
    .filter((pair) => pair.length >= 2 && !pair.some((value) => Number.isNaN(value)));
}

function SETCLD(state, CL1, CL2, options = {}) {
  if (CL1 === 999.0) {
    const points = readClPoints(options);
    const n = Math.min(points.length, IX);
    const w1 = new Float64Array(Math.max(n, 1));
    const w2 = new Float64Array(Math.max(n, 1));
    const w3 = new Float64Array(Math.max(n, 1));
    for (let i = 0; i < n; i += 1) {
      w1[i] = points[i][0];
      w2[i] = points[i][1];
    }
    SEGSPL(w2, w3, w1, n);
    for (let i = 0; i < state.II; i += 1) {
      state.CLDES[i] = SEVAL(state.XI[i], w2, w3, w1, n);
    }
    return {
      mode: 'file',
      overflow: points.length > IX,
      CLDES: state.CLDES.slice(0, state.II),
    };
  }

  for (let i = 0; i < state.II; i += 1) {
    state.CLDES[i] = (1.0 - state.XI[i]) * CL1 + state.XI[i] * CL2;
  }
  return {
    mode: 'linear',
    CL1,
    CL2,
    CLDES: state.CLDES.slice(0, state.II),
  };
}

function SAVCLD(state, options = {}) {
  const fileName = options.fileName ?? options.value ?? '';
  if (fileName.length === 0) {
    return { written: false, fileName, text: '' };
  }
  const text = Array.from({ length: state.II }, (_, i) => `${state.XI[i]} ${state.CLDES[i]}`).join('\n') + '\n';
  if ((options.mode ?? 'overwrite') === 'skip') {
    return { written: false, fileName, text };
  }
  if (!options.overwrite && fs.existsSync(fileName)) {
    return { written: false, fileName, exists: true, text };
  }
  fs.writeFileSync(fileName, text, 'utf8');
  return { written: true, fileName, text };
}

function DESINI(state) {
  for (let i = 0; i < state.II; i += 1) {
    const xx = state.XI[i] / state.ADV;
    state.CH[i] = 0.1 * xx * xx * Math.sqrt(state.XITIP ** 2 - state.XI[i] ** 2) / (1.0 + xx * xx);
  }

  for (let i = 0; i < state.II; i += 1) {
    const w = Math.sqrt(1.0 + (state.XI[i] / state.ADV) ** 2);
    state.RE[i] = state.CH[i] * w * state.RHO * state.VEL * state.RAD / state.RMU;
    const alfa = xaero.GETALF(state, i + 1, state.CL[i], w);
    const aero = xaero.GETCLCDCM(state, i + 1, alfa.ALF, w, state.RE[i]);
    state.CL[i] = aero.CLIFT;
    state.CD[i] = aero.CDRAG;
    state.CM[i] = aero.CMOM;
    state.STALL[i] = aero.STALLF;
  }

  const blds = Number(state.NBLDS);
  let ri1 = 0.0;
  let ri2 = 0.0;
  let rj1 = 0.0;
  let rj2 = 0.0;
  const sFac = Math.sqrt(1.0 + 1.0 / state.ADW ** 2);
  for (let i = 0; i < state.II; i += 1) {
    const dx = state.DXW[i];
    const yy = state.XW[i] / state.ADV;
    const yyInv = 1.0 / (1.0 + yy * yy);
    const dol = state.CD[i] / state.CL[i];
    let f;
    if (state.DUCT) {
      f = 1.0;
    } else {
      const arg = Math.min(20.0, 0.5 * blds * (1.0 - state.XW[i] / state.XWTIP) * sFac);
      const ek = Math.exp(-arg);
      const fk = Math.sqrt(1.0 - ek * ek);
      f = (Math.atan2(fk, ek) * 2.0) / PI;
    }
    state.GAM[i] = f * yy * yy * yyInv;
    ri1 += 4.0 * state.XW[i] * state.GAM[i] * (1.0 - dol / yy) * dx;
    ri2 += 2.0 * state.XW[i] * state.GAM[i] * (1.0 - dol / yy) * dx * yyInv;
    rj1 += 4.0 * state.XW[i] * state.GAM[i] * (1.0 + dol * yy) * dx;
    rj2 += 2.0 * state.XW[i] * state.GAM[i] * (1.0 + dol * yy) * dx * yy * yy * yyInv;
  }

  let disc = 0.0;
  let zeta = 0.0;
  if (state.DEST) {
    disc = Math.max(0.0, 1.0 - (8.0 / PI) * state.TDES * ri2 / ri1 ** 2);
    zeta = 0.5 * ri1 / ri2 * (1.0 - Math.sqrt(disc));
  }
  if (state.DESP) {
    disc = Math.max(0.0, 1.0 + (8.0 / PI) * state.PDES * rj2 / rj1 ** 2);
    zeta = 0.5 * rj1 / rj2 * (Math.sqrt(disc) - 1.0);
  }

  for (let i = 0; i < state.II; i += 1) {
    state.GAM[i] = state.GAM[i] * (2.0 * PI * state.ADV / blds) * zeta;
  }

  state.EFFINV = 1.0 + 0.5 * zeta;
  if (state.FREE) {
    state.ADW = state.ADV * state.EFFINV;
  }

  if (!state.FAST) {
    if (!state.VRTX) {
      xoper.HELICO(IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
    } else {
      VRTXCO(IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
    }

    const q = allocateMatrix(IQ, IQ);
    const rhs = Array.from({ length: IQ }, () => new Float64Array(1));
    for (let i = 0; i < state.II; i += 1) {
      const yy = state.XW[i] / state.ADV;
      state.GAM[i] = 0.5 * zeta * yy / (1.0 + yy * yy);
      rhs[i][0] = state.GAM[i];
      for (let j = 0; j < state.II; j += 1) {
        q[i][j] = state.VIND_GAM[2][i][j];
      }
    }
    GAUSS(IQ, state.II, q, rhs, 1);
    for (let i = 0; i < state.II; i += 1) {
      state.GAM[i] = rhs[i][0];
    }
  }

  for (let i = 0; i < state.II; i += 1) {
    const w = Math.sqrt(1.0 + (state.XI[i] / state.ADV) ** 2);
    state.CH[i] = 2.0 * state.GAM[i] / (w * state.CL[i]);
  }

  state.LROTOR = true;
  return {
    ADW: state.ADW,
    EFFINV: state.EFFINV,
    CH: state.CH.slice(0, state.II),
    GAM: state.GAM.slice(0, state.II),
  };
}

function DEITER(state, ICASE) {
  const eps = 5.0e-7;
  const k1 = state.II + 1;
  const k2 = state.II + 2;
  const history = [];

  for (let iter = 1; iter <= Math.max(state.NITERD, 1); iter += 1) {
    if (state.FREE || iter === 1) {
      if (state.FAST) {
        xoper.GRADMO(IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
        state.IWTYP = 1;
      } else if (!state.VRTX) {
        xoper.HELICO(IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
        state.IWTYP = 2;
      } else {
        VRTXCO(IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
        state.IWTYP = 3;
      }
    }

    xoper.VCALC(state);
    xoper.SETXW(state);
    xoper.TPQ(state, ICASE);

    state.GRESMX = 0.0;
    state.FRESMX = 0.0;
    state.ARESMX = 0.0;

    const q = allocateMatrix(IQ, IQ);
    const rhs = Array.from({ length: IQ }, () => new Float64Array(1));
    let deff = state.DEFF ?? 0.0;
    let dgamdes = 0.0;

    for (let i = 1; i <= state.II; i += 1) {
      const vw = state.VWAK[i - 1];
      const vaw = (vw * state.XW[i - 1]) / state.ADW;
      const vawVw = state.XW[i - 1] / state.ADW;
      const vawXw = vw / state.ADW;
      const vawAdw = -vaw / state.ADW;

      const utotw = state.URDUCT;
      const { WA, WT } = xoper.UVADD(state, state.XI[i - 1]);

      const cw = state.XI[i - 1] / state.ADV - WT - vw;
      const cwAdv = -state.XI[i - 1] / state.ADV ** 2;
      const cwVw = -1.0;
      const cwXw = 0.0;

      const sw = utotw + WA + vaw;
      const swAdw = vawAdw;
      const swVw = vawVw;
      const swXw = vawXw;

      if (state.DUCT) {
        rhs[i - 1][0] = state.GAM[i - 1] - (state.GAMDES ?? 0.0);
        q[i - 1][i - 1] = 1.0;
        q[i - 1][k1 - 1] = -1.0;
      } else {
        const eiLoc = (sw / cw) * (state.XI[i - 1] / state.ADV);
        const eiSw = (1.0 / cw) * (state.XI[i - 1] / state.ADV);
        const eiCw = -eiLoc / cw;
        let eiXw = 0.0;
        let eiAdv = -eiLoc / state.ADV;

        const eiVw = eiSw * swVw + eiCw * cwVw;
        eiXw = eiSw * swXw + eiCw * cwXw + eiXw;
        eiAdv = eiCw * cwAdv + eiAdv;
        const eiAdw = eiSw * swAdw;

        if (eiVw === 0.0) {
          rhs[i - 1][0] = 0.0;
          q[i - 1][i - 1] = 1.0;
        } else {
          rhs[i - 1][0] = eiLoc - state.EFFINV;
          for (let j = 1; j <= state.II; j += 1) {
            q[i - 1][j - 1] = eiXw * state.XW_GAM[i - 1][j - 1] + eiVw * state.VW_GAM[i - 1][j - 1];
          }
          q[i - 1][k1 - 1] = -1.0;
          q[i - 1][k2 - 1] = eiXw * state.XW_ADW[i - 1] + eiVw * state.VW_ADW[i - 1] + eiAdw;
        }

        void eiAdv;
      }

      state.GRESMX = Math.max(state.GRESMX, Math.abs(rhs[i - 1][0]));
    }

    q[k1 - 1].fill(0.0);
    q[k2 - 1].fill(0.0);

    if (state.DEST) {
      rhs[k1 - 1][0] = state.TWAK + state.TVIS - state.TDES;
      for (let j = 1; j <= state.II; j += 1) {
        q[k1 - 1][j - 1] = state.TW_GAM[j - 1] + state.TV_GAM[j - 1];
      }
      q[k1 - 1][k2 - 1] = state.TW_ADW + state.TV_ADW;
      state.FRESMX = Math.max(state.FRESMX, Math.abs(rhs[k1 - 1][0] / state.TDES));
    } else if (state.DESP) {
      rhs[k1 - 1][0] = state.PWAK + state.PVIS - state.PDES;
      for (let j = 1; j <= state.II; j += 1) {
        q[k1 - 1][j - 1] = state.PW_GAM[j - 1] + state.PV_GAM[j - 1];
      }
      q[k1 - 1][k2 - 1] = state.PW_ADW + state.PV_ADW;
      state.FRESMX = Math.max(state.FRESMX, Math.abs(rhs[k1 - 1][0] / state.PDES));
    }

    if (state.FREE) {
      state.ADWFCTR = 1.0;
      const advFact = 1.0;
      rhs[k2 - 1][0] = state.ADWFCTR * state.ADW * state.TWAK / state.PWAK - state.ADV * advFact;
      const zTw = state.ADWFCTR * state.ADW / state.PWAK;
      const zPw = -state.ADWFCTR * state.ADW * state.TWAK / state.PWAK ** 2;
      for (let j = 1; j <= state.II; j += 1) {
        q[k2 - 1][j - 1] = zTw * state.TW_GAM[j - 1] + zPw * state.PW_GAM[j - 1];
      }
      q[k2 - 1][k2 - 1] = zTw * state.TW_ADW + zPw * state.PW_ADW + state.ADWFCTR * state.TWAK / state.PWAK;
      state.ARESMX = Math.max(state.ARESMX, Math.abs(rhs[k2 - 1][0] / state.ADV));
    } else {
      rhs[k2 - 1][0] = 0.0;
      q[k2 - 1][k2 - 1] = 1.0;
    }

    GAUSS(IQ, k2, q, rhs, 1);

    let rlx = 1.0;
    if (iter <= 2) {
      rlx = 0.2;
    }
    if (state.NITERD === 0) {
      rlx = 0.0;
    }

    for (let i = 1; i <= state.II; i += 1) {
      state.DGAM[i - 1] = -rhs[i - 1][0];
      if (state.GAM[i - 1] !== 0.0 && state.DGAM[i - 1] !== 0.0) {
        if (rlx * state.DGAM[i - 1] / state.GAM[i - 1] < -0.3) {
          rlx = -0.3 * state.GAM[i - 1] / state.DGAM[i - 1];
        }
        if (rlx * state.DGAM[i - 1] / state.GAM[i - 1] > 0.3) {
          rlx = 0.3 * state.GAM[i - 1] / state.DGAM[i - 1];
        }
      }
    }

    if (state.DUCT) {
      dgamdes = -rhs[k1 - 1][0];
    } else {
      deff = -rhs[k1 - 1][0];
      state.DEFF = deff;
    }

    state.DADW = -rhs[k2 - 1][0];
    if (state.DADW !== 0.0) {
      if (rlx * state.DADW > 0.5 * state.ADW) {
        rlx = Math.min(rlx, 0.5 * state.ADW / state.DADW);
      }
      if (rlx * state.DADW < -0.3 * state.ADW) {
        rlx = Math.min(rlx, -0.3 * state.ADW / state.DADW);
      }
    }

    let rms = 0.0;
    let gmx = 0.0;
    let imx = 0;
    for (let i = 1; i <= state.II; i += 1) {
      state.GAM[i - 1] = state.GAM[i - 1] + rlx * state.DGAM[i - 1];
      rms += state.DGAM[i - 1] ** 2 / (1.0 + 1.0 / state.ADV ** 2);
      if (Math.abs(state.DGAM[i - 1]) >= Math.abs(gmx)) {
        gmx = state.DGAM[i - 1];
        imx = i;
      }
    }
    rms = Math.sqrt(rms / Number(state.II));
    state.RMS = rms;
    state.RLX = rlx;

    if (state.DUCT) {
      state.GAMDES = (state.GAMDES ?? 0.0) + rlx * dgamdes;
    } else {
      state.EFFINV = state.EFFINV + rlx * deff;
    }
    state.ADW = state.ADW + rlx * state.DADW;

    history.push({
      ITER: iter,
      GMAX: gmx,
      IMAX: imx,
      RMS: rms,
      DEFF: deff,
      DGAMDES: dgamdes,
      EFFINV: state.EFFINV,
      GAMDES: state.GAMDES ?? 0.0,
      ADW: state.ADW,
      RLX: rlx,
    });

    if (rlx < 0.2) {
      xoper.FILTER(state.GAM, 0.2 * state.II, state.II);
    }

    if (Math.max(rms, Math.abs(state.DADW)) <= eps && Math.abs(deff) <= eps * state.EFFINV) {
      if (state.FREE) {
        if (state.FAST) {
          xoper.GRADMO(IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
          state.IWTYP = 1;
        } else if (!state.VRTX) {
          xoper.HELICO(IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
          state.IWTYP = 2;
        } else {
          VRTXCO(IX, state.II, state.NBLDS, state.DUCT, state.RAKE, state.XI, state.XV, state.GAM, state.ADW, state.VIND_GAM, state.VIND_ADW);
          state.IWTYP = 3;
        }
      }

      xoper.VCALC(state);
      xoper.TPQ(state, ICASE);
      state.CONV = true;
      state.GRESMX = state.GRESMX;
      state.FRESMX = state.FRESMX;
      state.ARESMX = state.ARESMX;
      return {
        converged: true,
        history,
        GRESMX: state.GRESMX,
        FRESMX: state.FRESMX,
        ARESMX: state.ARESMX,
      };
    }
  }

  state.CONV = false;
  return {
    converged: false,
    history,
    GRESMX: state.GRESMX,
    FRESMX: state.FRESMX,
    ARESMX: state.ARESMX,
  };
}

function DESMIL(state, ICASE) {
  const result = DEITER(state, ICASE);
  let formulation;
  if (state.FAST) {
    formulation = 'Graded Momentum';
  } else if (!state.VRTX) {
    formulation = 'Potential';
  } else {
    formulation = 'Vortex Wake';
  }
  return {
    ...result,
    formulation,
    mode: ICASE,
  };
}

function DESGEN(state, options = {}) {
  const section = xaero.GETAERO(state, 1);
  for (let i = 0; i < state.II; i += 1) {
    if (state.CLDES[i] > section.CLMAX || state.CLDES[i] < section.CLMIN) {
      return {
        converged: false,
        error: `Design CL is past stall limit at r/R = ${state.XI[i]}`,
        index: i + 1,
        CLMIN: section.CLMIN,
        CLMAX: section.CLMAX,
      };
    }
  }

  state.CONV = false;
  state.RAD = state.RADDES;
  state.VEL = state.VELDES;
  if (state.ADVDES === 0.0) {
    state.ADV = state.VELDES / (state.RADDES * state.RPMDES * PI / 30.0);
  } else {
    state.ADV = state.ADVDES;
  }

  const tMin = -0.5 * PI * state.RHO * state.VEL ** 2 * state.RAD ** 2;
  const pMin = -0.5 * PI * state.RHO * state.VEL ** 3 * state.RAD ** 2 * 16.0 / 27.0;
  const overBetz = (state.DEST && state.TDDES < tMin) || (state.DESP && state.PDDES < pMin);
  if (overBetz && !options.force) {
    return {
      converged: false,
      error: 'Disk loading above ultimate Betz limits',
      requiresConfirmation: true,
      limits: {
        TMIN: tMin,
        PMIN: pMin,
      },
    };
  }

  state.TDES = state.TDDES / (state.RHO * state.VEL ** 2 * state.RAD ** 2);
  state.PDES = state.PDDES / (state.RHO * state.VEL ** 3 * state.RAD ** 2);
  state.XI0 = state.R0DES / state.RAD;
  state.XW0 = state.RWDES / state.RAD;
  getXrotor().SETX(state);
  xoper.XWINIT(state);

  for (let i = 0; i < state.II; i += 1) {
    state.CL[i] = state.CLDES[i];
    state.STALL[i] = false;
  }

  state.EFFINV = 1.0;
  if (state.FREE && state.DEST) {
    state.EFFINV = 0.50 * Math.sqrt(Math.abs(1.0 + state.TDES * 2.0 / PI)) + 0.50;
  }
  if (state.FREE && state.DESP) {
    state.EFFINV = 0.25 * Math.sqrt(Math.abs(1.0 + state.PDES * 4.0 / PI)) + 0.75;
  }

  state.ADW = state.EFFINV * state.ADV;
  if (state.LDESINI || !state.LROTOR) {
    DESINI(state);
  }

  const mil = DESMIL(state, 2);
  return {
    ...mil,
    output: state.CONV ? makeOutputBundle(state) : null,
  };
}

function MODCL(state, action = {}) {
  const PLFAC = 0.95;
  const PLPAR = 1.20 * state.PAR;
  const SH = 0.3 * state.CSIZE;
  const NSPLT = 1;
  const w1 = new Float64Array(state.II);
  const w2 = new Float64Array(state.II);
  const w3 = new Float64Array(state.II);

  let cldMax = state.CLDES[0];
  for (let i = 0; i < state.II; i += 1) {
    w1[i] = state.XI[i];
    w2[i] = state.CLDES[i];
    cldMax = Math.max(state.CLDES[i], cldMax);
  }
  SPLINE(w2, w3, w1, state.II);

  const dy = 0.05;
  const ylims = new Float64Array([0.0, 1.25 * cldMax]);
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
    state.CLDES[i - 1] = w2[i - 1];
  }
  if (cursor.IMOD2 > cursor.IMOD1) {
    state.CLDES0 = 0.0;
  }

  return {
    IMOD1: cursor.IMOD1,
    IMOD2: cursor.IMOD2,
    plot,
    cursor,
    CLDES: state.CLDES.slice(0, state.II),
  };
}

function applyInputDesign(state, action = {}) {
  state.NBLDS = Math.trunc(action.nblades ?? state.NBLDS);
  state.RADDES = action.tipRadius ?? action.RADDES ?? state.RADDES;
  state.R0DES = action.hubRadius ?? action.R0DES ?? state.R0DES;
  state.RWDES = action.wakeRadius ?? action.RWDES ?? state.RWDES;
  state.VELDES = action.airspeed ?? action.VELDES ?? state.VELDES;
  state.ADVDES = action.advanceRatio ?? action.ADVDES ?? 0.0;
  state.RPMDES = state.ADVDES === 0.0 ? (action.rpm ?? action.RPMDES ?? state.RPMDES) : 0.0;
  state.TDDES = action.thrust ?? action.TDDES ?? 0.0;
  state.PDDES = state.TDDES === 0.0 ? (action.power ?? action.PDDES ?? state.PDDES) : 0.0;
  state.DEST = state.TDDES !== 0.0;
  state.DESP = !state.DEST;

  const warnings = [];
  const cldes0 = action.liftCoefficient ?? action.CLDES0 ?? state.CLDES0;
  state.CLDES0 = cldes0;
  if (cldes0 === 0.0) {
    let cldes1 = 0.0;
    if (state.DEST) {
      cldes1 = Math.sign(state.TDDES || 1.0) * 0.8;
    }
    if (state.DESP) {
      cldes1 = Math.sign(state.PDDES || 1.0) * 0.8;
    }
    SETCLD(state, cldes1, cldes1, action);
  } else {
    SETCLD(state, cldes0, cldes0, action);
  }

  if (state.NAME === '') {
    state.NAME = 'Designed blade';
  }
  if (state.DEST && state.TDDES * state.CLDES0 < 0.0) {
    warnings.push('WARNING: Design thrust and CL should have the same sign.');
  }
  if (state.DESP && state.PDDES * state.CLDES0 < 0.0) {
    warnings.push('WARNING: Design power and CL should have the same sign.');
  }

  state.LROTOR = false;
  return {
    warnings,
    parameters: currentDesignParameters(state),
  };
}

function runEditCommand(state, action = {}, hooks = {}) {
  const command = String(action.editCommand ?? action.parameter ?? action.name ?? '').trim().toUpperCase();
  if (command.length === 0) {
    const generated = action.generate ? DESGEN(state, action) : null;
    return {
      parameters: currentDesignParameters(state),
      generated,
      plot: action.generate ? buildPlotResult(state, 4, action, hooks) : null,
    };
  }
  if (command === '?' || command === 'HELP') {
    return { commands: editHelpText(), parameters: currentDesignParameters(state) };
  }

  if (command === 'I') {
    state.LDESINI = !state.LDESINI;
    return { LDESINI: state.LDESINI };
  }
  if (command === 'B') {
    state.NBLDS = Math.trunc(action.value ?? action.nblades ?? state.NBLDS);
    return { NBLDS: state.NBLDS };
  }
  if (command === 'RT' || command === 'RTIP') {
    state.RADDES = action.value ?? action.tipRadius ?? state.RADDES;
    return { RADDES: state.RADDES };
  }
  if (command === 'RH' || command === 'RHUB') {
    state.R0DES = action.value ?? action.hubRadius ?? state.R0DES;
    return { R0DES: state.R0DES };
  }
  if (command === 'RW' || command === 'RWAK') {
    state.RWDES = action.value ?? action.wakeRadius ?? state.RWDES;
    return { RWDES: state.RWDES };
  }
  if (command === 'V' || command === 'VEL') {
    state.VELDES = action.value ?? action.airspeed ?? state.VELDES;
    return { VELDES: state.VELDES };
  }
  if (command === 'A' || command === 'ADV') {
    state.ADVDES = action.value ?? action.advanceRatio ?? state.ADVDES;
    state.RPMDES = 0.0;
    return { ADVDES: state.ADVDES, RPMDES: state.RPMDES };
  }
  if (command === 'R' || command === 'RPM') {
    state.RPMDES = action.value ?? action.rpm ?? state.RPMDES;
    state.ADVDES = 0.0;
    return { RPMDES: state.RPMDES, ADVDES: state.ADVDES };
  }
  if (command === 'T') {
    state.TDDES = action.value ?? action.thrust ?? state.TDDES;
    state.DEST = true;
    state.DESP = false;
    state.PDDES = 0.0;
    return { TDDES: state.TDDES, DEST: state.DEST, DESP: state.DESP };
  }
  if (command === 'P') {
    state.PDDES = action.value ?? action.power ?? state.PDDES;
    state.DEST = false;
    state.DESP = true;
    state.TDDES = 0.0;
    return { PDDES: state.PDDES, DEST: state.DEST, DESP: state.DESP };
  }
  if (command === 'CC') {
    state.CLDES0 = action.value ?? action.cl ?? state.CLDES0;
    return {
      CLDES0: state.CLDES0,
      ...SETCLD(state, state.CLDES0, state.CLDES0, action),
    };
  }
  if (command === 'CL') {
    const clRoot = action.root ?? action.value?.[0];
    const clTip = action.tip ?? action.value?.[1];
    state.CLDES0 = 0.5 * (clRoot + clTip);
    return {
      CLDES0: state.CLDES0,
      ...SETCLD(state, clRoot, clTip, action),
    };
  }
  if (command === 'CR') {
    return SETCLD(state, 999.0, 999.0, action);
  }
  if (command === 'CW') {
    return SAVCLD(state, action);
  }
  if (command === 'CX') {
    state.XI0 = state.R0DES / state.RADDES;
    state.XITIP = 1.0;
    getXrotor().SETX(state);
    return MODCL(state, action);
  }

  throw new Error(`DESI EDIT: unsupported parameter ${command}`);
}

function DESI(state, action = {}, hooks = {}) {
  const command = String(
    action.subcommand
    ?? action.desiCommand
    ?? action.action
    ?? (String(action.command ?? '').trim().toUpperCase() === 'DESI' ? '' : action.command)
    ?? '',
  ).trim().toUpperCase();

  if (command.length === 0) {
    return { commands: helpText(), parameters: currentDesignParameters(state) };
  }
  if (command === '?' || command === 'HELP') {
    return { commands: helpText(), parameters: currentDesignParameters(state) };
  }

  if (command === 'FORM') {
    const formCommand = String(action.formCommand ?? action.value ?? '').trim().toUpperCase();
    if (formCommand === 'GRAD') {
      state.VRTX = false;
      state.FAST = true;
    } else if (formCommand === 'POT') {
      state.VRTX = false;
      state.FAST = false;
    } else if (formCommand === 'VRTX') {
      state.VRTX = true;
    } else if (formCommand === 'WAKE') {
      state.FREE = !state.FREE;
    }
    return {
      VRTX: state.VRTX,
      FAST: state.FAST,
      FREE: state.FREE,
    };
  }

  if (command === 'INPU') {
    const input = applyInputDesign(state, action);
    const generated = action.generate === false ? null : DESGEN(state, action);
    return {
      ...input,
      generated,
      plot: generated ? buildPlotResult(state, 4, action, hooks) : null,
    };
  }

  if (command === 'EDIT') {
    return runEditCommand(state, action, hooks);
  }

  if (command === 'ATMO') {
    state.ALT = action.altitude ?? action.value ?? state.ALT;
    const atmo = getXrotor().ATMO(state.ALT);
    state.VSO = atmo.VSOALT;
    state.RHO = atmo.RHOALT;
    state.RMU = atmo.RMUALT;
    return {
      ALT: state.ALT,
      ...atmo,
      fluid: getXrotor().FLOSHO(state.LUWRIT, state.VSO, state.RHO, state.RMU),
    };
  }

  if (command === 'DISP') {
    return makeOutputBundle(state);
  }

  if (command === 'TERS') {
    state.TERSE = !state.TERSE;
    return { TERSE: state.TERSE };
  }

  if (command === 'NAME') {
    state.NAME = String(action.value ?? action.name ?? action.caseName ?? state.NAME);
    return { NAME: state.NAME };
  }

  if (command === 'PLOT') {
    const plotNumber = Math.trunc(action.plotNumber ?? action.value ?? 0);
    return buildPlotResult(state, plotNumber, action, hooks);
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

  if (command === 'ITER') {
    const value = Math.trunc(action.iterations ?? action.value ?? state.NITERD);
    state.NITERD = value;
    state.NITERA = value;
    return { NITERD: state.NITERD, NITERA: state.NITERA };
  }

  if (command === 'N') {
    if (state.LROTOR) {
      const iiSav = state.II;
      const w1 = state.XI.slice(0, iiSav);
      const w2 = state.CH.slice(0, iiSav);
      const w3 = new Float64Array(iiSav);
      const w4 = state.BETA.slice(0, iiSav);
      const w5 = new Float64Array(iiSav);
      const w6 = state.UBODY.slice(0, iiSav);
      const w7 = new Float64Array(iiSav);
      const w8 = state.CLDES.slice(0, iiSav);
      const w9 = new Float64Array(iiSav);
      SPLINE(w2, w3, w1, iiSav);
      SPLINE(w4, w5, w1, iiSav);
      SPLINE(w6, w7, w1, iiSav);
      SPLINE(w8, w9, w1, iiSav);
      state.II = Math.trunc(action.value ?? action.count ?? state.II);
      assert(state.II <= IX, `DESI N: maximum number is ${IX}`);
      state.IINF = state.II + Math.trunc(state.II / 2);
      getXrotor().SETX(state);
      for (let i = 0; i < state.II; i += 1) {
        state.CH[i] = SEVAL(state.XI[i], w2, w3, w1, iiSav);
        state.BETA[i] = SEVAL(state.XI[i], w4, w5, w1, iiSav);
        state.UBODY[i] = SEVAL(state.XI[i], w6, w7, w1, iiSav);
        state.CLDES[i] = SEVAL(state.XI[i], w8, w9, w1, iiSav);
        state.BETA0[i] = state.BETA[i];
      }
    } else {
      state.II = Math.trunc(action.value ?? action.count ?? state.II);
      assert(state.II <= IX, `DESI N: maximum number is ${IX}`);
      state.IINF = state.II + Math.trunc(state.II / 2);
      getXrotor().SETX(state);
    }
    return {
      II: state.II,
      IINF: state.IINF,
      XI: state.XI.slice(0, state.II),
      CH: state.CH.slice(0, state.II),
      BETA: state.BETA.slice(0, state.II),
      CLDES: state.CLDES.slice(0, state.II),
    };
  }

  if (command === 'Z') {
    return { zoom: true };
  }

  if (command === 'U') {
    return { unzoom: true };
  }

  throw new Error(`DESI: unsupported command ${command}`);
}

module.exports = {
  DESI,
  DESGEN,
  DESINI,
  DESMIL,
  DEITER,
  SETCLD,
  SAVCLD,
  MODCL,
};
