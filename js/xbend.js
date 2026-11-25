'use strict';

const fs = require('node:fs');

const xoper = require('./xoper.js');
const { SEGSPL, SEVAL } = require('./spline.js');

const IX = 100;
const IXP = IX + 1;
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

function copyFloat64(length, source = []) {
  const out = new Float64Array(length);
  const limit = Math.min(length, source.length ?? 0);
  for (let i = 0; i < limit; i += 1) {
    out[i] = source[i];
  }
  return out;
}

function allocateBlocks(ii) {
  return Array.from({ length: ii }, () =>
    Array.from({ length: 12 }, () => new Float64Array(12)),
  );
}

function allocateRhs(ii) {
  return Array.from({ length: ii }, () => new Float64Array(12));
}

function createState(overrides = {}) {
  return {
    ...xoper.createState(overrides),
    ...createStructuralState(overrides),
    RHO: overrides.RHO ?? 1.0,
    LLAND: Boolean(overrides.LLAND),
  };
}

function createStructuralState(overrides = {}) {
  return {
    EIXXB: copyFloat64(IX, overrides.EIXXB),
    EIYYB: copyFloat64(IX, overrides.EIYYB),
    EAB: copyFloat64(IX, overrides.EAB),
    GJB: copyFloat64(IX, overrides.GJB),
    EKB: copyFloat64(IX, overrides.EKB),
    MB: copyFloat64(IX, overrides.MB),
    MXXB: copyFloat64(IX, overrides.MXXB),
    XOCG: copyFloat64(IX, overrides.XOCG),
    XOSC: copyFloat64(IX, overrides.XOSC),
    RSTB: copyFloat64(IX, overrides.RSTB),
    PX: copyFloat64(IX, overrides.PX),
    PY: copyFloat64(IX, overrides.PY),
    PZ: copyFloat64(IX, overrides.PZ),
    MX: copyFloat64(IX, overrides.MX),
    MY: copyFloat64(IX, overrides.MY),
    MZ: copyFloat64(IX, overrides.MZ),
    PX_TY: copyFloat64(IX, overrides.PX_TY),
    PX_TZ: copyFloat64(IX, overrides.PX_TZ),
    PZ_TX: copyFloat64(IX, overrides.PZ_TX),
    PZ_TY: copyFloat64(IX, overrides.PZ_TY),
    PZ_WZ: copyFloat64(IX, overrides.PZ_WZ),
    MY_TY: copyFloat64(IX, overrides.MY_TY),
    MZ_TY: copyFloat64(IX, overrides.MZ_TY),
    MZ_TX: copyFloat64(IX, overrides.MZ_TX),
    MZ_WZ: copyFloat64(IX, overrides.MZ_WZ),
    TX: copyFloat64(IXP, overrides.TX),
    TY: copyFloat64(IXP, overrides.TY),
    TZ: copyFloat64(IXP, overrides.TZ),
    WX: copyFloat64(IXP, overrides.WX),
    WY: copyFloat64(IXP, overrides.WY),
    WZ: copyFloat64(IXP, overrides.WZ),
    SHRX: copyFloat64(IXP, overrides.SHRX),
    SHRY: copyFloat64(IXP, overrides.SHRY),
    SHRZ: copyFloat64(IXP, overrides.SHRZ),
    MOMX: copyFloat64(IXP, overrides.MOMX),
    MOMY: copyFloat64(IXP, overrides.MOMY),
    MOMZ: copyFloat64(IXP, overrides.MOMZ),
    CSCALC: overrides.CSCALC ?? null,
  };
}

function defaultCSCALC(I, state) {
  return xoper.CSCALC(state, I);
}

function resolveCSCALC(state) {
  return state.CSCALC ?? defaultCSCALC;
}

function parseEIText(text, state) {
  const lines = text.split(/\r?\n/);
  const xt = new Float64Array(IX);
  const values = Array.from({ length: 10 }, () => new Float64Array(IX));
  let nt = 0;

  for (let i = 3; i < lines.length && nt < IX; i += 1) {
    const line = lines[i].trim();
    if (line.length === 0) {
      continue;
    }
    const fields = line.split(/\s+/).map(Number);
    if (fields.length < 11 || fields.some((value) => Number.isNaN(value))) {
      throw new Error('EILOAD: incompatible format');
    }
    xt[nt] = fields[0] / state.RAD;
    for (let j = 0; j < 10; j += 1) {
      values[j][nt] = fields[j + 1];
    }
    nt += 1;
  }

  return { XT: xt.slice(0, nt), VALUES: values.map((row) => row.slice(0, nt)), NT: nt };
}

function EILOAD(state, FNAME1, options = {}) {
  let text = options.text;
  if (text === undefined) {
    const fileName = FNAME1;
    text = fs.readFileSync(fileName, 'utf8');
  }

  const parsed = parseEIText(text, state);
  const nt = parsed.NT;
  const xt = parsed.XT;
  const derivs = parsed.VALUES.map((row) => SEGSPL(row.slice(), new Float64Array(nt), xt, nt));

  for (let i = 0; i < state.II; i += 1) {
    state.EIXXB[i] = SEVAL(state.XI[i], parsed.VALUES[0], derivs[0], xt, nt);
    state.EIYYB[i] = SEVAL(state.XI[i], parsed.VALUES[1], derivs[1], xt, nt);
    state.EAB[i] = SEVAL(state.XI[i], parsed.VALUES[2], derivs[2], xt, nt);
    state.GJB[i] = SEVAL(state.XI[i], parsed.VALUES[3], derivs[3], xt, nt);
    state.EKB[i] = SEVAL(state.XI[i], parsed.VALUES[4], derivs[4], xt, nt);
    state.MB[i] = SEVAL(state.XI[i], parsed.VALUES[5], derivs[5], xt, nt);
    state.MXXB[i] = SEVAL(state.XI[i], parsed.VALUES[6], derivs[6], xt, nt);
    state.XOCG[i] = SEVAL(state.XI[i], parsed.VALUES[7], derivs[7], xt, nt);
    state.XOSC[i] = SEVAL(state.XI[i], parsed.VALUES[8], derivs[8], xt, nt);
    state.RSTB[i] = SEVAL(state.XI[i], parsed.VALUES[9], derivs[9], xt, nt);
  }

  let mass = 0.0;
  let mrsq = 0.0;
  let maxx = 0.0;
  for (let i = 0; i < state.II; i += 1) {
    mass += state.MB[i] * state.RAD * state.DXI[i];
    mrsq += state.MB[i] * state.RAD * state.DXI[i] * (state.XI[i] * state.RAD) ** 2;
    maxx += state.MXXB[i] * state.RAD * state.DXI[i];
  }

  state.LSTRUC = true;
  return { NT: nt, MASS: mass, MAXX: maxx, MRSQ: mrsq };
}

function STCLR(state) {
  for (let i = 0; i < state.II; i += 1) {
    state.TX[i] = 0.0;
    state.TY[i] = 0.0;
    state.TZ[i] = 0.0;
    state.WX[i] = 0.0;
    state.WY[i] = 0.0;
    state.WZ[i] = 0.0;
    state.MOMX[i] = 0.0;
    state.MOMY[i] = 0.0;
    state.MOMZ[i] = 0.0;
    state.SHRX[i] = 0.0;
    state.SHRY[i] = 0.0;
    state.SHRZ[i] = 0.0;
  }
  return state;
}

function MCLR(state) {
  for (let i = 0; i < state.II; i += 1) {
    state.MB[i] = 0.0;
    state.MXXB[i] = 0.0;
    state.EKB[i] = 0.0;
  }
  return state;
}

function STLOAD(state) {
  const cscalc = resolveCSCALC(state);
  let fx = 0.0;
  let fy = 0.0;
  let fz = 0.0;
  const sinr = Math.sin(state.RAKE);
  const cosr = Math.cos(state.RAKE);

  for (let i = 0; i < state.II; i += 1) {
    const dxii = state.DXI[i] / cosr;
    const c = cscalc(i + 1, state);

    const wsq = c.W * c.W;
    const sinb = Math.sin(state.BETA[i]);
    const cosb = Math.cos(state.BETA[i]);

    const txa = 0.5 * (state.TX[i] + state.TX[i + 1]);
    const tza = 0.5 * (state.TZ[i] + state.TZ[i + 1]);
    const wza = 0.5 * (state.WZ[i] + state.WZ[i + 1]);

    const flift = 0.5 * wsq * state.CH[i] * state.CL[i];
    const fdrag = 0.5 * wsq * state.CH[i] * state.CD[i];
    const fliftA = 0.0;

    const fxa = (-c.CI / c.W) * flift + (c.SI / c.W) * fdrag;
    const fya = 0.0;
    const fza = (c.SI / c.W) * flift + (c.CI / c.W) * fdrag;

    fx += cosr * dxii * fxa;
    fy += sinr * dxii * fxa;
    fz += dxii * fza;

    let fcent = 0.0;
    if (state.LSTRUC) {
      fcent = (state.MB[i] * state.XI[i]) / state.ADV ** 2 / (state.RHO * state.RAD ** 2);
    }
    const fxc = -sinr * fcent;
    const fyc = cosr * fcent;
    const fzc = 0.0;

    state.PX[i] = fxa + fxc + fyc * tza * cosr;
    state.PY[i] = fya + fyc;
    state.PZ[i] = fza + fzc + fyc * (wza / state.XI[i] - txa);
    state.PX_TY[i] = (-fliftA * c.CI) / c.W;
    state.PX_TZ[i] = fyc * cosr;
    state.PZ_TX[i] = -fyc;
    state.PZ_TY[i] = (fliftA * c.SI) / c.W;
    state.PZ_WZ[i] = fyc / state.XI[i];

    let mcent;
    let mprec;
    let maero;
    if (state.LSTRUC) {
      mcent =
        (sinb * (state.XOCG[i] - state.XOSC[i]) * state.CH[i] * state.MB[i] * state.XI[i]) /
        state.ADV ** 2 /
        (state.RHO * state.RAD ** 2);
      mprec =
        (-sinb * cosb * state.MXXB[i]) / state.ADV ** 2 / (state.RHO * state.RAD ** 4);
      maero = 0.5 * wsq * (state.CL[i] * (state.XOSC[i] - 0.25) + state.CM[i]) * state.CH[i] ** 2;
    } else {
      mcent = 0.0;
      mprec = 0.0;
      maero = 0.5 * wsq * (state.CL[i] * (0.4 - 0.25) + state.CM[i]) * state.CH[i] ** 2;
    }

    const mcentB = 0.0;
    const mprecB = 0.0;
    const maeroA = 0.0;

    state.MX[i] = 0.0;
    state.MY[i] = maero + mprec;
    state.MZ[i] = mcent + mprec * (wza / state.XI[i] - txa);

    state.MY_TY[i] = maeroA + mprecB * (wza / state.XI[i] - txa);
    state.MZ_TY[i] = mcentB;
    state.MZ_TX[i] = -mprec;
    state.MZ_WZ[i] = mprec / state.XI[i];
  }

  return {
    FX: fx * state.RHO * state.VEL ** 2 * state.RAD ** 2,
    FY: fy * state.RHO * state.VEL ** 2 * state.RAD ** 2,
    FZ: fz * state.RHO * state.VEL ** 2 * state.RAD ** 2,
  };
}

function B12SOL(A, B, C, R, II) {
  const nrhs = 1;

  for (let i = 0; i < II; i += 1) {
    const im = i - 1;
    if (i !== 0) {
      for (let k = 0; k < 12; k += 1) {
        for (let l = 0; l < 12; l += 1) {
          A[i][k][l] =
            A[i][k][l] -
            (B[i][k][0] * C[im][0][l] +
              B[i][k][1] * C[im][1][l] +
              B[i][k][2] * C[im][2][l] +
              B[i][k][3] * C[im][3][l] +
              B[i][k][4] * C[im][4][l] +
              B[i][k][5] * C[im][5][l] +
              B[i][k][6] * C[im][6][l] +
              B[i][k][7] * C[im][7][l] +
              B[i][k][8] * C[im][8][l] +
              B[i][k][9] * C[im][9][l] +
              B[i][k][10] * C[im][10][l] +
              B[i][k][11] * C[im][11][l]);
        }
        for (let l = 0; l < nrhs; l += 1) {
          R[i][k] =
            R[i][k] -
            (B[i][k][0] * R[im][0] +
              B[i][k][1] * R[im][1] +
              B[i][k][2] * R[im][2] +
              B[i][k][3] * R[im][3] +
              B[i][k][4] * R[im][4] +
              B[i][k][5] * R[im][5] +
              B[i][k][6] * R[im][6] +
              B[i][k][7] * R[im][7] +
              B[i][k][8] * R[im][8] +
              B[i][k][9] * R[im][9] +
              B[i][k][10] * R[im][10] +
              B[i][k][11] * R[im][11]);
        }
      }
    }

    for (let kpiv = 0; kpiv <= 10; kpiv += 1) {
      let kx = kpiv;
      for (let k = kpiv + 1; k < 12; k += 1) {
        if (Math.abs(A[i][k][kpiv]) > Math.abs(A[i][kx][kpiv])) {
          kx = k;
        }
      }

      if (A[i][kx][kpiv] === 0.0) {
        throw new Error(`B12SOL: Singular A block, i = ${i + 1}`);
      }

      const pivot = 1.0 / A[i][kx][kpiv];
      A[i][kx][kpiv] = A[i][kpiv][kpiv];

      for (let l = kpiv + 1; l < 12; l += 1) {
        const temp = A[i][kx][l] * pivot;
        A[i][kx][l] = A[i][kpiv][l];
        A[i][kpiv][l] = temp;
      }

      for (let l = 0; l < 12; l += 1) {
        const temp = C[i][kx][l] * pivot;
        C[i][kx][l] = C[i][kpiv][l];
        C[i][kpiv][l] = temp;
      }

      for (let l = 0; l < nrhs; l += 1) {
        const temp = R[i][kx] * pivot;
        R[i][kx] = R[i][kpiv];
        R[i][kpiv] = temp;
      }

      for (let k = kpiv + 1; k < 12; k += 1) {
        const atmp = -A[i][k][kpiv];
        if (atmp === 0.0) {
          continue;
        }
        for (let l = kpiv + 1; l < 12; l += 1) {
          A[i][k][l] = A[i][k][l] + atmp * A[i][kpiv][l];
        }
        for (let l = 0; l < 12; l += 1) {
          C[i][k][l] = C[i][k][l] + atmp * C[i][kpiv][l];
        }
        for (let l = 0; l < nrhs; l += 1) {
          R[i][k] = R[i][k] + atmp * R[i][kpiv];
        }
      }
    }

    if (A[i][11][11] === 0.0) {
      throw new Error(`B12SOL: Singular A block, i = ${i + 1}`);
    }
    const pivot = 1.0 / A[i][11][11];
    for (let l = 0; l < 12; l += 1) {
      C[i][11][l] = C[i][11][l] * pivot;
    }
    for (let l = 0; l < nrhs; l += 1) {
      R[i][11] = R[i][11] * pivot;
    }

    for (let kpiv = 10; kpiv >= 0; kpiv -= 1) {
      for (let k = kpiv + 1; k < 12; k += 1) {
        for (let l = 0; l < 12; l += 1) {
          C[i][kpiv][l] = C[i][kpiv][l] - A[i][kpiv][k] * C[i][k][l];
        }
        for (let l = 0; l < nrhs; l += 1) {
          R[i][kpiv] = R[i][kpiv] - A[i][kpiv][k] * R[i][k];
        }
      }
    }
  }

  for (let i = II - 2; i >= 0; i -= 1) {
    const ip = i + 1;
    for (let l = 0; l < nrhs; l += 1) {
      for (let k = 0; k < 12; k += 1) {
        R[i][k] =
          R[i][k] -
          (R[ip][0] * C[i][k][0] +
            R[ip][1] * C[i][k][1] +
            R[ip][2] * C[i][k][2] +
            R[ip][3] * C[i][k][3] +
            R[ip][4] * C[i][k][4] +
            R[ip][5] * C[i][k][5] +
            R[ip][6] * C[i][k][6] +
            R[ip][7] * C[i][k][7] +
            R[ip][8] * C[i][k][8] +
            R[ip][9] * C[i][k][9] +
            R[ip][10] * C[i][k][10] +
            R[ip][11] * C[i][k][11]);
      }
    }
  }

  return R;
}

function STCALC(state) {
  const EPS = 1.0e-5;
  const rrLim = new Float64Array([
    0.1, 0.1, 0.1,
    0.2 / state.ADV ** 2, 0.5 / state.ADV ** 2, 0.2 / state.ADV ** 2,
    0.2 / state.ADV ** 2, 20.0 / state.ADV ** 2, 0.2 / state.ADV ** 2,
    0.1, 0.01, 0.1,
  ]);

  let converged = false;
  let iterCount = 10;
  let rmax = 0.0;

  for (let iter = 1; iter <= 10; iter += 1) {
    STLOAD(state);

    const aa = allocateBlocks(state.II + 1);
    const bb = allocateBlocks(state.II + 1);
    const cc = allocateBlocks(state.II + 1);
    const rr = allocateRhs(state.II + 1);

    aa[0][0][0] = 1.0;
    aa[0][1][1] = 1.0;
    aa[0][2][2] = 1.0;
    aa[0][9][9] = 1.0;
    aa[0][10][10] = 1.0;
    aa[0][11][11] = 1.0;

    const eaRef = state.RHO * state.VEL ** 2 * state.RAD ** 2;
    const ekRef = state.RHO * state.VEL ** 2 * state.RAD ** 3;
    const eiRef = state.RHO * state.VEL ** 2 * state.RAD ** 4;
    const cosr = Math.cos(state.RAKE);

    for (let i = 0; i < state.II; i += 1) {
      const dxii = state.DXI[i] / cosr;

      const sx2 = state.SHRX[i + 1];
      const sy2 = state.SHRY[i + 1];
      const sz2 = state.SHRZ[i + 1];
      const sx1 = state.SHRX[i];
      const sy1 = state.SHRY[i];
      const sz1 = state.SHRZ[i];
      const mx2 = state.MOMX[i + 1];
      const my2 = state.MOMY[i + 1];
      const mz2 = state.MOMZ[i + 1];
      const mx1 = state.MOMX[i];
      const my1 = state.MOMY[i];
      const mz1 = state.MOMZ[i];
      const tx2 = state.TX[i + 1];
      const ty2 = state.TY[i + 1];
      const tz2 = state.TZ[i + 1];
      const tx1 = state.TX[i];
      const ty1 = state.TY[i];
      const tz1 = state.TZ[i];
      const wx2 = state.WX[i + 1];
      const wy2 = state.WY[i + 1];
      const wz2 = state.WZ[i + 1];
      const wx1 = state.WX[i];
      const wy1 = state.WY[i];
      const wz1 = state.WZ[i];

      rr[i][3] =
        mx2 - mx1 - (my2 + my1) * 0.5 * (tz2 - tz1) + (mz2 + mz1) * 0.5 * (ty2 - ty1) -
        ((sz2 + sz1) * 0.5 - state.MX[i]) * dxii;
      aa[i][3][1] = -(mz2 + mz1) * 0.5;
      aa[i][3][2] = (my2 + my1) * 0.5;
      aa[i][3][3] = -1.0;
      aa[i][3][4] = -0.5 * (tz2 - tz1);
      aa[i][3][5] = 0.5 * (ty2 - ty1);
      aa[i][3][8] = -0.5 * dxii;
      cc[i][3][1] = (mz2 + mz1) * 0.5;
      cc[i][3][2] = -(my2 + my1) * 0.5;
      cc[i][3][3] = 1.0;
      cc[i][3][4] = -0.5 * (tz2 - tz1);
      cc[i][3][5] = 0.5 * (ty2 - ty1);
      cc[i][3][8] = -0.5 * dxii;

      rr[i][4] =
        my2 - my1 + (mx2 + mx1) * 0.5 * (tz2 - tz1) - (mz2 + mz1) * 0.5 * (tx2 - tx1) +
        state.MY[i] * dxii;
      aa[i][4][0] = (mz2 + mz1) * 0.5;
      aa[i][4][1] = state.MY_TY[i] * dxii * 0.5;
      aa[i][4][2] = -(mx2 + mx1) * 0.5;
      aa[i][4][3] = 0.5 * (tz2 - tz1);
      aa[i][4][4] = -1.0;
      aa[i][4][5] = -0.5 * (tx2 - tx1);
      cc[i][4][0] = -(mz2 + mz1) * 0.5;
      cc[i][4][1] = state.MY_TY[i] * dxii * 0.5;
      cc[i][4][2] = (mx2 + mx1) * 0.5;
      cc[i][4][3] = 0.5 * (tz2 - tz1);
      cc[i][4][4] = 1.0;
      cc[i][4][5] = -0.5 * (tx2 - tx1);

      rr[i][5] =
        mz2 - mz1 + (my2 + my1) * 0.5 * (tx2 - tx1) - (mx2 + mx1) * 0.5 * (ty2 - ty1) +
        ((sx2 + sx1) * 0.5 + state.MZ[i]) * dxii;
      aa[i][5][0] = -(my2 + my1) * 0.5;
      aa[i][5][1] = (mx2 + mx1) * 0.5 + state.MZ_TY[i] * dxii * 0.5;
      aa[i][5][2] = state.MZ_TX[i] * dxii * 0.5;
      aa[i][5][3] = -0.5 * (ty2 - ty1);
      aa[i][5][4] = 0.5 * (tx2 - tx1);
      aa[i][5][5] = -1.0;
      aa[i][5][6] = 0.5 * dxii;
      aa[i][5][11] = state.MZ_WZ[i] * dxii * 0.5;
      cc[i][5][0] = (my2 + my1) * 0.5;
      cc[i][5][1] = -(mx2 + mx1) * 0.5 + state.MZ_TY[i] * dxii * 0.5;
      cc[i][5][2] = state.MZ_TX[i] * dxii * 0.5;
      cc[i][5][3] = -0.5 * (ty2 - ty1);
      cc[i][5][4] = 0.5 * (tx2 - tx1);
      cc[i][5][5] = 1.0;
      cc[i][5][6] = 0.5 * dxii;
      cc[i][5][11] = state.MZ_WZ[i] * dxii * 0.5;

      rr[i][6] =
        sx2 - sx1 + (sy2 + sy1) * 0.5 * (tz2 - tz1) + (sz2 + sz1) * 0.5 * (ty2 - ty1) -
        state.PX[i] * dxii;
      aa[i][6][1] = -(sz2 + sz1) * 0.5 - state.PX_TY[i] * dxii * 0.5;
      aa[i][6][2] = -(sy2 + sy1) * 0.5 - state.PX_TZ[i] * dxii * 0.5;
      aa[i][6][6] = -1.0;
      aa[i][6][7] = 0.5 * (tz2 - tz1);
      aa[i][6][8] = 0.5 * (ty2 - ty1);
      cc[i][6][1] = (sz2 + sz1) * 0.5 - state.PX_TY[i] * dxii * 0.5;
      cc[i][6][2] = (sy2 + sy1) * 0.5 - state.PX_TZ[i] * dxii * 0.5;
      cc[i][6][6] = 1.0;
      cc[i][6][7] = 0.5 * (tz2 - tz1);
      cc[i][6][8] = 0.5 * (ty2 - ty1);

      rr[i][7] =
        sy2 - sy1 - (sx2 + sx1) * 0.5 * (tz2 - tz1) + (sz2 + sz1) * 0.5 * (tx2 - tx1) +
        state.PY[i] * dxii;
      aa[i][7][0] = (sz2 + sz1) * 0.5;
      aa[i][7][2] = -(sx2 + sx1) * 0.5;
      aa[i][7][6] = -0.5 * (tz2 - tz1);
      aa[i][7][7] = -1.0;
      aa[i][7][8] = 0.5 * (tx2 - tx1);
      cc[i][7][0] = -(sz2 + sz1) * 0.5;
      cc[i][7][2] = (sx2 + sx1) * 0.5;
      cc[i][7][6] = -0.5 * (tz2 - tz1);
      cc[i][7][7] = 1.0;
      cc[i][7][8] = 0.5 * (tx2 - tx1);

      rr[i][8] =
        sz2 - sz1 - (sy2 + sy1) * 0.5 * (tx2 - tx1) - (sx2 + sx1) * 0.5 * (ty2 - ty1) -
        state.PZ[i] * dxii;
      aa[i][8][0] = (sy2 + sy1) * 0.5 - state.PZ_TX[i] * dxii * 0.5;
      aa[i][8][1] = (sx2 + sx1) * 0.5 - state.PZ_TY[i] * dxii * 0.5;
      aa[i][8][6] = -0.5 * (ty2 - ty1);
      aa[i][8][7] = -0.5 * (tx2 - tx1);
      aa[i][8][8] = -1.0;
      aa[i][8][11] = -state.PZ_WZ[i] * dxii * 0.5;
      cc[i][8][0] = -(sy2 + sy1) * 0.5 - state.PZ_TX[i] * dxii * 0.5;
      cc[i][8][1] = -(sx2 + sx1) * 0.5 - state.PZ_TY[i] * dxii * 0.5;
      cc[i][8][6] = -0.5 * (ty2 - ty1);
      cc[i][8][7] = -0.5 * (tx2 - tx1);
      cc[i][8][8] = 1.0;
      cc[i][8][11] = -state.PZ_WZ[i] * dxii * 0.5;

      const sb = Math.sin(state.BETA[i]);
      const cb = Math.cos(state.BETA[i]);

      let gj;
      let ek;
      let ea;
      let eizz;
      let eixx;
      let eixz;
      let eizzB;
      let eixxB;
      let eixzB;
      if (state.LSTRUC) {
        gj = state.GJB[i] / eiRef;
        ek = state.EKB[i] / ekRef;
        ea = state.EAB[i] / eaRef;
        eizz = (state.EIXXB[i] * cb ** 2 + state.EIYYB[i] * sb ** 2) / eiRef;
        eixx = (state.EIXXB[i] * sb ** 2 + state.EIYYB[i] * cb ** 2) / eiRef;
        eixz = (state.EIXXB[i] * sb * cb - state.EIYYB[i] * sb * cb) / eiRef;
        eizzB = ((-state.EIXXB[i] + state.EIYYB[i]) * 2.0 * sb * cb) / eiRef;
        eixxB = ((state.EIXXB[i] - state.EIYYB[i]) * 2.0 * sb * cb) / eiRef;
        eixzB =
          ((state.EIXXB[i] - state.EIYYB[i]) * (cb * cb - sb * sb)) / eiRef;
      } else {
        const eibig = 1.0e8;
        gj = eibig;
        ek = 0.0;
        ea = eibig;
        eizz = eibig;
        eixx = eibig;
        eixz = 0.0;
        eizzB = 0.0;
        eixxB = 0.0;
        eixzB = 0.0;
      }

      rr[i + 1][0] = eizz * (tx2 - tx1) - eixz * (tz2 - tz1) - (mx2 + mx1) * 0.5 * dxii;
      bb[i + 1][0][0] = -eizz;
      bb[i + 1][0][1] = eizzB * (tx2 - tx1) * 0.5 - eixzB * (tz2 - tz1) * 0.5;
      bb[i + 1][0][2] = eixz;
      bb[i + 1][0][3] = -0.5 * dxii;
      aa[i + 1][0][0] = eizz;
      aa[i + 1][0][1] = eizzB * (tx2 - tx1) * 0.5 - eixzB * (tz2 - tz1) * 0.5;
      aa[i + 1][0][2] = -eixz;
      aa[i + 1][0][3] = -0.5 * dxii;

      rr[i + 1][1] = gj * (ty2 - ty1) - (my2 + my1) * 0.5 * dxii - ek * (wy2 - wy1);
      bb[i + 1][1][1] = -gj;
      bb[i + 1][1][4] = -0.5 * dxii;
      bb[i + 1][1][10] = ek;
      aa[i + 1][1][1] = gj;
      aa[i + 1][1][4] = -0.5 * dxii;
      aa[i + 1][1][10] = -ek;

      rr[i + 1][2] = eixx * (tz2 - tz1) - eixz * (tx2 - tx1) - (mz2 + mz1) * 0.5 * dxii;
      bb[i + 1][2][0] = eixz;
      bb[i + 1][2][1] = eixxB * (tz2 - tz1) - eixzB * (tx2 - tx1);
      bb[i + 1][2][2] = -eixx;
      bb[i + 1][2][5] = -0.5 * dxii;
      aa[i + 1][2][0] = -eixz;
      aa[i + 1][2][1] = eixxB * (tz2 - tz1) - eixzB * (tx2 - tx1);
      aa[i + 1][2][2] = eixx;
      aa[i + 1][2][5] = -0.5 * dxii;

      rr[i + 1][9] = -wx2 + wx1 + (tz2 + tz1) * 0.5 * dxii;
      bb[i + 1][9][2] = 0.5 * dxii;
      bb[i + 1][9][9] = 1.0;
      aa[i + 1][9][2] = 0.5 * dxii;
      aa[i + 1][9][9] = -1.0;

      rr[i + 1][10] = -wy2 + wy1 + ((sy2 + sy1) * 0.5 * dxii) / ea;
      bb[i + 1][10][4] = (0.5 * dxii) / ea;
      bb[i + 1][10][10] = 1.0;
      aa[i + 1][10][4] = (0.5 * dxii) / ea;
      aa[i + 1][10][10] = -1.0;

      rr[i + 1][11] = -wz2 + wz1 + (tx2 + tx1) * 0.5 * dxii;
      bb[i + 1][11][0] = 0.5 * dxii;
      bb[i + 1][11][11] = 1.0;
      aa[i + 1][11][0] = 0.5 * dxii;
      aa[i + 1][11][11] = -1.0;
    }

    aa[state.II][3][3] = 1.0;
    aa[state.II][4][4] = 1.0;
    aa[state.II][5][5] = 1.0;
    aa[state.II][6][6] = 1.0;
    aa[state.II][7][7] = 1.0;
    aa[state.II][8][8] = 1.0;

    B12SOL(aa, bb, cc, rr, state.II + 1);

    rmax = 0.0;
    let rms = 0.0;
    const rlxr = new Float64Array(12);
    rlxr.fill(1.0);

    for (let i = 0; i < state.II + 1; i += 1) {
      for (let k = 0; k < 12; k += 1) {
        if (rlxr[k] * rr[i][k] > rrLim[k]) {
          rlxr[k] = rrLim[k] / rr[i][k];
        }
        if (rlxr[k] * rr[i][k] < -rrLim[k]) {
          rlxr[k] = -rrLim[k] / rr[i][k];
        }
        rmax = Math.max(rmax, Math.abs(rr[i][k] / rrLim[k]));
        rms += (rr[i][k] / rrLim[k]) ** 2;
      }
    }

    rms = Math.sqrt(rms / (9 * state.II));
    let rlx = 1.0;
    for (let k = 0; k < 12; k += 1) {
      rlx = Math.min(rlx, rlxr[k]);
    }

    for (let i = 0; i < state.II + 1; i += 1) {
      state.TX[i] = state.TX[i] - rlx * rr[i][0];
      state.TY[i] = state.TY[i] - rlx * rr[i][1];
      state.TZ[i] = state.TZ[i] - rlx * rr[i][2];
      state.MOMX[i] = state.MOMX[i] - rlx * rr[i][3];
      state.MOMY[i] = state.MOMY[i] - rlx * rr[i][4];
      state.MOMZ[i] = state.MOMZ[i] - rlx * rr[i][5];
      state.SHRX[i] = state.SHRX[i] - rlx * rr[i][6];
      state.SHRY[i] = state.SHRY[i] - rlx * rr[i][7];
      state.SHRZ[i] = state.SHRZ[i] - rlx * rr[i][8];
      state.WX[i] = state.WX[i] - rlx * rr[i][9];
      state.WY[i] = state.WY[i] - rlx * rr[i][10];
      state.WZ[i] = state.WZ[i] - rlx * rr[i][11];
    }

    state.RMS = rms;
    state.RLX = rlx;
    iterCount = iter;
    if (rmax <= EPS) {
      converged = true;
      break;
    }
  }

  return { converged, iterations: iterCount, RMAX: rmax, RMS: state.RMS, RLX: state.RLX };
}

function STADD(state) {
  for (let i = 0; i < state.II; i += 1) {
    state.BETA[i] = state.BETA0[i] + 0.5 * (state.TY[i] + state.TY[i + 1]);
  }
  state.CONV = false;
  return { tipAngleDeflectionDeg: ((state.BETA[state.II - 1] - state.BETA0[state.II - 1]) * 180.0) / PI };
}

function STSET(state) {
  for (let i = 0; i < state.II; i += 1) {
    state.BETA0[i] = state.BETA[i] - 0.5 * (state.TY[i] + state.TY[i + 1]);
  }
  state.CONV = false;
  return { tipAngleDeflectionDeg: ((state.BETA[state.II - 1] - state.BETA0[state.II - 1]) * 180.0) / PI };
}

function structuralStrains(state) {
  const cosr = Math.cos(state.RAKE);
  const rows = [];
  for (let i = 0; i < state.II; i += 1) {
    const rst = state.RSTB[i] / state.RAD;
    const dxii = state.DXI[i] / cosr;
    const ex = (rst * (state.TZ[i + 1] - state.TZ[i])) / dxii * 1000.0;
    const ez = (-rst * (state.TX[i + 1] - state.TX[i])) / dxii * 1000.0;
    const ey = ((state.WY[i + 1] - state.WY[i]) / dxii) * 1000.0;
    const gt = (rst * (state.TY[i + 1] - state.TY[i])) / dxii * 1000.0;
    const emax = Math.sqrt(ex ** 2 + ez ** 2) + ey;
    rows.push({ index: i + 1, XI: state.XI[i], EX: ex, EZ: ez, EY: ey, EMAX: emax, GT: gt });
  }
  return rows;
}

function STWRIT(state) {
  const rtd = 180.0 / PI;
  const iadd = state.INCR;
  const momRef = state.RHO * state.VEL ** 2 * state.RAD ** 3;
  const forceRef = state.RHO * state.VEL ** 2 * state.RAD ** 2;

  const beamRows = [];
  for (let i = 0; i < state.II; i += iadd) {
    beamRows.push({
      index: i + 1,
      XI: state.XI[i],
      WXA: state.WX[i],
      WZA: state.WZ[i],
      TYA: state.TY[i] * rtd,
      MZA: state.MOMZ[i] * momRef,
      MXA: state.MOMX[i] * momRef,
      MYA: state.MOMY[i] * momRef,
      SYA: state.SHRY[i] * forceRef,
      SXA: state.SHRX[i] * forceRef,
      SZA: state.SHRZ[i] * forceRef,
    });
  }

  const strainRows = structuralStrains(state)
    .filter((row, index) => index % iadd === 0)
    .map((row) => ({
      index: row.index,
      XI: row.XI,
      EX: row.EX,
      EZ: row.EZ,
      EY: row.EY,
      EMAX: row.EMAX,
      GT: row.GT,
    }));

  return { beamRows, strainRows };
}

function SHOBLK(N, I, A) {
  const out = [];
  for (let k = 0; k < N; k += 1) {
    out.push(Array.from(A[k]).slice(0, 12));
  }
  return { I, rows: out };
}

function PLEP(N, X, EX, EY, EZ, GT, EM, XMAX, DX, YMAX, DY, PAR, CH) {
  return {
    kind: 'strain',
    axes: { XMAX, DX, YMAX, DY, PAR, CH },
    series: [
      { name: 'EMAX', color: 'magenta', x: Array.from(X).slice(0, N), y: Array.from(EM).slice(0, N) },
      { name: 'EX', color: 'red', x: Array.from(X).slice(0, N), y: Array.from(EX).slice(0, N) },
      { name: 'EZ', color: 'orange', x: Array.from(X).slice(0, N), y: Array.from(EZ).slice(0, N) },
      { name: 'EY', color: 'green', x: Array.from(X).slice(0, N), y: Array.from(EY).slice(0, N) },
      { name: 'GT', color: 'cyan', x: Array.from(X).slice(0, N), y: Array.from(GT).slice(0, N) },
    ],
  };
}

function PLMF(N, X, MX, MY, MZ, SY, XMAX, DX, YMAX, DY, PAR, CH, XMX, XMY, XMZ, XSY) {
  return {
    kind: 'loads',
    axes: { XMAX, DX, YMAX, DY, PAR, CH },
    exponents: { XMX, XMY, XMZ, XSY },
    series: [
      { name: 'MX', color: 'red', x: Array.from(X).slice(0, N), y: Array.from(MX).slice(0, N) },
      { name: 'MZ', color: 'orange', x: Array.from(X).slice(0, N), y: Array.from(MZ).slice(0, N) },
      { name: 'SY', color: 'green', x: Array.from(X).slice(0, N), y: Array.from(SY).slice(0, N) },
      { name: 'MY', color: 'cyan', x: Array.from(X).slice(0, N), y: Array.from(MY).slice(0, N) },
    ],
  };
}

function PLEI(N, X, R, EI, EA, GJ, EK, MA, XMAX, DX, YMAX, DY, PAR, CH, XEI, XGJ, XEK, XEA, XMA) {
  return {
    kind: 'stiffness',
    axes: { XMAX, DX, YMAX, DY, PAR, CH },
    exponents: { XEI, XGJ, XEK, XEA, XMA },
    radius: Array.from(R).slice(0, N),
    series: [
      { name: 'EI', color: 'magenta', x: Array.from(X).slice(0, N), y: Array.from(EI).slice(0, N) },
      { name: 'GJ', color: 'red', x: Array.from(X).slice(0, N), y: Array.from(GJ).slice(0, N) },
      { name: 'EK', color: 'orange', x: Array.from(X).slice(0, N), y: Array.from(EK).slice(0, N) },
      { name: 'EA', color: 'yellow', x: Array.from(X).slice(0, N), y: Array.from(EA).slice(0, N) },
      { name: 'MA', color: 'cyan', x: Array.from(X).slice(0, N), y: Array.from(MA).slice(0, N) },
    ],
  };
}

function STPLOT(state) {
  const ex = new Float64Array(state.II);
  const ey = new Float64Array(state.II);
  const ez = new Float64Array(state.II);
  const gt = new Float64Array(state.II);
  const em = new Float64Array(state.II);
  const bmx = new Float64Array(state.II);
  const bmy = new Float64Array(state.II);
  const bmz = new Float64Array(state.II);
  const sfy = new Float64Array(state.II);

  const momRef = state.RHO * state.VEL ** 2 * state.RAD ** 3;
  const forceRef = state.RHO * state.VEL ** 2 * state.RAD ** 2;
  const cosr = Math.cos(state.RAKE);

  for (let i = 0; i < state.II; i += 1) {
    const dxii = state.DXI[i] / cosr;
    const rst = state.RSTB[i] / state.RAD;
    ex[i] = (rst * (state.TZ[i + 1] - state.TZ[i])) / dxii * 1000.0;
    ez[i] = (rst * (state.TX[i + 1] - state.TX[i])) / dxii * 1000.0;
    ey[i] = ((state.WY[i + 1] - state.WY[i]) / dxii) * 1000.0;
    gt[i] = (-rst * (state.TY[i + 1] - state.TY[i])) / dxii * 1000.0;
    em[i] = Math.sqrt(ex[i] ** 2 + ez[i] ** 2) + ey[i];
    bmx[i] = state.MOMX[i] * momRef;
    bmy[i] = -state.MOMY[i] * momRef;
    bmz[i] = state.MOMZ[i] * momRef;
    sfy[i] = state.SHRY[i] * forceRef;
  }

  const maxExp = (values) => {
    let vmax = 0.0;
    for (const value of values) {
      vmax = Math.max(vmax, Math.abs(value));
    }
    return vmax > 0.0 ? Math.trunc(Math.log10(vmax) + 100.0) - 99.0 : 0.0;
  };

  return {
    strainPlot: PLEP(state.II, state.XI, ex, ey, ez, gt, em, 1.0, 0.2, 2.0, 0.5, 0.6, 1.2),
    loadPlot: PLMF(
      state.II,
      state.XI,
      bmx,
      bmy,
      bmz,
      sfy,
      1.0,
      0.2,
      1.0,
      0.2,
      0.6,
      1.2,
      maxExp(bmx),
      maxExp(bmy),
      maxExp(bmz),
      maxExp(sfy),
    ),
  };
}

function EIPLOT(state) {
  const maxExp = (values) => {
    let vmax = 0.0;
    for (const value of values) {
      vmax = Math.max(vmax, Math.abs(value));
    }
    return vmax > 0.0 ? Math.trunc(Math.log10(vmax) + 100.95) - 100.0 : 0.0;
  };

  return PLEI(
    state.II,
    state.XI,
    state.RSTB,
    state.EIYYB,
    state.EAB,
    state.GJB,
    state.EKB,
    state.MB,
    1.0,
    0.2,
    1.0,
    0.2,
    1.0,
    1.2,
    maxExp(state.EIYYB),
    maxExp(state.GJB),
    maxExp(state.EKB),
    maxExp(state.EAB),
    maxExp(state.MB),
  );
}

function BEND(state, action = {}) {
  const command = (action.command ?? '').toUpperCase();
  if (command === 'READ') {
    return EILOAD(state, action.fileName, { text: action.text });
  }
  if (command === 'CLR') {
    return STCLR(state);
  }
  if (command === 'EVAL') {
    const calc = STCALC(state);
    return { calc, report: STWRIT(state) };
  }
  if (command === 'DEFL') {
    return STADD(state);
  }
  if (command === 'REST') {
    for (let i = 0; i < state.II; i += 1) {
      state.BETA[i] = state.BETA0[i];
    }
    state.CONV = false;
    return state;
  }
  if (command === 'PLOT') {
    if (action.index === 1) {
      return EIPLOT(state);
    }
    if (action.index === 2) {
      return STPLOT(state);
    }
    throw new Error('BEND: unsupported plot number');
  }
  if (command === 'WRIT') {
    return STWRIT(state);
  }
  if (command === 'SETS') {
    return STSET(state);
  }
  if (command === 'MCLR') {
    return MCLR(state);
  }
  if (command === 'ANNO' || command === 'HARD' || command === 'HELP' || command === 'SIZE') {
    return { command, value: action.value ?? null };
  }
  throw new Error(`BEND: unsupported command ${command}`);
}

module.exports = {
  IX,
  IXP,
  PI,
  createState,
  createStructuralState,
  defaultCSCALC,
  BEND,
  EILOAD,
  STCLR,
  MCLR,
  STLOAD,
  STCALC,
  STADD,
  STSET,
  STWRIT,
  B12SOL,
  SHOBLK,
  STPLOT,
  PLEP,
  PLMF,
  EIPLOT,
  PLEI,
};
