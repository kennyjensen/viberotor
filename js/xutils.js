'use strict';

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

function SETEXP(S, SMAX, NN) {
  const s = ensureVector(S, NN, 'S');
  const ds1 = s[1] - s[0];
  const sigma = (SMAX - s[0]) / ds1;
  const nex = NN - 1;
  const rnex = nex;
  const rni = 1.0 / rnex;

  const aaa = (rnex * (rnex - 1.0) * (rnex - 2.0)) / 6.0;
  const bbb = (rnex * (rnex - 1.0)) / 2.0;
  const ccc = rnex - sigma;

  let disc = bbb ** 2 - 4.0 * aaa * ccc;
  disc = Math.max(0.0, disc);

  let ratio;
  if (nex <= 1) {
    throw new Error('SETEXP: Cannot fill array. N too small.');
  } else if (nex === 2) {
    ratio = -ccc / bbb + 1.0;
  } else {
    ratio = (-bbb + Math.sqrt(disc)) / (2.0 * aaa) + 1.0;
  }

  if (ratio !== 1.0) {
    for (let iter = 1; iter <= 100; iter += 1) {
      const sigman = (ratio ** nex - 1.0) / (ratio - 1.0);
      const res = sigman ** rni - sigma ** rni;
      const dresdr =
        rni *
        sigman ** rni *
        ((rnex * ratio ** (nex - 1) - sigman) / (ratio ** nex - 1.0));

      const dratio = -res / dresdr;
      ratio = ratio + dratio;

      if (Math.abs(dratio) < 1.0e-5) {
        break;
      }
    }
  }

  let ds = ds1;
  for (let n = 2; n <= NN; n += 1) {
    s[n - 1] = s[n - 2] + ds;
    ds = ds * ratio;
  }

  return s;
}

function GAUSS(NSIZ, NN, Z, R, NRHS) {
  const z = ensureMatrix(Z, NSIZ, NSIZ, 'Z');
  const r = ensureMatrix(R, NSIZ, NRHS, 'R');

  for (let np = 1; np <= NN - 1; np += 1) {
    const np1 = np + 1;

    let nx = np;
    for (let n = np1; n <= NN; n += 1) {
      if (Math.abs(z[n - 1][np - 1]) > Math.abs(z[nx - 1][np - 1])) {
        nx = n;
      }
    }

    const pivot = 1.0 / z[nx - 1][np - 1];
    z[nx - 1][np - 1] = z[np - 1][np - 1];

    for (let l = np1; l <= NN; l += 1) {
      const temp = z[nx - 1][l - 1] * pivot;
      z[nx - 1][l - 1] = z[np - 1][l - 1];
      z[np - 1][l - 1] = temp;
    }

    for (let l = 1; l <= NRHS; l += 1) {
      const temp = r[nx - 1][l - 1] * pivot;
      r[nx - 1][l - 1] = r[np - 1][l - 1];
      r[np - 1][l - 1] = temp;
    }

    for (let k = np1; k <= NN; k += 1) {
      const ztmp = z[k - 1][np - 1];

      for (let l = np1; l <= NN; l += 1) {
        z[k - 1][l - 1] = z[k - 1][l - 1] - ztmp * z[np - 1][l - 1];
      }
      for (let l = 1; l <= NRHS; l += 1) {
        r[k - 1][l - 1] = r[k - 1][l - 1] - ztmp * r[np - 1][l - 1];
      }
    }
  }

  for (let l = 1; l <= NRHS; l += 1) {
    r[NN - 1][l - 1] = r[NN - 1][l - 1] / z[NN - 1][NN - 1];
  }

  for (let np = NN - 1; np >= 1; np -= 1) {
    const np1 = np + 1;
    for (let l = 1; l <= NRHS; l += 1) {
      for (let k = np1; k <= NN; k += 1) {
        r[np - 1][l - 1] = r[np - 1][l - 1] - z[np - 1][k - 1] * r[k - 1][l - 1];
      }
    }
  }

  return { Z: z, R: r };
}

function LUDCMP(NSIZ, N, A, INDX) {
  assert(N <= 250, 'LUDCMP: array overflow, increase VV size');
  const a = ensureMatrix(A, NSIZ, NSIZ, 'A');
  const indx = ensureVector(INDX, NSIZ, 'INDX');
  const vv = new Float64Array(250);

  for (let i = 1; i <= N; i += 1) {
    let aamax = 0.0;
    for (let j = 1; j <= N; j += 1) {
      aamax = Math.max(Math.abs(a[i - 1][j - 1]), aamax);
    }
    vv[i - 1] = 1.0 / aamax;
  }

  for (let j = 1; j <= N; j += 1) {
    for (let i = 1; i <= j - 1; i += 1) {
      let sum = a[i - 1][j - 1];
      for (let k = 1; k <= i - 1; k += 1) {
        sum = sum - a[i - 1][k - 1] * a[k - 1][j - 1];
      }
      a[i - 1][j - 1] = sum;
    }

    let aamax = 0.0;
    let imax = j;
    for (let i = j; i <= N; i += 1) {
      let sum = a[i - 1][j - 1];
      for (let k = 1; k <= j - 1; k += 1) {
        sum = sum - a[i - 1][k - 1] * a[k - 1][j - 1];
      }
      a[i - 1][j - 1] = sum;

      const dum = vv[i - 1] * Math.abs(sum);
      if (dum >= aamax) {
        imax = i;
        aamax = dum;
      }
    }

    if (j !== imax) {
      for (let k = 1; k <= N; k += 1) {
        const dum = a[imax - 1][k - 1];
        a[imax - 1][k - 1] = a[j - 1][k - 1];
        a[j - 1][k - 1] = dum;
      }
      vv[imax - 1] = vv[j - 1];
    }

    indx[j - 1] = imax;
    if (j !== N) {
      const dum = 1.0 / a[j - 1][j - 1];
      for (let i = j + 1; i <= N; i += 1) {
        a[i - 1][j - 1] = a[i - 1][j - 1] * dum;
      }
    }
  }

  return { A: a, INDX: indx };
}

function BAKSUB(NSIZ, N, A, INDX, B) {
  const a = ensureMatrix(A, NSIZ, NSIZ, 'A');
  const indx = ensureVector(INDX, NSIZ, 'INDX');
  const b = ensureVector(B, NSIZ, 'B');

  let ii = 0;
  for (let i = 1; i <= N; i += 1) {
    const ll = Math.trunc(indx[i - 1]);
    let sum = b[ll - 1];
    b[ll - 1] = b[i - 1];
    if (ii !== 0) {
      for (let j = ii; j <= i - 1; j += 1) {
        sum = sum - a[i - 1][j - 1] * b[j - 1];
      }
    } else if (sum !== 0.0) {
      ii = i;
    }
    b[i - 1] = sum;
  }

  for (let i = N; i >= 1; i -= 1) {
    let sum = b[i - 1];
    if (i < N) {
      for (let j = i + 1; j <= N; j += 1) {
        sum = sum - a[i - 1][j - 1] * b[j - 1];
      }
    }
    b[i - 1] = sum / a[i - 1][i - 1];
  }

  return b;
}

module.exports = {
  SETEXP,
  GAUSS,
  LUDCMP,
  BAKSUB,
};
