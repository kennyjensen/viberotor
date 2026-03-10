'use strict';

// Direct numerical port of third_party/Xrotor/src/xnoise.f.
// The original interactive menu and plotting entry points depended on
// XROTOR common blocks and the legacy plotting library, so in JS they are
// exposed as batch/data APIs while keeping the original routine names.
//
// Array mapping:
// - Fortran 1-based arrays map to JS index 0.
// - Fortran arrays declared 0:NT map directly to JS index 0..NT.
// - Helper routines copied from spline.f/plutil.f always treat JS index 0
//   as Fortran logical index 1, matching Fortran pass-by-reference slices.

const PI = 4.0 * Math.atan(1.0);
const HALF_PI = 0.5 * PI;
const TWO_PI = 2.0 * PI;
const FOUR_PI = 4.0 * PI;
const MICRO_PASCAL_REFERENCE = 20.0e-6;
const DEFAULT_NCOLOR = 64;

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

function ensureMatrix(value, nx, ny, name) {
  assert(Array.isArray(value), `${name}: expected an array of rows`);
  assert(value.length >= nx, `${name}: expected at least ${nx} rows`);
  for (let i = 0; i < nx; i += 1) {
    assert(
      isArrayLike(value[i]) && value[i].length >= ny,
      `${name}: row ${i} expected length >= ${ny}`,
    );
  }
  return value;
}

function createMatrix(nx, ny) {
  return Array.from({ length: nx }, () => new Float64Array(ny));
}

function createPressureMatrix(ntMax) {
  return Array.from({ length: ntMax + 1 }, () => new Float64Array(3));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function trunc(value) {
  return Math.trunc(value);
}

function amod(a, p) {
  return a % p;
}

function log10(value) {
  return Math.log10(value);
}

function flattenScalarOrArray(y, ii) {
  if (isArrayLike(y)) {
    return ensureVector(y, ii, 'SCALIT input');
  }
  assert(ii === 1, 'SCALIT: scalar input is only valid when II = 1');
  return [y];
}

function copyVector(values, count) {
  const out = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    out[i] = values[i];
  }
  return out;
}

function sumPressureComponents(PCOMP, NT, PRES) {
  const out = PRES ?? new Float64Array(NT + 1);
  ensureVector(out, NT + 1, 'PRES');
  for (let it = 0; it <= NT; it += 1) {
    out[it] = PCOMP[it][0] + PCOMP[it][1] + PCOMP[it][2];
  }
  return out;
}

function rmsPressure(PRES, TIME, NT) {
  let prms = 0.0;
  for (let it = 1; it <= NT; it += 1) {
    const delt = TIME[it] - TIME[it - 1];
    const pavg = 0.5 * (PRES[it] + PRES[it - 1]);
    prms += pavg * pavg * delt;
  }
  return Math.sqrt(prms / (TIME[NT] - TIME[0]));
}

function buildFootprintGrid(GALT, XLIM, YLIM, NDBSIZ) {
  const nx = NDBSIZ[0];
  const ny = NDBSIZ[1];
  const xdb = createMatrix(nx, ny);
  const ydb = createMatrix(nx, ny);
  const thx1 = Math.atan2(XLIM[0], GALT);
  const thx2 = Math.atan2(XLIM[1], GALT);
  const thy1 = Math.atan2(YLIM[0], GALT);
  const thy2 = Math.atan2(YLIM[1], GALT);

  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < ny; j += 1) {
      const thx = thx1 + ((thx2 - thx1) * i) / (nx - 1);
      const thy = thy1 + ((thy2 - thy1) * j) / (ny - 1);
      xdb[i][j] = GALT * Math.tan(thx);
      ydb[i][j] = GALT * Math.tan(thy);
    }
  }

  return { XDB: xdb, YDB: ydb };
}

function TRISOL(A, B, C, D, KK) {
  ensureVector(A, KK, 'A');
  ensureVector(B, KK, 'B');
  ensureVector(C, KK, 'C');
  ensureVector(D, KK, 'D');

  for (let k = 2; k <= KK; k += 1) {
    const km = k - 1;
    C[km - 1] = C[km - 1] / A[km - 1];
    D[km - 1] = D[km - 1] / A[km - 1];
    A[k - 1] = A[k - 1] - B[k - 1] * C[km - 1];
    D[k - 1] = D[k - 1] - B[k - 1] * D[km - 1];
  }

  D[KK - 1] = D[KK - 1] / A[KK - 1];

  for (let k = KK - 1; k >= 1; k -= 1) {
    D[k - 1] = D[k - 1] - C[k - 1] * D[k];
  }

  return D;
}

function SPLINE(X, XS, S, N) {
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

function SEVAL(SS, X, XS, S, N) {
  const x = ensureVector(X, N, 'X');
  const xs = ensureVector(XS, N, 'XS');
  const s = ensureVector(S, N, 'S');

  if (N === 1) {
    return x[0];
  }

  let ilow = 1;
  let i = N;

  while (i - ilow > 1) {
    const imid = trunc((i + ilow) / 2.0);
    if (SS < s[imid - 1]) {
      i = imid;
    } else {
      ilow = imid;
    }
  }

  const ds = s[i - 1] - s[i - 2];
  const t = (SS - s[i - 2]) / ds;
  const cx1 = ds * xs[i - 2] - x[i - 1] + x[i - 2];
  const cx2 = ds * xs[i - 1] - x[i - 1] + x[i - 2];
  return t * x[i - 1] + (1.0 - t) * x[i - 2] + (t - t * t) * ((1.0 - t) * cx1 - t * cx2);
}

function SCALIT(II, Y, YOFF) {
  const y = flattenScalarOrArray(Y, II);
  const ag2 = log10(2.0);
  const ag5 = log10(5.0);

  let ymax = Math.abs(y[0] - YOFF);
  for (let i = 2; i <= II; i += 1) {
    ymax = Math.max(ymax, Math.abs(y[i - 1] - YOFF));
  }

  if (ymax === 0.0) {
    return 1.0e8;
  }

  const ylog = log10(ymax);
  const ylog1 = trunc(ylog + 100.0) - 99.0;
  let ylog2 = ylog1 + ag2;
  if (ylog2 - 1.0 > ylog) {
    ylog2 -= 1.0;
  }
  let ylog5 = ylog1 + ag5;
  if (ylog5 - 1.0 > ylog) {
    ylog5 -= 1.0;
  }

  const gmin = Math.min(ylog1, ylog2, ylog5);
  return 10.0 ** (-gmin);
}

function PTRISO(A, B, C, D, KK) {
  const a = ensureVector(A, KK, 'A');
  const b = ensureVector(B, KK, 'B');
  const c = ensureVector(C, KK, 'C');
  const d = ensureVector(D, KK, 'D');

  for (let k = 2; k <= KK; k += 1) {
    const km = k - 1;
    const aInv = 1.0 / a[km - 1];
    c[km - 1] = c[km - 1] * aInv;
    d[km - 1] = d[km - 1] * aInv;
    b[km - 1] = b[km - 1] * aInv;
    a[k - 1] = a[k - 1] - b[k - 1] * c[km - 1];
    d[k - 1] = d[k - 1] - b[k - 1] * d[km - 1];
    if (k < KK) {
      b[k - 1] = -b[k - 1] * b[km - 1];
    } else {
      a[k - 1] = a[k - 1] - b[k - 1] * b[km - 1];
    }
  }

  c[KK - 1] = c[KK - 1] / a[KK - 1];
  d[KK - 1] = d[KK - 1] / a[KK - 1];

  for (let k = KK; k >= 2; k -= 1) {
    const km = k - 1;
    d[km - 1] = d[km - 1] - c[km - 1] * d[k - 1] - b[km - 1] * d[KK - 1];
    c[km - 1] = -c[km - 1] * c[k - 1] - b[km - 1] * c[KK - 1];
  }

  d[0] = d[0] / (1.0 + c[0]);

  for (let k = 2; k <= KK; k += 1) {
    d[k - 1] = d[k - 1] - c[k - 1] * d[0];
  }

  return d;
}

function PSPLIN(X, XP, S, II) {
  const x = ensureVector(X, II, 'X');
  const xp = XP ?? new Float64Array(II);
  const s = ensureVector(S, II, 'S');
  const a = new Float64Array(II - 1);
  const b = new Float64Array(II - 1);
  const c = new Float64Array(II - 1);

  assert(II <= 480, 'PSPLIN: Array overflow');
  assert(x[II - 1] === x[0], 'PSPLIN: Data not periodic');

  for (let i = 1; i <= II - 1; i += 1) {
    let dsmi;
    let dxm;
    let dspi;
    let dxp;

    if (i === 1) {
      dsmi = 1.0 / (s[II - 1] - s[II - 2]);
      dxm = x[II - 1] - x[II - 2];
      dspi = 1.0 / (s[1] - s[0]);
      dxp = x[1] - x[0];
    } else {
      dsmi = 1.0 / (s[i - 1] - s[i - 2]);
      dxm = x[i - 1] - x[i - 2];
      dspi = 1.0 / (s[i] - s[i - 1]);
      dxp = x[i] - x[i - 1];
    }

    b[i - 1] = dsmi;
    a[i - 1] = 2.0 * (dsmi + dspi);
    c[i - 1] = dspi;
    xp[i - 1] = 3.0 * (dxp * dspi ** 2 + dxm * dsmi ** 2);
  }

  PTRISO(a, b, c, xp, II - 1);
  xp[II - 1] = xp[0];
  return xp;
}

function PTRACE(
  XOBS,
  YOBS,
  ZOBS,
  NBLDS,
  II,
  XI,
  DXI,
  AOC,
  CH,
  GAM,
  ADV,
  RAD,
  VEL,
  VSO,
  RHO,
  NTMAX,
  NT,
  PRES,
  TIME,
) {
  const xi = ensureVector(XI, II, 'XI');
  const dxi = ensureVector(DXI, II, 'DXI');
  const aoc = ensureVector(AOC, II, 'AOC');
  const ch = ensureVector(CH, II, 'CH');
  const gam = ensureVector(GAM, II, 'GAM');
  const pres = PRES ?? createPressureMatrix(NTMAX);
  const time = TIME ?? new Float64Array(NTMAX + 1);
  const pel = Array.from({ length: II }, () => Array.from({ length: 3 }, () => new Float64Array(NT + 1)));
  const tel = Array.from({ length: II }, () => new Float64Array(NT + 1));
  const pelT = Array.from({ length: II }, () => new Float64Array(NT + 1));
  const warnings = [];

  assert(NT <= NTMAX, 'PTRACE: Array overflow. NT > NTMAX.');
  ensureMatrix(pres, NTMAX + 1, 3, 'PRES');
  ensureVector(time, NT + 1, 'TIME');

  const omega = VEL / (ADV * RAD);
  const mach = VEL / VSO;
  const rhovr = RHO * VEL * RAD;
  const vr = VEL * RAD;
  const robs = Math.sqrt(XOBS ** 2 + YOBS ** 2 + ZOBS ** 2);
  const tdelay = robs / VSO;
  const thobs = Math.atan2(-YOBS, ZOBS);

  for (let it = 0; it <= NT; it += 1) {
    const th = (TWO_PI * it) / NT + thobs + HALF_PI;
    const sint = Math.sin(th);
    const cost = Math.cos(th);
    const tau = th / omega;

    for (let i = 0; i < II; i += 1) {
      const xx = xi[i] / ADV;
      const x = XOBS;
      const y = YOBS + xi[i] * RAD * sint;
      const z = ZOBS - xi[i] * RAD * cost;
      const r = Math.sqrt(x * x + y * y + z * z);

      const xn = x / r;
      const yn = y / r;
      const zn = z / r;

      const xt = -VEL;
      const yt = VEL * xx * cost;
      const zt = VEL * xx * sint;
      const rt = (x * xt + y * yt + z * zt) / r;

      const xtt = 0.0;
      const ytt = -VEL * xx * sint * omega;
      const ztt = VEL * xx * cost * omega;
      const rtt =
        (x * xtt + y * ytt + z * ztt) / r +
        (xt * xt + yt * yt + zt * zt) / r -
        (rt * rt) / r;

      const max = mach;
      const may = -mach * xx * cost;
      const maz = -mach * xx * sint;

      const maxt = 0.0;
      const mayt = mach * xx * sint * omega;
      const mazt = -mach * xx * cost * omega;

      const maxtt = 0.0;
      const maytt = mach * xx * cost * omega ** 2;
      const maztt = mach * xx * sint * omega ** 2;

      const fx = -rhovr * gam[i] * xx * dxi[i] * vr;
      const fy = -rhovr * gam[i] * cost * dxi[i] * vr;
      const fz = -rhovr * gam[i] * sint * dxi[i] * vr;

      const fxt = 0.0;
      const fyt = rhovr * gam[i] * sint * dxi[i] * vr * omega;
      const fzt = -rhovr * gam[i] * cost * dxi[i] * vr * omega;

      let mr = (x * max + y * may + z * maz) / r;
      if (mr >= 1.0) {
        warnings.push({
          type: 'mach_clip',
          MR: mr,
          XI: xi[i],
          THETA_DEG: (th * 180.0) / PI,
        });
        mr = 0.995;
      }

      const mri = 1.0 / (1.0 - mr);
      const mrt =
        (xt * max + yt * may + zt * maz) / r +
        (x * maxt + y * mayt + z * mazt) / r -
        (rt * mr) / r;
      const mrit = mri ** 2 * mrt;
      const mrtt =
        (xtt * max + ytt * may + ztt * maz) / r +
        (2.0 * (xt * maxt + yt * mayt + zt * mazt)) / r +
        (x * maxtt + y * maytt + z * maztt) / r -
        (2.0 * rt * mrt) / r -
        (rtt * mr) / r;
      const mritt = 2.0 * mri * mrit * mrt + mri ** 2 * mrtt;

      const rdotf = xn * fx + yn * fy + zn * fz;
      const rdotft = xn * fxt + yn * fyt + zn * fzt;
      const rdotmt = xn * maxt + yn * mayt + zn * mazt;

      const mdotm = max * max + may * may + maz * maz;
      const fdotm = fx * max + fy * may + fz * maz;

      const plff = ((rdotft / VSO) + (rdotf * mri * rdotmt) / VSO) * mri ** 2 / r;
      const plnf = ((rdotf * (1.0 - mdotm) * mri - fdotm) * mri ** 2) / (r ** 2);

      const mor = mri / r;
      const mort = mrit / r - (rt * mor) / r;
      const mortt = mritt / r - (rtt * mor) / r - (2.0 * rt * mort) / r;
      const ptu = mri * (mrit * mort + mri * mortt);
      const pt = ptu * RHO * aoc[i] * ch[i] ** 2 * dxi[i] * RAD ** 3;

      pel[i][0][it] = plff / FOUR_PI;
      pel[i][1][it] = plnf / FOUR_PI;
      pel[i][2][it] = pt / FOUR_PI;

      const tob = tau + r / VSO;
      tel[i][it] = tob - tdelay;
    }
  }

  for (let i = 0; i < II; i += 1) {
    pel[i][0][NT] = pel[i][0][0];
    pel[i][1][NT] = pel[i][1][0];
    pel[i][2][NT] = pel[i][2][0];
  }

  const rotime = TWO_PI / omega;
  const bptime = rotime / NBLDS;
  const iLast = II - 1;
  const tmid = tel[iLast][Math.floor(NT / 2)];

  for (let it = 0; it <= NT; it += 1) {
    time[it] = tmid + (tel[iLast][it] - tmid) / NBLDS;
  }

  for (let l = 0; l < 3; l += 1) {
    for (let i = 0; i < II; i += 1) {
      PSPLIN(pel[i][l], pelT[i], tel[i], NT + 1);
    }

    for (let it = 1; it <= NT; it += 1) {
      let psum = 0.0;

      for (let i = 0; i < II; i += 1) {
        const tel0 = tel[i][0];
        const teln = tel[i][NT];
        const period = teln - tel0;

        for (let ib = 1; ib <= NBLDS; ib += 1) {
          const telb = time[it] + bptime * (ib - 1);
          let toff = tel0 + amod(telb - tel0, period);
          if (toff < tel0) {
            toff += period;
          }

          if (toff < tel0 || toff > teln) {
            throw new Error(`PTRACE: Time out of spline range (${toff}, ${tel0}, ${teln})`);
          }

          psum += SEVAL(toff, pel[i][l], pelT[i], tel[i], NT + 1);
        }
      }

      pres[it][l] = psum;
    }

    pres[0][l] = pres[NT][l];
  }

  const time0 = time[0];
  for (let it = 0; it <= NT; it += 1) {
    time[it] = time[it] - time0;
  }

  for (let l = 0; l < 3; l += 1) {
    let pint = 0.0;
    for (let it = 1; it <= NT; it += 1) {
      pint += (pres[it][l] + pres[it - 1][l]) * (time[it] - time[it - 1]);
    }
    const pavg = (0.5 * pint) / (time[NT] - time[0]);
    for (let it = 0; it <= NT; it += 1) {
      pres[it][l] = pres[it][l] - pavg;
    }
  }

  return { PRES: pres, TIME: time, warnings };
}

function SFT(Y, T, N, FAMPL, PHASE, NF) {
  const y = ensureVector(Y, N + 1, 'Y');
  const t = ensureVector(T, N + 1, 'T');
  assert(Number.isInteger(NF) && NF >= 0, 'SFT: NF must be a non-negative integer');
  const fampl = FAMPL ?? new Float64Array(NF);
  const phase = PHASE ?? new Float64Array(NF);
  const sint = new Float64Array(N + 1);
  const cost = new Float64Array(N + 1);

  assert(N + 1 <= 361, 'SFT: Array overflow');
  ensureVector(fampl, NF, 'FAMPL');
  ensureVector(phase, NF, 'PHASE');

  const omega = TWO_PI / (t[N] - t[0]);

  for (let k = 1; k <= NF; k += 1) {
    const rk = k;

    for (let i = 1; i <= N; i += 1) {
      const tk = omega * rk * t[i - 1];
      sint[i - 1] = Math.sin(tk);
      cost[i - 1] = Math.cos(tk);
    }

    sint[N] = sint[0];
    cost[N] = cost[0];

    let ssum = 0.0;
    let csum = 0.0;
    for (let io = 1; io <= N; io += 1) {
      const ip = io + 1;
      const dt = t[ip - 1] - t[io - 1];
      ssum += 0.5 * (sint[io - 1] * y[io - 1] + sint[ip - 1] * y[ip - 1]) * dt;
      csum += 0.5 * (cost[io - 1] * y[io - 1] + cost[ip - 1] * y[ip - 1]) * dt;
    }

    fampl[k - 1] = (Math.sqrt(ssum ** 2 + csum ** 2) * omega) / PI;
    phase[k - 1] = Math.atan2(ssum, csum);
  }

  return { FAMPL: fampl, PHASE: phase };
}

function DBFOOT(
  NBLDS,
  II,
  XI,
  DXI,
  AOC,
  CH,
  GAM,
  ADV,
  RAD,
  VEL,
  VSO,
  RHO,
  GALT,
  DCLIMB,
  UNITL,
  NT,
  NXDIM,
  NYDIM,
  NX,
  NY,
  X,
  Y,
  D,
) {
  const x = ensureMatrix(X, NX, NY, 'X');
  const y = ensureMatrix(Y, NX, NY, 'Y');
  const d = D ?? createMatrix(NX, NY);
  const dtr = Math.atan(1.0) / 45.0;
  const cosc = Math.cos(DCLIMB * dtr);
  const sinc = Math.sin(DCLIMB * dtr);

  void NXDIM;
  void NYDIM;
  ensureMatrix(d, NX, NY, 'D');

  const dely = Math.abs(y[0][NY - 1] - y[0][0]);
  let j0 = 1;
  for (; j0 <= NY; j0 += 1) {
    if (y[0][j0 - 1] > -0.0001 * dely) {
      break;
    }
  }
  if (j0 > NY) {
    j0 = 1;
  }

  for (let i = 1; i <= NX; i += 1) {
    for (let j = j0; j <= NY; j += 1) {
      const xg = x[i - 1][j - 1] / UNITL;
      const yg = y[i - 1][j - 1] / UNITL;
      const zg = -GALT / UNITL;

      const xobs = cosc * xg + sinc * zg;
      const yobs = yg;
      const zobs = -sinc * xg + cosc * zg;

      const trace = PTRACE(
        xobs,
        yobs,
        zobs,
        NBLDS,
        II,
        XI,
        DXI,
        AOC,
        CH,
        GAM,
        ADV,
        RAD,
        VEL,
        VSO,
        RHO,
        NT,
        NT,
        undefined,
        undefined,
      );
      const pres = sumPressureComponents(trace.PRES, NT);
      const prms = rmsPressure(pres, trace.TIME, NT);

      d[i - 1][j - 1] = 20.0 * log10(prms / MICRO_PASCAL_REFERENCE);
    }

    for (let j = 1; j <= j0 - 1; j += 1) {
      const jpos = 2 * j0 - j - 1 + (NY % 2);
      d[i - 1][j - 1] = d[i - 1][jpos - 1];
    }
  }

  return d;
}

function PTITLE(XLAB, YLAB, SH, XYZOBS, ULNAM, state = {}) {
  const mach = state.VSO !== undefined ? state.VEL / state.VSO : Number.NaN;
  const mtip =
    state.ADV !== undefined && state.VSO !== undefined
      ? mach * Math.sqrt(1.0 + 1.0 / state.ADV ** 2)
      : Number.NaN;
  const coefp =
    state.PTOT !== undefined && state.ADV !== undefined
      ? state.PTOT * 0.25 * (PI * state.ADV) ** 3
      : Number.NaN;

  return {
    XLAB,
    YLAB,
    SH,
    XYZOBS: copyVector(XYZOBS, 3),
    ULNAM,
    MACH: mach,
    MTIP: mtip,
    COEFP: coefp,
    ADV: state.ADV,
    NAME: state.NAME ?? '',
  };
}

function CTITLE(XLAB, YLAB, SH, GALT, DCLIMB, ULNAM, state = {}) {
  const mach = state.VSO !== undefined ? state.VEL / state.VSO : Number.NaN;
  const mtip =
    state.ADV !== undefined && state.VSO !== undefined
      ? mach * Math.sqrt(1.0 + 1.0 / state.ADV ** 2)
      : Number.NaN;
  const coefp =
    state.PTOT !== undefined && state.ADV !== undefined
      ? state.PTOT * 0.25 * (PI * state.ADV) ** 3
      : Number.NaN;

  return {
    XLAB,
    YLAB,
    SH,
    GALT,
    DCLIMB,
    ULNAM,
    MACH: mach,
    MTIP: mtip,
    COEFP: coefp,
    ADV: state.ADV,
    NAME: state.NAME ?? '',
  };
}

function PTPLOT(NTMAX, NT, PCOMP, PRES, TIME, PLAR, SH, AOC0, LGRID) {
  const pcomp = ensureMatrix(PCOMP, NT + 1, 3, 'PCOMP');
  const pres = ensureVector(PRES, NT + 1, 'PRES');
  const time = ensureVector(TIME, NT + 1, 'TIME');

  void NTMAX;
  const twt = 1.0 / time[NT];
  const pfac = SCALIT(NT, pres, 0.0);
  const pwt = 0.5 * PLAR * pfac;
  const pann = 1.0 / pfac;

  const series = [
    {
      name: 'Total',
      color: 'default',
      points: Array.from({ length: NT + 1 }, (_, it) => ({
        x: time[it] * twt,
        y: pres[it] * pwt,
      })),
    },
    {
      name: 'loading, far field',
      color: 'cyan',
      points: Array.from({ length: NT + 1 }, (_, it) => ({
        x: time[it] * twt,
        y: pcomp[it][0] * pwt,
      })),
    },
    {
      name: 'loading, near field',
      color: 'green',
      points: Array.from({ length: NT + 1 }, (_, it) => ({
        x: time[it] * twt,
        y: pcomp[it][1] * pwt,
      })),
    },
    {
      name: 'thickness',
      color: 'red',
      points: Array.from({ length: NT + 1 }, (_, it) => ({
        x: time[it] * twt,
        y: pcomp[it][2] * pwt,
      })),
      AOC0,
    },
  ];

  return {
    PLAR,
    SH,
    LGRID,
    axes: {
      x: { label: 't/t_blade_pass', scale: twt, min: 0.0, max: 1.0 },
      y: { label: 'p (Pa)', scale: pwt, annotationScale: pann, min: -0.5 * PLAR, max: 0.5 * PLAR },
    },
    series,
  };
}

function DBSPLT(NHARM, DHARM, DECIB, PLAR, SH, LGRID) {
  const decib = ensureVector(DECIB, NHARM + 1, 'DECIB');
  const dbmax = 20.0 * trunc(decib[0] / 20.0 + 0.999);
  const dbmin = dbmax - 60.0;
  const deldb = 10.0;
  const ysf = PLAR / (dbmax - dbmin);

  let grid = null;
  if (LGRID) {
    const nxg = trunc(NHARM / trunc(DHARM + 0.01));
    const nyg = trunc((dbmax - dbmin) / (0.5 * deldb) + 0.01);
    grid = {
      NXG: nxg,
      NYG: nyg,
      DXG: 1.0 / nxg,
      DYG: 0.5 * deldb * ysf,
    };
  }

  return {
    PLAR,
    SH,
    LGRID,
    axes: {
      x: { label: 'Harmonics of blade-passing frequency', step: DHARM / NHARM, max: 1.0 },
      y: { label: 'dB rel. to 20 microPa', min: dbmin, max: dbmax, scale: ysf, step: deldb },
    },
    total: { x: 0.0, y: decib[0] * ysf, value: decib[0] },
    harmonics: Array.from({ length: NHARM }, (_, k) => ({
      harmonic: k + 1,
      x: (k + 1) / NHARM,
      y: decib[k + 1] * ysf,
      value: decib[k + 1],
      visible: decib[k + 1] > dbmin,
    })),
    grid,
  };
}

function DBXPLT(
  NXDIM,
  NYDIM,
  NX,
  NY,
  X,
  Y,
  D,
  YTRACE,
  CSIZE,
  PAR,
  ULNAM,
  IDMINL,
  IDMAXL,
  IDINCR,
  IDLABL,
  LGRID,
  options = {},
) {
  const x = ensureMatrix(X, NX, NY, 'X');
  const y = ensureMatrix(Y, NX, NY, 'Y');
  const d = ensureMatrix(D, NX, NY, 'D');
  const ncolor = options.NCOLOR ?? DEFAULT_NCOLOR;

  void NXDIM;
  void NYDIM;
  void IDINCR;
  void IDLABL;

  let xmin = x[0][0];
  let xmax = x[0][0];
  let dmin = d[0][0];
  let dmax = d[0][0];
  for (let i = 0; i < NX; i += 1) {
    for (let j = 0; j < NY; j += 1) {
      xmin = Math.min(x[i][j], xmin);
      xmax = Math.max(x[i][j], xmax);
      dmin = Math.min(d[i][j], dmin);
      dmax = Math.max(d[i][j], dmax);
    }
  }

  dmin = Math.max(20.0, dmin);

  let xsf = SCALIT(1, xmax, xmin);
  let dsf = SCALIT(1, dmax, dmin);

  const xdel = 1.0 / (10.0 * xsf);
  xmin = xdel * (trunc(xmin / xdel + 1000.01) - 1000.0);
  xmax = xdel * (trunc(xmax / xdel + 1000.99) - 1000.0);
  xsf = 1.0 / (xmax - xmin);

  const ddel = 10.0;
  dmin = ddel * (trunc(dmin / ddel + 1000.01) - 1000.0);
  dmax = ddel * (trunc(dmax / ddel + 1000.99) - 1000.0);
  if (dmax - dmin < 20.0) {
    dmax = dmin + 20.0;
  }
  dsf = PAR / (dmax - dmin);

  const idmin = 10 * trunc(dmin / 10.0 - 0.01);
  const idmax = 10 * trunc(dmax / 10.0 + 0.99);
  const idmn = IDMINL === 999 ? idmin : IDMINL;
  const idmx = IDMAXL === 999 ? idmax : IDMAXL;
  const idRange = idmx === idmn ? 1.0 : idmx - idmn;

  let jBest = 0;
  let ymt = y[0][0] - YTRACE;
  for (let jt = 1; jt < NY; jt += 1) {
    if (Math.abs(y[0][jt] - YTRACE) < Math.abs(ymt)) {
      jBest = jt;
      ymt = y[0][jt] - YTRACE;
    }
  }

  const kk = 10;
  const segments = [];
  for (let i = 0; i < NX - 1; i += 1) {
    const x1 = x[i][jBest];
    const x2 = x[i + 1][jBest];
    const d1 = d[i][jBest];
    const d2 = d[i + 1][jBest];

    for (let k = 1; k <= kk; k += 1) {
      const xk = x1 + ((x2 - x1) * k) / kk;
      const dk = d1 + ((d2 - d1) * k) / kk;
      const dbavg = d1 + ((d2 - d1) * (k - 0.5)) / kk;
      let frac = (dbavg - idmn) / idRange;
      frac = clamp(frac, 0.0, 1.0);
      const icol = trunc(1 + (ncolor - 1) * frac);
      segments.push({
        x: (xk - xmin) * xsf,
        y: (dk - dmin) * dsf,
        db: dk,
        colorIndex: icol,
      });
    }
  }

  let grid = null;
  if (LGRID) {
    const xdelg = xdel;
    const ddelg = 0.5 * ddel;
    grid = {
      NXG: trunc((xmax - xmin) / xdelg + 0.01),
      NYG: trunc((dmax - dmin) / ddelg + 0.01),
      DXG: xdelg * xsf,
      DYG: ddelg * dsf,
    };
  }

  return {
    CSIZE,
    PAR,
    ULNAM,
    YTRACE,
    LGRID,
    chosenY: y[0][jBest],
    axes: {
      x: { min: xmin, max: xmax, step: xdel, scale: xsf, label: `x (${ULNAM})` },
      y: { min: dmin, max: dmax, step: ddel, scale: dsf, label: 'dB' },
    },
    grid,
    segments,
  };
}

function DBCPLT(
  NXDIM,
  NYDIM,
  NX,
  NY,
  X,
  Y,
  D,
  CSIZE,
  PAR,
  ULNAM,
  IDMINL,
  IDMAXL,
  IDINCR,
  IDLABL,
  LGRID,
  options = {},
) {
  const x = ensureMatrix(X, NX, NY, 'X');
  const y = ensureMatrix(Y, NX, NY, 'Y');
  const d = ensureMatrix(D, NX, NY, 'D');
  const ncolor = options.NCOLOR ?? DEFAULT_NCOLOR;
  const xac = [
    [0.0, -0.1, -0.6],
    [-0.03, -0.2, -0.65],
    [-0.3, -0.3, -0.7],
    [-0.7, -0.3, -0.7],
    [-0.3, -0.3, -0.7],
    [-0.03, -0.2, -0.65],
    [0.0, -0.1, -0.6],
  ];
  const yac = [
    [0.0, 0.0, 0.0],
    [0.05, 0.5, 0.2],
    [0.05, 0.5, 0.2],
    [0.0, 0.0, 0.0],
    [-0.05, -0.5, -0.2],
    [-0.05, -0.5, -0.2],
    [0.0, 0.0, 0.0],
  ];
  const sac = 0.05;

  void NXDIM;
  void NYDIM;

  let xmin = x[0][0];
  let xmax = x[0][0];
  let ymin = y[0][0];
  let ymax = y[0][0];
  let dmin = d[0][0];
  let dmax = d[0][0];
  for (let i = 0; i < NX; i += 1) {
    for (let j = 0; j < NY; j += 1) {
      xmin = Math.min(x[i][j], xmin);
      xmax = Math.max(x[i][j], xmax);
      ymin = Math.min(y[i][j], ymin);
      ymax = Math.max(y[i][j], ymax);
      dmin = Math.min(d[i][j], dmin);
      dmax = Math.max(d[i][j], dmax);
    }
  }

  let xsf = SCALIT(1, xmax, xmin);
  let ysf = SCALIT(1, ymax, ymin);
  void SCALIT(1, dmax, dmin);

  let gsf = Math.min(xsf, ysf / PAR);
  const gdel0 = 1.0 / (10.0 * gsf);
  xmin = gdel0 * (trunc(xmin / gdel0 + 1000.01) - 1000.0);
  xmax = gdel0 * (trunc(xmax / gdel0 + 1000.99) - 1000.0);
  ymin = gdel0 * (trunc(ymin / gdel0 + 1000.01) - 1000.0);
  ymax = gdel0 * (trunc(ymax / gdel0 + 1000.99) - 1000.0);

  gsf = 1.0 / Math.max(xmax - xmin, (ymax - ymin) / PAR);
  const xoff = xmin;
  const yoff = ymin;

  const ddel = 10.0;
  dmin = ddel * (trunc(dmin / ddel + 1000.01) - 1000.0);
  dmax = ddel * (trunc(dmax / ddel + 1000.99) - 1000.0);

  const parOut = (ymax - ymin) * gsf;
  const idmin = 10 * trunc(dmin / 10.0 - 0.01);
  const idmax = 10 * trunc(dmax / 10.0 + 0.99);
  const idmn = IDMINL === 999 ? idmin : IDMINL;
  const idmx = IDMAXL === 999 ? idmax : IDMAXL;
  const idRange = idmx === idmn ? 1.0 : idmx - idmn;

  const contours = [];
  for (let id = 0; id <= idmax; id += IDINCR) {
    if (id < idmin) {
      continue;
    }

    let frac = (id - idmn) / idRange;
    frac = clamp(frac, 0.0, 1.0);
    const icol = trunc(1 + (ncolor - 1) * frac);
    const labnum = id % IDLABL === 0;
    contours.push({
      level: id,
      colorIndex: icol,
      emphasized: labnum,
      traced: false,
    });
  }

  let grid = null;
  if (LGRID) {
    const gdelg = gdel0;
    grid = {
      NXG: trunc((xmax - xmin) / gdelg + 0.01),
      NYG: trunc((ymax - ymin) / gdelg + 0.01),
      DXG: gdelg * gsf,
      DYG: gdelg * gsf,
    };
  }

  const airplane = [];
  for (let l = 0; l < 3; l += 1) {
    airplane.push(
      Array.from({ length: 6 }, (_, k) => ({
        x: sac * xac[k][l] - xoff * gsf,
        y: sac * yac[k][l] - yoff * gsf,
      })),
    );
  }

  return {
    CSIZE,
    PAR: parOut,
    ULNAM,
    LGRID,
    axes: {
      x: { min: xmin, max: xmax, step: gdel0, scale: gsf, label: `x (${ULNAM})` },
      y: { min: ymin, max: ymax, step: gdel0, scale: gsf, label: 'y' },
    },
    levels: { min: idmin, max: idmax, step: IDINCR },
    contours,
    grid,
    airplane,
    xoff,
    yoff,
    raw: { X: x, Y: y, D: d },
  };
}

function NOISE(state = {}, options = {}) {
  const nt = options.NT ?? state.NT ?? 80;
  const nharm = Math.floor(nt / 2);
  const unitL = options.UNITL ?? state.UNITL ?? 3.28084;
  const xyzObs = options.XYZOBS ?? state.XYZOBS ?? [0.0, 0.0, -100.0];
  const ii = options.II ?? state.II;
  const xi = options.XI ?? state.XI;
  const dxi = options.DXI ?? state.DXI;
  const ch = options.CH ?? state.CH;
  const gam = options.GAM ?? state.GAM;
  const nblades = options.NBLDS ?? state.NBLDS;
  const adv = options.ADV ?? state.ADV;
  const rad = options.RAD ?? state.RAD;
  const vel = options.VEL ?? state.VEL;
  const vso = options.VSO ?? state.VSO;
  const rho = options.RHO ?? state.RHO;
  const mode = (options.mode ?? 'pressure').toLowerCase();

  assert(ii !== undefined, 'NOISE: II is required');
  assert(xi !== undefined, 'NOISE: XI is required');
  assert(dxi !== undefined, 'NOISE: DXI is required');
  assert(ch !== undefined, 'NOISE: CH is required');
  assert(gam !== undefined, 'NOISE: GAM is required');
  assert(nblades !== undefined, 'NOISE: NBLDS is required');
  assert(adv !== undefined, 'NOISE: ADV is required');
  assert(rad !== undefined, 'NOISE: RAD is required');
  assert(vel !== undefined, 'NOISE: VEL is required');
  assert(vso !== undefined, 'NOISE: VSO is required');
  assert(rho !== undefined, 'NOISE: RHO is required');

  let aoci;
  if (options.AOCI !== undefined) {
    aoci = ensureVector(options.AOCI, ii, 'AOCI');
  } else if (options.AOCProfile !== undefined) {
    const xa = ensureVector(options.AOCProfile.XA, options.AOCProfile.XA.length, 'XA');
    const aoc = ensureVector(options.AOCProfile.AOC, xa.length, 'AOC profile');
    const aocx = SPLINE(aoc, new Float64Array(xa.length), xa, xa.length);
    aoci = new Float64Array(ii);
    for (let i = 0; i < ii; i += 1) {
      aoci[i] = SEVAL(xi[i], aoc, aocx, xa, xa.length);
    }
  } else {
    const aoc0 = Math.max(0.0, options.AOC0 ?? state.AOC0 ?? 0.0);
    aoci = new Float64Array(ii);
    for (let i = 0; i < ii; i += 1) {
      aoci[i] = aoc0;
    }
  }

  if (mode === 'pressure' || mode === 'p') {
    const xobs = xyzObs[0] / unitL;
    const yobs = xyzObs[1] / unitL;
    const zobs = xyzObs[2] / unitL;
    const trace = PTRACE(
      xobs,
      yobs,
      zobs,
      nblades,
      ii,
      xi,
      dxi,
      aoci,
      ch,
      gam,
      adv,
      rad,
      vel,
      vso,
      rho,
      nt,
      nt,
      undefined,
      undefined,
    );
    const pres = sumPressureComponents(trace.PRES, nt);
    const prms = rmsPressure(pres, trace.TIME, nt);
    const spectrum = SFT(pres, trace.TIME, nt, undefined, undefined, nharm);
    const decib = new Float64Array(nharm + 1);

    for (let ih = 1; ih <= nharm; ih += 1) {
      decib[ih] =
        20.0 * log10((Math.sqrt(0.5) * spectrum.FAMPL[ih - 1]) / MICRO_PASCAL_REFERENCE);
    }
    decib[0] = 20.0 * log10(prms / MICRO_PASCAL_REFERENCE);

    return {
      mode: 'pressure',
      XYZOBS: copyVector(xyzObs, 3),
      UNITL: unitL,
      NT: nt,
      NHARM: nharm,
      AOCI: aoci,
      PCOMP: trace.PRES,
      PRES: pres,
      TIME: trace.TIME,
      PRMS: prms,
      FAMPL: spectrum.FAMPL,
      PHASE: spectrum.PHASE,
      DECIB: decib,
      warnings: trace.warnings,
    };
  }

  if (mode === 'foot' || mode === 'footprint') {
    const galt = options.GALT;
    const dclimb = options.DCLIMB ?? 0.0;
    assert(galt !== undefined, 'NOISE: GALT is required for footprint mode');

    let xdb;
    let ydb;
    let nx;
    let ny;

    if (options.XDB !== undefined && options.YDB !== undefined) {
      xdb = options.XDB;
      ydb = options.YDB;
      nx = options.NX ?? xdb.length;
      ny = options.NY ?? xdb[0].length;
    } else {
      const xlim = options.XLIM ?? [-2.0 * galt, 2.0 * galt];
      const ylim = options.YLIM ?? [-1.0 * galt, 1.0 * galt];
      const ndbsiz = options.NDBSIZ ?? [21, 11];
      const grid = buildFootprintGrid(galt, xlim, ylim, ndbsiz);
      xdb = grid.XDB;
      ydb = grid.YDB;
      nx = ndbsiz[0];
      ny = ndbsiz[1];
    }

    const adb = DBFOOT(
      nblades,
      ii,
      xi,
      dxi,
      aoci,
      ch,
      gam,
      adv,
      rad,
      vel,
      vso,
      rho,
      galt,
      dclimb,
      unitL,
      nt,
      nx,
      ny,
      nx,
      ny,
      xdb,
      ydb,
      undefined,
    );

    return {
      mode: 'footprint',
      NT: nt,
      AOCI: aoci,
      GALT: galt,
      DCLIMB: dclimb,
      XDB: xdb,
      YDB: ydb,
      ADB: adb,
    };
  }

  throw new Error(`NOISE: unsupported mode "${mode}"`);
}

module.exports = {
  NOISE,
  PTRACE,
  PTITLE,
  CTITLE,
  SFT,
  PSPLIN,
  PTRISO,
  DBFOOT,
  PTPLOT,
  DBSPLT,
  DBXPLT,
  DBCPLT,
  SPLINE,
  SEVAL,
  SCALIT,
  TRISOL,
};
