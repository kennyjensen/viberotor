'use strict';

const IX = 100;
const NAX = 20;
const NDX = 14;
const PI = 3.141592654;

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

function ensureMatrix(value, rows, cols, name) {
  assert(Array.isArray(value), `${name}: expected an array of rows`);
  assert(value.length >= rows, `${name}: expected at least ${rows} rows`);
  for (let i = 0; i < rows; i += 1) {
    ensureVector(value[i], cols, `${name}[${i}]`);
  }
  return value;
}

function allocateAeroData() {
  return Array.from({ length: NDX }, () => new Float64Array(NAX));
}

function copyFloat64(length, source = []) {
  const out = new Float64Array(length);
  const limit = Math.min(length, source.length ?? 0);
  for (let i = 0; i < limit; i += 1) {
    out[i] = source[i];
  }
  return out;
}

function copyInt32(length, source = []) {
  const out = new Int32Array(length);
  const limit = Math.min(length, source.length ?? 0);
  for (let i = 0; i < limit; i += 1) {
    out[i] = Math.trunc(source[i]);
  }
  return out;
}

function copyAeroData(source) {
  const out = allocateAeroData();
  if (!source) {
    return out;
  }
  for (let row = 0; row < Math.min(NDX, source.length); row += 1) {
    const dataRow = source[row];
    for (let col = 0; col < Math.min(NAX, dataRow.length); col += 1) {
      out[row][col] = dataRow[col];
    }
  }
  return out;
}

function createState(overrides = {}) {
  const state = {
    II: overrides.II ?? 0,
    NAERO: overrides.NAERO ?? 0,
    XI: copyFloat64(IX, overrides.XI),
    IAERO: copyInt32(IX, overrides.IAERO),
    XIAERO: copyFloat64(NAX, overrides.XIAERO),
    AERODATA: copyAeroData(overrides.AERODATA),
    VEL: overrides.VEL ?? 0.0,
    VSO: overrides.VSO ?? 1.0,
    WIND: Boolean(overrides.WIND),
    CONV: Boolean(overrides.CONV),
    NAME: overrides.NAME ?? '',
    LGRID: Boolean(overrides.LGRID),
  };

  ensureVector(state.XI, IX, 'state.XI');
  ensureVector(state.IAERO, IX, 'state.IAERO');
  ensureVector(state.XIAERO, NAX, 'state.XIAERO');
  ensureMatrix(state.AERODATA, NDX, NAX, 'state.AERODATA');

  return state;
}

function sectionFields(values) {
  return {
    XISECT: values.XISECT,
    A0: values.A0,
    CLMAX: values.CLMAX,
    CLMIN: values.CLMIN,
    DCLDA: values.DCLDA,
    DCLDA_STALL: values.DCLDA_STALL,
    DCL_STALL: values.DCL_STALL,
    CDMIN: values.CDMIN,
    CLDMIN: values.CLDMIN,
    DCDCL2: values.DCDCL2,
    CMCON: values.CMCON,
    MCRIT: values.MCRIT,
    REREF: values.REREF,
    REXP: values.REXP,
    TOC: values.TOC ?? 0.0,
  };
}

function sectionFromState(state, index) {
  const n = index - 1;
  return sectionFields({
    XISECT: state.XIAERO[n],
    A0: state.AERODATA[0][n],
    CLMAX: state.AERODATA[1][n],
    CLMIN: state.AERODATA[2][n],
    DCLDA: state.AERODATA[3][n],
    DCLDA_STALL: state.AERODATA[4][n],
    DCL_STALL: state.AERODATA[5][n],
    CDMIN: state.AERODATA[6][n],
    CLDMIN: state.AERODATA[7][n],
    DCDCL2: state.AERODATA[8][n],
    CMCON: state.AERODATA[9][n],
    REREF: state.AERODATA[10][n],
    REXP: state.AERODATA[11][n],
    MCRIT: state.AERODATA[12][n],
    TOC: state.AERODATA[13][n],
  });
}

function GETAERO(state, N) {
  assert(state && typeof state === 'object', 'GETAERO: expected a state object');
  if (N < 1 || N > state.NAERO) {
    throw new Error('GETAERO: index of aero section out of bounds');
  }
  return sectionFromState(state, N);
}

function PUTAERO(
  state,
  N,
  XISECT,
  A0,
  CLMAX,
  CLMIN,
  DCLDA,
  DCLDA_STALL,
  DCL_STALL,
  CDMIN,
  CLDMIN,
  DCDCL2,
  CMCON,
  MCRIT,
  REREF,
  REXP,
  TOC = null,
) {
  assert(state && typeof state === 'object', 'PUTAERO: expected a state object');
  if (N > NAX) {
    throw new Error('PUTAERO: Too many aero sections defined');
  }

  const n = N - 1;
  state.AERODATA[0][n] = A0;
  state.AERODATA[1][n] = CLMAX;
  state.AERODATA[2][n] = CLMIN;
  state.AERODATA[3][n] = DCLDA;
  state.AERODATA[4][n] = DCLDA_STALL;
  state.AERODATA[5][n] = DCL_STALL;
  state.AERODATA[6][n] = CDMIN;
  state.AERODATA[7][n] = CLDMIN;
  state.AERODATA[8][n] = DCDCL2;
  state.AERODATA[9][n] = CMCON;
  state.AERODATA[10][n] = REREF;
  state.AERODATA[11][n] = REXP;
  state.AERODATA[12][n] = MCRIT;
  if (TOC !== null) {
    state.AERODATA[13][n] = TOC;
  }
  state.XIAERO[n] = XISECT;

  return state;
}

function SORTAR(NS, S, W, NDIM) {
  const s = ensureVector(S, NS, 'S');
  const w = ensureMatrix(W, NDIM, NS, 'W');

  for (let ipass = 1; ipass <= 500; ipass += 1) {
    let done = true;
    for (let n = 1; n <= NS - 1; n += 1) {
      const np = n + 1;
      if (s[np - 1] < s[n - 1]) {
        const temp = s[np - 1];
        s[np - 1] = s[n - 1];
        s[n - 1] = temp;
        for (let l = 1; l <= NDIM; l += 1) {
          const wtemp = w[l - 1][np - 1];
          w[l - 1][np - 1] = w[l - 1][n - 1];
          w[l - 1][n - 1] = wtemp;
        }
        done = false;
      }
    }
    if (done) {
      return { S: s, W: w };
    }
  }

  throw new Error('SORTAR failed');
}

function SETIAERO(state) {
  assert(state && typeof state === 'object', 'SETIAERO: expected a state object');
  ensureVector(state.XI, state.II, 'state.XI');
  ensureVector(state.IAERO, state.II, 'state.IAERO');
  ensureVector(state.XIAERO, state.NAERO, 'state.XIAERO');

  for (let i = 1; i <= state.II; i += 1) {
    state.IAERO[i - 1] = 1;
    for (let n = 1; n <= state.NAERO; n += 1) {
      if (state.XIAERO[n - 1] <= state.XI[i - 1]) {
        state.IAERO[i - 1] = n;
      }
    }
  }

  return state.IAERO;
}

function CLCDCM(
  ALF,
  W,
  REY,
  A0,
  CLMAX,
  CLMIN,
  DCLDA,
  DCLDA_STALL,
  DCL_STALL,
  CDMIN,
  CLDMIN,
  DCDCL2,
  CMCON,
  MCRIT,
  REREF,
  REXP,
  state,
) {
  assert(state && typeof state === 'object', 'CLCDCM: expected a state object');

  const CDMFACTOR = 10.0;
  const CLMFACTOR = 0.25;
  const MEXP = 3.0;
  const CDMDD = 0.0020;
  const CDMSTALL = 0.1000;

  let msq = W * W * state.VEL ** 2 / state.VSO ** 2;
  let msqW = 2.0 * W * state.VEL ** 2 / state.VSO ** 2;
  let machClipped = false;
  if (msq >= 1.0) {
    msq = 0.99;
    msqW = 0.0;
    machClipped = true;
  }
  const pg = 1.0 / Math.sqrt(1.0 - msq);
  const pgW = 0.5 * msqW * pg ** 3;

  const mach = Math.sqrt(msq);
  let machW = 0.0;
  if (mach !== 0.0) {
    machW = 0.5 * msqW / mach;
  }

  const cla = DCLDA * pg * (ALF - A0);
  const claAlf = DCLDA * pg;
  const claW = DCLDA * pgW * (ALF - A0);

  const dmstall = (CDMSTALL / CDMFACTOR) ** (1.0 / MEXP);
  const clmaxm = Math.max(0.0, (MCRIT + dmstall - mach) / CLMFACTOR) + CLDMIN;
  let clmax = Math.min(CLMAX, clmaxm);
  const clminm = Math.min(0.0, -(MCRIT + dmstall - mach) / CLMFACTOR) + CLDMIN;
  let clmin = Math.max(CLMIN, clminm);

  const ecmax = Math.exp(Math.min(200.0, (cla - clmax) / DCL_STALL));
  const ecmin = Math.exp(Math.min(200.0, (clmin - cla) / DCL_STALL));
  const cllim = DCL_STALL * Math.log((1.0 + ecmax) / (1.0 + ecmin));
  const cllimCla = ecmax / (1.0 + ecmax) + ecmin / (1.0 + ecmin);

  let fstall = DCLDA_STALL / DCLDA;
  const clift = cla - (1.0 - fstall) * cllim;
  const clAlf = claAlf - (1.0 - fstall) * cllimCla * claAlf;
  const clW = claW - (1.0 - fstall) * cllimCla * claW;

  let stallf = false;
  if (clift > clmax) {
    stallf = true;
  }
  if (clift < clmin) {
    stallf = true;
  }

  const cmom = pg * CMCON;
  const cmAl = 0.0;
  const cmW = pgW * CMCON;

  let rcorr;
  let rcorrRey;
  if (REY <= 0.0) {
    rcorr = 1.0;
    rcorrRey = 0.0;
  } else {
    rcorr = (REY / REREF) ** REXP;
    rcorrRey = REXP / REY;
  }

  let cdrag = (CDMIN + DCDCL2 * (clift - CLDMIN) ** 2) * rcorr;
  let cdAlf = (2.0 * DCDCL2 * (clift - CLDMIN) * clAlf) * rcorr;
  let cdW = (2.0 * DCDCL2 * (clift - CLDMIN) * clW) * rcorr;
  let cdRey = cdrag * rcorrRey;

  fstall = DCLDA_STALL / DCLDA;
  const dcdx = ((1.0 - fstall) * cllim) / (pg * DCLDA);
  const dcd = 2.0 * dcdx ** 2;
  const dcdAlf = (4.0 * dcdx * (1.0 - fstall) * cllimCla * claAlf) / (pg * DCLDA);
  const dcdW =
    4.0 *
    dcdx *
    (((1.0 - fstall) * cllimCla * claW) / (pg * DCLDA) - (dcd / pg) * pgW);

  const dmdd = (CDMDD / CDMFACTOR) ** (1.0 / MEXP);
  const critmach = MCRIT - CLMFACTOR * Math.abs(clift - CLDMIN) - dmdd;
  const critmachAlf = -CLMFACTOR * Math.abs(clAlf);
  const critmachW = -CLMFACTOR * Math.abs(clW);

  let cdc;
  let cdcAlf;
  let cdcW;
  if (mach < critmach) {
    cdc = 0.0;
    cdcAlf = 0.0;
    cdcW = 0.0;
  } else {
    cdc = CDMFACTOR * (mach - critmach) ** MEXP;
    cdcW = (MEXP * machW * cdc) / mach - (MEXP * critmachW * cdc) / critmach;
    cdcAlf = -(MEXP * critmachAlf * cdc) / critmach;
  }

  const fac = 1.0;
  const facW = 0.0;
  cdrag = fac * cdrag + dcd + cdc;
  cdAlf = fac * cdAlf + dcdAlf + cdcAlf;
  cdW = fac * cdW + facW * cdrag + dcdW + cdcW;
  cdRey = fac * cdRey;

  return {
    CLIFT: clift,
    CL_ALF: clAlf,
    CL_W: clW,
    CLMAX: clmax,
    CLMIN: clmin,
    DCL_STALL,
    STALLF: stallf,
    CDRAG: cdrag,
    CD_ALF: cdAlf,
    CD_W: cdW,
    CD_REY: cdRey,
    CMOM: cmom,
    CM_AL: cmAl,
    CM_W: cmW,
    machClipped,
  };
}

function GETCLCDCM(state, IS, ALF, W, REY) {
  assert(state && typeof state === 'object', 'GETCLCDCM: expected a state object');
  assert(IS >= 1 && IS <= state.II, 'GETCLCDCM: station index out of bounds');

  let n = state.IAERO[IS - 1];
  if (n < 1 || n > state.NAERO) {
    let foundUpperBound = false;
    if (state.NAERO > 1) {
      for (n = 1; n <= state.NAERO; n += 1) {
        if (state.XIAERO[n - 1] <= state.XI[IS - 1]) {
          state.IAERO[IS - 1] = n;
        } else {
          foundUpperBound = true;
          break;
        }
      }
    }
    if (!foundUpperBound) {
      n = 1;
      state.IAERO[IS - 1] = n;
    }
  }

  const section1 = GETAERO(state, n);
  let result = CLCDCM(
    ALF,
    W,
    REY,
    section1.A0,
    section1.CLMAX,
    section1.CLMIN,
    section1.DCLDA,
    section1.DCLDA_STALL,
    section1.DCL_STALL,
    section1.CDMIN,
    section1.CLDMIN,
    section1.DCDCL2,
    section1.CMCON,
    section1.MCRIT,
    section1.REREF,
    section1.REXP,
    state,
  );

  if (n < state.NAERO) {
    const x1 = state.XIAERO[n - 1];
    const x2 = state.XIAERO[n];
    const frac = (state.XI[IS - 1] - x1) / (x2 - x1);
    const section2 = GETAERO(state, n + 1);
    const result2 = CLCDCM(
      ALF,
      W,
      REY,
      section2.A0,
      section2.CLMAX,
      section2.CLMIN,
      section2.DCLDA,
      section2.DCLDA_STALL,
      section2.DCL_STALL,
      section2.CDMIN,
      section2.CLDMIN,
      section2.DCDCL2,
      section2.CMCON,
      section2.MCRIT,
      section2.REREF,
      section2.REXP,
      state,
    );

    result = {
      ...result,
      STALLF: result.STALLF || result2.STALLF,
      CLIFT: (1.0 - frac) * result.CLIFT + frac * result2.CLIFT,
      CL_ALF: (1.0 - frac) * result.CL_ALF + frac * result2.CL_ALF,
      CL_W: (1.0 - frac) * result.CL_W + frac * result2.CL_W,
      CLMAX: (1.0 - frac) * result.CLMAX + frac * result2.CLMAX,
      CLMIN: (1.0 - frac) * result.CLMIN + frac * result2.CLMIN,
      DCL_STALL: (1.0 - frac) * result.DCL_STALL + frac * result2.DCL_STALL,
      CMOM: (1.0 - frac) * result.CMOM + frac * result2.CMOM,
      CM_AL: (1.0 - frac) * result.CM_AL + frac * result2.CM_AL,
      CM_W: (1.0 - frac) * result.CM_W + frac * result2.CM_W,
      CDRAG: (1.0 - frac) * result.CDRAG + frac * result2.CDRAG,
      CD_ALF: (1.0 - frac) * result.CD_ALF + frac * result2.CD_ALF,
      CD_W: (1.0 - frac) * result.CD_W + frac * result2.CD_W,
      CD_REY: (1.0 - frac) * result.CD_REY + frac * result2.CD_REY,
      machClipped: result.machClipped || result2.machClipped,
    };
  }

  return result;
}

function GETALF(state, IS, CLIFT, W) {
  assert(state && typeof state === 'object', 'GETALF: expected a state object');
  const NITER = 10;
  const EPS = 1.0e-5;
  let stallf = false;
  const a0 = state.AERODATA[0][0];
  const rey = 0.0;

  let alf = a0;
  let alfCl = 0.0;
  let alfW = 0.0;
  for (let iter = 1; iter <= NITER; iter += 1) {
    const result = GETCLCDCM(state, IS, alf, W, rey);
    const dalf = -(result.CLIFT - CLIFT) / result.CL_ALF;
    alf = alf + dalf;
    alfCl = 1.0 / result.CL_ALF;
    alfW = -result.CL_W / result.CL_ALF;
    stallf = result.STALLF;
    if (Math.abs(dalf) < EPS) {
      return { ALF: alf, ALF_CL: alfCl, ALF_W: alfW, STALLF: stallf, converged: true };
    }
  }

  return { ALF: alf, ALF_CL: alfCl, ALF_W: alfW, STALLF: stallf, converged: false };
}

function CHKLIM(N, F, FMAX) {
  const f = ensureVector(F, N, 'F');
  let nstrt = 1;
  let nend = N;

  let i;
  for (i = 1; i <= N; i += 1) {
    if (f[i - 1] < FMAX) {
      break;
    }
  }
  nstrt = Math.max(i - 1, 1);

  for (i = N; i >= 1; i -= 1) {
    if (f[i - 1] < FMAX) {
      break;
    }
  }
  nend = Math.min(i + 1, N);

  return { NSTRT: nstrt, NEND: nend };
}

function AEROPLT(
  state,
  NSEC,
  XISECT,
  NMACH,
  AMACH,
  A0,
  CLMAX,
  CLMIN,
  DCLDA,
  DCLDA_STALL,
  DCL_STALL,
  CDMIN,
  CLDMIN,
  DCDCL2,
  CMCON,
  MCRIT,
  REREF,
  REXP,
) {
  assert(state && typeof state === 'object', 'AEROPLT: expected a state object');
  const am = ensureVector(AMACH, NMACH, 'AMACH');
  const NTMP = 301;

  let dcd = 0.002;
  let dcl = 0.2;
  let dal = 2.0;

  const dalflin =
    ((CLMAX / DCLDA - CLMIN / DCLDA + (8.0 * DCL_STALL) / DCLDA) * 180.0) / PI;
  if (CLMAX - CLMIN > 2.01) {
    dcl = 0.5;
  }
  if (dalflin > 10.01) {
    dal = 5.0;
  }
  if (dalflin > 20.01) {
    dal = 10.0;
  }

  if (5.0 * CDMIN > 0.016) {
    dcd = 0.005;
  }
  if (5.0 * CDMIN > 0.04) {
    dcd = 0.01;
  }
  if (5.0 * CDMIN > 0.08) {
    dcd = 0.02;
  }
  if (5.0 * CDMIN > 0.16) {
    dcd = 0.05;
  }
  if (5.0 * CDMIN > 0.4) {
    dcd = 0.1;
  }

  const clmin0 = dcl * Math.trunc(Math.min(CLMIN, 0.0) / dcl - 0.5);
  const clmax0 = dcl * Math.trunc(Math.max(CLMAX, 0.0) / dcl + 0.5);
  const cdmin0 = 0.0;
  let cdmax0 = dcd * Math.trunc((5.0 * CDMIN) / dcd + 0.5);
  cdmax0 = Math.max(cdmax0, 0.001);

  const alfmi = (CLMIN - 8.0 * DCL_STALL) / DCLDA;
  const alfma = (CLMAX + 8.0 * DCL_STALL) / DCLDA;
  const almin0 = dal * Math.trunc((((alfmi - 0.02) * 180.0) / PI) / dal - 0.5);
  const almax0 = dal * Math.trunc((((alfma + 0.02) * 180.0) / PI) / dal + 0.5);

  const machSeries = [];
  const dalf = (almax0 - almin0) / (NTMP - 1);

  for (let imach = 1; imach <= NMACH; imach += 1) {
    const mach = Math.min(0.95, am[imach - 1]);
    const msq = mach ** 2;
    const w = (state.VSO * Math.sqrt(msq)) / state.VEL;
    const cdclX = new Float64Array(NTMP);
    const cdclY = new Float64Array(NTMP);
    const alfclX = new Float64Array(NTMP);
    const alfclY = new Float64Array(NTMP);

    for (let n = 1; n <= NTMP; n += 1) {
      const alfa = ((almin0 + dalf * (n - 1)) * PI) / 180.0;
      const result = CLCDCM(
        alfa,
        w,
        REREF,
        A0,
        CLMAX,
        CLMIN,
        DCLDA,
        DCLDA_STALL,
        DCL_STALL,
        CDMIN,
        CLDMIN,
        DCDCL2,
        CMCON,
        MCRIT,
        REREF,
        REXP,
        state,
      );
      cdclX[n - 1] = result.CDRAG;
      cdclY[n - 1] = result.CLIFT;
      alfclX[n - 1] = alfa;
      alfclY[n - 1] = result.CLIFT;
    }

    const cdclLim = CHKLIM(NTMP, cdclX, 1.1 * cdmax0);
    const alfclLim = CHKLIM(NTMP, alfclX, ((1.1 * almax0) * PI) / 180.0);

    machSeries.push({
      mach,
      cdCl: {
        x: cdclX,
        y: cdclY,
        nStart: cdclLim.NSTRT,
        nEnd: cdclLim.NEND,
      },
      alphaCl: {
        x: alfclX,
        y: alfclY,
        nStart: alfclLim.NSTRT,
        nEnd: alfclLim.NEND,
      },
    });
  }

  return {
    title: {
      name: state.NAME,
      section: NSEC,
      XISECT,
      REREF,
      WIND: state.WIND,
    },
    limits: {
      CLMIN0: clmin0,
      CLMAX0: clmax0,
      CDMIN0: cdmin0,
      CDMAX0: cdmax0,
      ALMIN0: almin0,
      ALMAX0: almax0,
      DCL: dcl,
      DCD: dcd,
      DAL: dal,
    },
    machSeries,
  };
}

function applyAeroEditUpdates(section, updates = {}) {
  if (Object.prototype.hasOwnProperty.call(updates, 'A0DEG')) {
    section.A0 = (updates.A0DEG * PI) / 180.0;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'A0')) {
    section.A0 = updates.A0;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'DCLDA')) {
    section.DCLDA = updates.DCLDA;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'DCLDA_STALL')) {
    section.DCLDA_STALL = updates.DCLDA_STALL;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'CLMAX')) {
    section.CLMAX = updates.CLMAX;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'CLMIN')) {
    section.CLMIN = updates.CLMIN;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'DCL_STALL')) {
    section.DCL_STALL = updates.DCL_STALL;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'CDMIN')) {
    section.CDMIN = updates.CDMIN;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'CLDMIN')) {
    section.CLDMIN = updates.CLDMIN;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'DCDCL2')) {
    section.DCDCL2 = updates.DCDCL2;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'REREF')) {
    section.REREF = updates.REREF;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'REXP')) {
    section.REXP = updates.REXP;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'CMCON')) {
    section.CMCON = updates.CMCON;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'MCRIT')) {
    section.MCRIT = updates.MCRIT;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'XISECT')) {
    section.XISECT = updates.XISECT;
  }
}

function AEROEDIT(state, NSEC, action = {}) {
  assert(state && typeof state === 'object', 'AEROEDIT: expected a state object');
  if (NSEC < 1 || NSEC > state.NAERO) {
    throw new Error(`AEROEDIT: section index out of bounds: ${NSEC}`);
  }

  const hasImplicitUpdate =
    action.command === undefined &&
    (action.values !== undefined || Object.keys(action).some((key) => key !== 'command'));
  const command = (action.command ?? (hasImplicitUpdate ? 'UPDATE' : 'DISP')).toUpperCase();
  const section = GETAERO(state, NSEC);

  if (command === 'DISP') {
    return section;
  }

  if (command === 'MOVE') {
    applyAeroEditUpdates(section, { XISECT: action.XISECT });
  } else if (command === 'REFL') {
    const tmp = section.CLMIN;
    section.A0 = -section.A0;
    section.CLDMIN = -section.CLDMIN;
    section.CLMIN = -section.CLMAX;
    section.CLMAX = -tmp;
    section.CMCON = -section.CMCON;
    state.WIND = !state.WIND;
    state.CONV = false;
  } else if (command === 'PLOT') {
    return AEROPLT(
      state,
      NSEC,
      section.XISECT,
      action.AMACH.length,
      action.AMACH,
      section.A0,
      section.CLMAX,
      section.CLMIN,
      section.DCLDA,
      section.DCLDA_STALL,
      section.DCL_STALL,
      section.CDMIN,
      section.CLDMIN,
      section.DCDCL2,
      section.CMCON,
      section.MCRIT,
      section.REREF,
      section.REXP,
    );
  } else {
    applyAeroEditUpdates(section, action.values ?? action);
    state.CONV = false;
  }

  PUTAERO(
    state,
    NSEC,
    section.XISECT,
    section.A0,
    section.CLMAX,
    section.CLMIN,
    section.DCLDA,
    section.DCLDA_STALL,
    section.DCL_STALL,
    section.CDMIN,
    section.CLDMIN,
    section.DCDCL2,
    section.CMCON,
    section.MCRIT,
    section.REREF,
    section.REXP,
    section.TOC,
  );
  SORTAR(state.NAERO, state.XIAERO, state.AERODATA, NDX);
  if (!state.CONV) {
    SETIAERO(state);
  }

  return GETAERO(state, NSEC);
}

function serializeAero(state) {
  const lines = [];
  for (let n = 1; n <= state.NAERO; n += 1) {
    const section = GETAERO(state, n);
    const a0deg = (section.A0 * 180.0) / PI;
    lines.push(` Sect# = ${String(n).padStart(3, ' ')} r/R = ${section.XISECT.toFixed(4).padStart(10, ' ')}`);
    lines.push(` ========================================================================`);
    lines.push(` Zero-lift alpha (deg):${a0deg.toFixed(2).padStart(7, ' ')}        Minimum Cd           :${section.CDMIN.toFixed(4).padStart(7, ' ')}`);
    lines.push(` d(Cl)/d(alpha)       :${section.DCLDA.toFixed(3).padStart(7, ' ')}        Cl at minimum Cd     :${section.CLDMIN.toFixed(3).padStart(6, ' ')}`);
    lines.push(` d(Cl)/d(alpha)@stall :${section.DCLDA_STALL.toFixed(3).padStart(7, ' ')}        d(Cd)/d(Cl**2)       :${section.DCDCL2.toFixed(4).padStart(7, ' ')}`);
    lines.push(` Maximum Cl           :${section.CLMAX.toFixed(2).padStart(6, ' ')}         Reference Re number  :${section.REREF.toFixed(0).padStart(9, ' ')}`);
    lines.push(` Minimum Cl           :${section.CLMIN.toFixed(2).padStart(6, ' ')}         Re scaling exponent  :${section.REXP.toFixed(4).padStart(8, ' ')}`);
    lines.push(` Cl increment to stall:${section.DCL_STALL.toFixed(3).padStart(7, ' ')}        Cm                   :${section.CMCON.toFixed(3).padStart(7, ' ')}`);
    lines.push(`                        Mcrit                :${section.MCRIT.toFixed(3).padStart(7, ' ')}`);
  }
  return `${lines.join('\n')}\n`;
}

function deserializeAero(state, text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  let n = 0;
  for (let i = 0; i + 8 < lines.length && n < NAX; i += 9) {
    n += 1;
    const line0 = lines[i];
    const line2 = lines[i + 2];
    const line3 = lines[i + 3];
    const line4 = lines[i + 4];
    const line5 = lines[i + 5];
    const line6 = lines[i + 6];
    const line7 = lines[i + 7];
    const line8 = lines[i + 8];

    const xisect = Number(line0.slice(19, 30).trim());
    const a0deg = Number(line2.slice(23, 39).trim());
    const cdmin = Number(line2.slice(61, 77).trim());
    const dclda = Number(line3.slice(23, 39).trim());
    const cldmin = Number(line3.slice(61, 77).trim());
    const dcldaStall = Number(line4.slice(23, 39).trim());
    const dcdcl2 = Number(line4.slice(61, 77).trim());
    const clmax = Number(line5.slice(23, 39).trim());
    const reref = Number(line5.slice(61, 77).trim());
    const clmin = Number(line6.slice(23, 39).trim());
    const rexp = Number(line6.slice(61, 77).trim());
    const dclStall = Number(line7.slice(23, 39).trim());
    const cmcon = Number(line7.slice(61, 77).trim());
    const mcrit = Number(line8.slice(61, 77).trim());

    // Preserve the original Fortran read-path conversion bug.
    const a0 = (a0deg * 180.0) / PI;

    PUTAERO(
      state,
      n,
      xisect,
      a0,
      clmax,
      clmin,
      dclda,
      dcldaStall,
      dclStall,
      cdmin,
      cldmin,
      dcdcl2,
      cmcon,
      mcrit,
      reref,
      rexp,
    );
  }
  state.NAERO = n;
  SORTAR(state.NAERO, state.XIAERO, state.AERODATA, NDX);
  state.CONV = false;
  return state;
}

function AERO(state, action = {}) {
  assert(state && typeof state === 'object', 'AERO: expected a state object');
  const command = (action.command ?? 'DISP').toUpperCase();

  if (command === 'DISP') {
    return Array.from({ length: state.NAERO }, (_, index) => ({
      index: index + 1,
      ...GETAERO(state, index + 1),
    }));
  }

  if (command === 'NEW') {
    const copyIndex = action.copyIndex ?? 1;
    const section = GETAERO(state, copyIndex);
    PUTAERO(
      state,
      state.NAERO + 1,
      action.XISECT,
      section.A0,
      section.CLMAX,
      section.CLMIN,
      section.DCLDA,
      section.DCLDA_STALL,
      section.DCL_STALL,
      section.CDMIN,
      section.CLDMIN,
      section.DCDCL2,
      section.CMCON,
      section.MCRIT,
      section.REREF,
      section.REXP,
      section.TOC,
    );
    state.NAERO += 1;
    SORTAR(state.NAERO, state.XIAERO, state.AERODATA, NDX);
    state.CONV = false;
    SETIAERO(state);
    return AERO(state, { command: 'DISP' });
  }

  if (command === 'DEL') {
    if (state.NAERO <= 1) {
      throw new Error('AERO: Cannot delete all aero sections');
    }
    const ndel = action.index;
    for (let n = ndel + 1; n <= state.NAERO; n += 1) {
      const section = GETAERO(state, n);
      PUTAERO(
        state,
        n - 1,
        section.XISECT,
        section.A0,
        section.CLMAX,
        section.CLMIN,
        section.DCLDA,
        section.DCLDA_STALL,
        section.DCL_STALL,
        section.CDMIN,
        section.CLDMIN,
        section.DCDCL2,
        section.CMCON,
        section.MCRIT,
        section.REREF,
        section.REXP,
        section.TOC,
      );
    }
    state.NAERO -= 1;
    state.CONV = false;
    SETIAERO(state);
    return AERO(state, { command: 'DISP' });
  }

  if (command === 'EDIT') {
    return AEROEDIT(state, action.index, action.edit ?? {});
  }

  if (command === 'PLOT') {
    const section = GETAERO(state, action.index ?? 1);
    return AEROPLT(
      state,
      action.index ?? 1,
      section.XISECT,
      action.AMACH.length,
      action.AMACH,
      section.A0,
      section.CLMAX,
      section.CLMIN,
      section.DCLDA,
      section.DCLDA_STALL,
      section.DCL_STALL,
      section.CDMIN,
      section.CLDMIN,
      section.DCDCL2,
      section.CMCON,
      section.MCRIT,
      section.REREF,
      section.REXP,
    );
  }

  if (command === 'READ') {
    return deserializeAero(state, action.text);
  }

  if (command === 'WRIT') {
    return serializeAero(state);
  }

  if (command === 'ANNO' || command === 'HARD') {
    return { command };
  }

  throw new Error(`AERO: unsupported command ${command}`);
}

module.exports = {
  IX,
  NAX,
  NDX,
  PI,
  createState,
  AERO,
  AEROEDIT,
  SETIAERO,
  GETAERO,
  PUTAERO,
  SORTAR,
  GETCLCDCM,
  GETALF,
  CLCDCM,
  AEROPLT,
  CHKLIM,
  serializeAero,
  deserializeAero,
};
