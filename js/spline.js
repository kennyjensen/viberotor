'use strict';

const NMAX = 1000;

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

function trunc(value) {
  return Math.trunc(value);
}

function copySlice(values, start, count) {
  const out = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    out[i] = values[start + i];
  }
  return out;
}

function locateInterval(SS, S, N) {
  let ilow = 1;
  let i = N;

  while (i - ilow > 1) {
    const imid = trunc((i + ilow) / 2.0);
    if (SS < S[imid - 1]) {
      i = imid;
    } else {
      ilow = imid;
    }
  }

  const ilo = i - 2;
  const ihi = i - 1;
  const ds = S[ihi] - S[ilo];
  const t = (SS - S[ilo]) / ds;
  return { ilo, ihi, ds, t };
}

function TRISOL(A, B, C, D, KK) {
  const a = ensureVector(A, KK, 'A');
  const b = ensureVector(B, KK, 'B');
  const c = ensureVector(C, KK, 'C');
  const d = ensureVector(D, KK, 'D');

  for (let k = 2; k <= KK; k += 1) {
    const km = k - 1;
    c[km - 1] = c[km - 1] / a[km - 1];
    d[km - 1] = d[km - 1] / a[km - 1];
    a[k - 1] = a[k - 1] - b[k - 1] * c[km - 1];
    d[k - 1] = d[k - 1] - b[k - 1] * d[km - 1];
  }

  d[KK - 1] = d[KK - 1] / a[KK - 1];

  for (let k = KK - 1; k >= 1; k -= 1) {
    d[k - 1] = d[k - 1] - c[k - 1] * d[k];
  }

  return d;
}

function SPLINE(X, XS, S, N) {
  assert(N <= NMAX, 'SPLINE: array overflow, increase NMAX');
  const x = ensureVector(X, N, 'X');
  const xs = XS ?? new Float64Array(N);
  const s = ensureVector(S, N, 'S');
  const a = new Float64Array(N);
  const b = new Float64Array(N);
  const c = new Float64Array(N);

  if (N === 1) {
    xs[0] = 0.0;
    return xs;
  }

  for (let i = 2; i <= N - 1; i += 1) {
    const dsm = s[i - 1] - s[i - 2];
    const dsp = s[i] - s[i - 1];
    b[i - 1] = dsp;
    a[i - 1] = 2.0 * (dsm + dsp);
    c[i - 1] = dsm;
    xs[i - 1] =
      3.0 * (((x[i] - x[i - 1]) * dsm) / dsp + ((x[i - 1] - x[i - 2]) * dsp) / dsm);
  }

  a[0] = 2.0;
  c[0] = 1.0;
  xs[0] = (3.0 * (x[1] - x[0])) / (s[1] - s[0]);
  b[N - 1] = 1.0;
  a[N - 1] = 2.0;
  xs[N - 1] = (3.0 * (x[N - 1] - x[N - 2])) / (s[N - 1] - s[N - 2]);

  TRISOL(a, b, c, xs, N);
  return xs;
}

function SPLIND(X, XS, S, N, XS1, XS2) {
  assert(N <= NMAX, 'SPLIND: array overflow, increase NMAX');
  const x = ensureVector(X, N, 'X');
  const xs = XS ?? new Float64Array(N);
  const s = ensureVector(S, N, 'S');
  const a = new Float64Array(N);
  const b = new Float64Array(N);
  const c = new Float64Array(N);

  if (N === 1) {
    xs[0] = 0.0;
    return xs;
  }

  for (let i = 2; i <= N - 1; i += 1) {
    const dsm = s[i - 1] - s[i - 2];
    const dsp = s[i] - s[i - 1];
    b[i - 1] = dsp;
    a[i - 1] = 2.0 * (dsm + dsp);
    c[i - 1] = dsm;
    xs[i - 1] =
      3.0 * (((x[i] - x[i - 1]) * dsm) / dsp + ((x[i - 1] - x[i - 2]) * dsp) / dsm);
  }

  if (XS1 === 999.0) {
    a[0] = 2.0;
    c[0] = 1.0;
    xs[0] = (3.0 * (x[1] - x[0])) / (s[1] - s[0]);
  } else if (XS1 === -999.0) {
    a[0] = 1.0;
    c[0] = 1.0;
    xs[0] = (2.0 * (x[1] - x[0])) / (s[1] - s[0]);
  } else {
    a[0] = 1.0;
    c[0] = 0.0;
    xs[0] = XS1;
  }

  if (XS2 === 999.0) {
    b[N - 1] = 1.0;
    a[N - 1] = 2.0;
    xs[N - 1] = (3.0 * (x[N - 1] - x[N - 2])) / (s[N - 1] - s[N - 2]);
  } else if (XS2 === -999.0) {
    b[N - 1] = 1.0;
    a[N - 1] = 1.0;
    xs[N - 1] = (2.0 * (x[N - 1] - x[N - 2])) / (s[N - 1] - s[N - 2]);
  } else {
    a[N - 1] = 1.0;
    b[N - 1] = 0.0;
    xs[N - 1] = XS2;
  }

  if (N === 2 && XS1 === -999.0 && XS2 === -999.0) {
    b[N - 1] = 1.0;
    a[N - 1] = 2.0;
    xs[N - 1] = (3.0 * (x[N - 1] - x[N - 2])) / (s[N - 1] - s[N - 2]);
  }

  TRISOL(a, b, c, xs, N);
  return xs;
}

function SPLINA(X, XS, S, N) {
  const x = ensureVector(X, N, 'X');
  const xs = XS ?? new Float64Array(N);
  const s = ensureVector(S, N, 'S');

  if (N === 1) {
    xs[0] = 0.0;
    return xs;
  }

  let lend = true;
  let xs1 = 0.0;
  let xs2 = 0.0;
  for (let i = 1; i <= N - 1; i += 1) {
    const ds = s[i] - s[i - 1];
    if (ds === 0.0) {
      xs[i - 1] = xs1;
      lend = true;
    } else {
      const dx = x[i] - x[i - 1];
      xs2 = dx / ds;
      if (lend) {
        xs[i - 1] = xs2;
        lend = false;
      } else {
        xs[i - 1] = 0.5 * (xs1 + xs2);
      }
    }
    xs1 = xs2;
  }
  xs[N - 1] = xs1;
  return xs;
}

function SEVAL(SS, X, XS, S, N) {
  const x = ensureVector(X, N, 'X');
  const xs = ensureVector(XS, N, 'XS');
  const s = ensureVector(S, N, 'S');

  if (N === 1) {
    return x[0];
  }

  const { ilo, ihi, ds, t } = locateInterval(SS, s, N);
  const cx1 = ds * xs[ilo] - x[ihi] + x[ilo];
  const cx2 = ds * xs[ihi] - x[ihi] + x[ilo];
  return t * x[ihi] + (1.0 - t) * x[ilo] + (t - t * t) * ((1.0 - t) * cx1 - t * cx2);
}

function DEVAL(SS, X, XS, S, N) {
  const x = ensureVector(X, N, 'X');
  const xs = ensureVector(XS, N, 'XS');
  const s = ensureVector(S, N, 'S');

  if (N === 1) {
    return xs[0];
  }

  const { ilo, ihi, ds, t } = locateInterval(SS, s, N);
  const cx1 = ds * xs[ilo] - x[ihi] + x[ilo];
  const cx2 = ds * xs[ihi] - x[ihi] + x[ilo];
  let value = x[ihi] - x[ilo] + (1.0 - 4.0 * t + 3.0 * t * t) * cx1 + t * (3.0 * t - 2.0) * cx2;
  value = value / ds;
  return value;
}

function D2VAL(SS, X, XS, S, N) {
  const x = ensureVector(X, N, 'X');
  const xs = ensureVector(XS, N, 'XS');
  const s = ensureVector(S, N, 'S');

  if (N === 1) {
    return 0.0;
  }

  const { ilo, ihi, ds, t } = locateInterval(SS, s, N);
  const cx1 = ds * xs[ilo] - x[ihi] + x[ilo];
  const cx2 = ds * xs[ihi] - x[ihi] + x[ilo];
  let value = (6.0 * t - 4.0) * cx1 + (6.0 * t - 2.0) * cx2;
  value = value / ds ** 2;
  return value;
}

function SEVALL(SS, X, XS, S, N) {
  const x = ensureVector(X, N, 'X');
  const xs = ensureVector(XS, N, 'XS');
  const s = ensureVector(S, N, 'S');

  if (N === 1) {
    return { XX: x[0], XXS: xs[0], XXSS: 0.0 };
  }

  const { ilo, ihi, ds, t } = locateInterval(SS, s, N);
  const f0 = x[ilo];
  const f1 = ds * xs[ilo];
  const f2 = -ds * (2.0 * xs[ilo] + xs[ihi]) + 3.0 * (x[ihi] - x[ilo]);
  const f3 = ds * (xs[ilo] + xs[ihi]) - 2.0 * (x[ihi] - x[ilo]);

  const xx = f0 + t * (f1 + t * (f2 + t * f3));
  let xxs = f1 + t * (2.0 * f2 + t * 3.0 * f3);
  let xxss = 2.0 * f2 + t * 6.0 * f3;
  xxs = xxs / ds;
  xxss = xxss / ds ** 2;

  return { XX: xx, XXS: xxs, XXSS: xxss };
}

function CURV(SS, X, XS, Y, YS, S, N) {
  const x = ensureVector(X, N, 'X');
  const xs = ensureVector(XS, N, 'XS');
  const y = ensureVector(Y, N, 'Y');
  const ys = ensureVector(YS, N, 'YS');
  const s = ensureVector(S, N, 'S');

  if (N === 1) {
    return 0.0;
  }

  const { ilo, ihi, ds, t } = locateInterval(SS, s, N);

  const cx1 = ds * xs[ilo] - x[ihi] + x[ilo];
  const cx2 = ds * xs[ihi] - x[ihi] + x[ilo];
  const xd = x[ihi] - x[ilo] + (1.0 - 4.0 * t + 3.0 * t * t) * cx1 + t * (3.0 * t - 2.0) * cx2;
  const xdd = (6.0 * t - 4.0) * cx1 + (6.0 * t - 2.0) * cx2;

  const cy1 = ds * ys[ilo] - y[ihi] + y[ilo];
  const cy2 = ds * ys[ihi] - y[ihi] + y[ilo];
  const yd = y[ihi] - y[ilo] + (1.0 - 4.0 * t + 3.0 * t * t) * cy1 + t * (3.0 * t - 2.0) * cy2;
  const ydd = (6.0 * t - 4.0) * cy1 + (6.0 * t - 2.0) * cy2;

  return (xd * ydd - yd * xdd) / Math.sqrt((xd * xd + yd * yd) ** 3);
}

function CURVS(SS, X, XS, Y, YS, S, N) {
  const x = ensureVector(X, N, 'X');
  const xs = ensureVector(XS, N, 'XS');
  const y = ensureVector(Y, N, 'Y');
  const ys = ensureVector(YS, N, 'YS');
  const s = ensureVector(S, N, 'S');

  if (N === 1) {
    return 0.0;
  }

  const { ilo, ihi, ds, t } = locateInterval(SS, s, N);

  const cx1 = ds * xs[ilo] - x[ihi] + x[ilo];
  const cx2 = ds * xs[ihi] - x[ihi] + x[ilo];
  const xd = x[ihi] - x[ilo] + (1.0 - 4.0 * t + 3.0 * t * t) * cx1 + t * (3.0 * t - 2.0) * cx2;
  const xdd = (6.0 * t - 4.0) * cx1 + (6.0 * t - 2.0) * cx2;
  const xddd = 6.0 * cx1 + 6.0 * cx2;

  const cy1 = ds * ys[ilo] - y[ihi] + y[ilo];
  const cy2 = ds * ys[ihi] - y[ihi] + y[ilo];
  const yd = y[ihi] - y[ilo] + (1.0 - 4.0 * t + 3.0 * t * t) * cy1 + t * (3.0 * t - 2.0) * cy2;
  const ydd = (6.0 * t - 4.0) * cy1 + (6.0 * t - 2.0) * cy2;
  const yddd = 6.0 * cy1 + 6.0 * cy2;

  const sqrtb = Math.sqrt(xd * xd + yd * yd);
  const bot = sqrtb ** 3;
  const dbotdt = 3.0 * sqrtb * (xd * xdd + yd * ydd);
  const top = xd * ydd - yd * xdd;
  const dtopdt = xd * yddd - yd * xddd;

  return ((dtopdt * bot - dbotdt * top) / bot ** 2) / ds;
}

function SINVRT(SI, XI, X, XS, S, N) {
  let si = SI;
  const x = ensureVector(X, N, 'X');
  const xs = ensureVector(XS, N, 'XS');
  const s = ensureVector(S, N, 'S');

  for (let iter = 1; iter <= 10; iter += 1) {
    const res = SEVAL(si, x, xs, s, N) - XI;
    const resp = DEVAL(si, x, xs, s, N);
    const ds = -res / resp;
    si = si + ds;
    if (Math.abs(ds / (s[N - 1] - s[0])) < 1.0e-5) {
      return { SI: si, converged: true };
    }
  }

  return { SI: si, converged: false };
}

function SCALC(X, Y, S, N) {
  const x = ensureVector(X, N, 'X');
  const y = ensureVector(Y, N, 'Y');
  const s = S ?? new Float64Array(N);

  s[0] = 0.0;
  for (let i = 2; i <= N; i += 1) {
    s[i - 1] = s[i - 2] + Math.sqrt((x[i - 1] - x[i - 2]) ** 2 + (y[i - 1] - y[i - 2]) ** 2);
  }

  return s;
}

function SEGSPL(X, XS, S, N) {
  const x = ensureVector(X, N, 'X');
  const xs = XS ?? new Float64Array(N);
  const s = ensureVector(S, N, 'S');

  if (N === 1) {
    xs[0] = 0.0;
    return xs;
  }

  assert(s[0] !== s[1], 'SEGSPL: First input point duplicated');
  assert(s[N - 1] !== s[N - 2], 'SEGSPL: Last input point duplicated');

  let iseg0 = 0;
  for (let iseg = 1; iseg <= N - 3; iseg += 1) {
    if (s[iseg] === s[iseg + 1]) {
      const nseg = iseg - iseg0 + 1;
      const subxs = SPLIND(
        copySlice(x, iseg0, nseg),
        new Float64Array(nseg),
        copySlice(s, iseg0, nseg),
        nseg,
        -999.0,
        -999.0,
      );
      for (let i = 0; i < nseg; i += 1) {
        xs[iseg0 + i] = subxs[i];
      }
      iseg0 = iseg + 1;
    }
  }

  const nseg = N - iseg0;
  const subxs = SPLIND(
    copySlice(x, iseg0, nseg),
    new Float64Array(nseg),
    copySlice(s, iseg0, nseg),
    nseg,
    -999.0,
    -999.0,
  );
  for (let i = 0; i < nseg; i += 1) {
    xs[iseg0 + i] = subxs[i];
  }

  return xs;
}

function INTERS(SS1, SS2, X1, XS1, Y1, YS1, S1, N1, X2, XS2, Y2, YS2, S2, N2) {
  let ok = true;
  let ss1 = SS1;
  let ss2 = SS2;
  let rs1 = 1.0e12;
  let rs2 = 1.0e12;
  let ds1 = 0.0;
  let ds2 = 0.0;
  let clip1 = false;
  let clip2 = false;
  let underRelaxationFailed = false;
  const eps = 1.0e-5;
  const eps1 = eps * Math.abs(S1[N1 - 1] - S1[0]);
  const eps2 = eps * Math.abs(S2[N2 - 1] - S2[0]);

  for (let iter = 1; iter <= 12; iter += 1) {
    let rlx = 1.0;
    const ss1Old = ss1;
    const ss2Old = ss2;
    const rs1Old = Math.abs(rs1);
    const rs2Old = Math.abs(rs2);
    let relaxed = false;

    for (let irlx = 1; irlx <= 16; irlx += 1) {
      clip1 = false;
      clip2 = false;
      ss1 = ss1Old + rlx * ds1;
      ss2 = ss2Old + rlx * ds2;

      if (ss1 < S1[0] || ss1 > S1[N1 - 1]) {
        clip1 = true;
        ss1 = Math.max(ss1, S1[0]);
        ss1 = Math.min(ss1, S1[N1 - 1]);
      }
      if (ss2 < S2[0] || ss2 > S2[N2 - 1]) {
        clip2 = true;
        ss2 = Math.max(ss2, S2[0]);
        ss2 = Math.min(ss2, S2[N2 - 1]);
      }

      const xx1 = SEVAL(ss1, X1, XS1, S1, N1);
      const xx2 = SEVAL(ss2, X2, XS2, S2, N2);
      const yy1 = SEVAL(ss1, Y1, YS1, S1, N1);
      const yy2 = SEVAL(ss2, Y2, YS2, S2, N2);

      rs1 = xx1 - xx2;
      rs2 = yy1 - yy2;

      if (Math.abs(rs1) <= rs1Old + eps1 && Math.abs(rs2) <= rs2Old + eps2) {
        relaxed = true;
        break;
      }

      rlx = 0.5 * rlx;
    }

    if (!relaxed) {
      underRelaxationFailed = true;
    }

    const a11 = DEVAL(ss1, X1, XS1, S1, N1);
    const a12 = -DEVAL(ss2, X2, XS2, S2, N2);
    const a21 = DEVAL(ss1, Y1, YS1, S1, N1);
    const a22 = -DEVAL(ss2, Y2, YS2, S2, N2);
    const det = a11 * a22 - a12 * a21;
    ds1 = -((rs1 * a22 - a12 * rs2) / det);
    ds2 = -((a11 * rs2 - rs1 * a21) / det);

    if (Math.abs(ds1) < eps1 && Math.abs(ds2) < eps2) {
      return { OK: ok, SS1: ss1, SS2: ss2, clip1, clip2, underRelaxationFailed };
    }
  }

  ok = false;
  return { OK: ok, SS1: ss1, SS2: ss2, clip1, clip2, underRelaxationFailed };
}

function NEARPT(XPNT, YPNT, SNEAR, X, XP, Y, YP, S, N) {
  let snear = SNEAR;
  const eps = 1.0e-4 * (S[N - 1] - S[0]);

  for (let ipass = 1; ipass <= 10; ipass += 1) {
    const xEval = SEVALL(snear, X, XP, S, N);
    const yEval = SEVALL(snear, Y, YP, S, N);
    const res = (xEval.XX - XPNT) * xEval.XXS + (yEval.XX - YPNT) * yEval.XXS;
    const resS =
      xEval.XXS * xEval.XXS +
      yEval.XXS * yEval.XXS +
      (xEval.XX - XPNT) * xEval.XXSS +
      (yEval.XX - YPNT) * yEval.XXSS;
    const dsn = -res / resS;
    snear = snear + dsn;
    if (Math.abs(dsn) < eps) {
      return { SNEAR: snear, converged: true };
    }
  }

  return { SNEAR: snear, converged: false };
}

function SEVLIN(SS, X, S, N) {
  const x = ensureVector(X, N, 'X');
  const s = ensureVector(S, N, 'S');
  const { ilo, ihi, ds, t } = locateInterval(SS, s, N);
  const xx = t * x[ihi] + (1.0 - t) * x[ilo];
  const xxs = (x[ihi] - x[ilo]) / ds;
  return { XX: xx, XXS: xxs };
}

function SSEVLIN(SS, X, S, N) {
  const x = ensureVector(X, N, 'X');
  const s = ensureVector(S, N, 'S');
  const { ilo, ihi, ds, t } = locateInterval(SS, s, N);
  void ds;
  return t * x[ihi] + (1.0 - t) * x[ilo];
}

function DSEVLIN(SS, X, S, N) {
  const x = ensureVector(X, N, 'X');
  const s = ensureVector(S, N, 'S');
  const { ilo, ihi, ds } = locateInterval(SS, s, N);
  return (x[ihi] - x[ilo]) / ds;
}

module.exports = {
  SPLINE,
  SPLIND,
  SPLINA,
  TRISOL,
  SEVAL,
  DEVAL,
  D2VAL,
  SEVALL,
  CURV,
  CURVS,
  SINVRT,
  SCALC,
  SEGSPL,
  INTERS,
  NEARPT,
  SEVLIN,
  SSEVLIN,
  DSEVLIN,
};
