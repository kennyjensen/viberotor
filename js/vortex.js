/*! SPDX-License-Identifier: GPL-2.0-or-later
 * Original Fortran copyright (C) 2011 Mark Drela. JavaScript port: 2026-03-10.
 */
'use strict';

const NTDIM = 5000;
const PI4 = 12.56637062;

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

function ensureTensor3(value, depth, rows, cols, name) {
  assert(Array.isArray(value), `${name}: expected an array of planes`);
  assert(value.length >= depth, `${name}: expected at least ${depth} planes`);
  for (let k = 0; k < depth; k += 1) {
    ensureMatrix(value[k], rows, cols, `${name}[${k}]`);
  }
  return value;
}

function allocateMatrix(rows, cols) {
  return Array.from({ length: rows }, () => new Float64Array(cols));
}

function allocateTensor3(depth, rows, cols) {
  return Array.from({ length: depth }, () => allocateMatrix(rows, cols));
}

function VORSEGVEL(A, B, UVW, UVW_A, UVW_B) {
  const a = ensureVector(A, 3, 'A');
  const b = ensureVector(B, 3, 'B');
  const uvw = UVW ?? new Float64Array(3);
  const uvwA = UVW_A ?? allocateMatrix(3, 3);
  const uvwB = UVW_B ?? allocateMatrix(3, 3);

  const axb = new Float64Array(3);
  const axbA = allocateMatrix(3, 3);
  const axbB = allocateMatrix(3, 3);

  const asq = a[0] ** 2 + a[1] ** 2 + a[2] ** 2;
  const bsq = b[0] ** 2 + b[1] ** 2 + b[2] ** 2;

  const amag = Math.sqrt(asq);
  const bmag = Math.sqrt(bsq);

  for (let k = 1; k <= 3; k += 1) {
    uvw[k - 1] = 0.0;
    for (let l = 1; l <= 3; l += 1) {
      uvwA[k - 1][l - 1] = 0.0;
      uvwB[k - 1][l - 1] = 0.0;
    }
  }

  if (amag * bmag !== 0.0) {
    axb[0] = a[1] * b[2] - a[2] * b[1];
    axb[1] = a[2] * b[0] - a[0] * b[2];
    axb[2] = a[0] * b[1] - a[1] * b[0];

    axbA[0][0] = 0.0;
    axbA[0][1] = b[2];
    axbA[0][2] = -b[1];
    axbA[1][0] = -b[2];
    axbA[1][1] = 0.0;
    axbA[1][2] = b[0];
    axbA[2][0] = b[1];
    axbA[2][1] = -b[0];
    axbA[2][2] = 0.0;

    axbB[0][0] = 0.0;
    axbB[0][1] = -a[2];
    axbB[0][2] = a[1];
    axbB[1][0] = a[2];
    axbB[1][1] = 0.0;
    axbB[1][2] = -a[0];
    axbB[2][0] = -a[1];
    axbB[2][1] = a[0];
    axbB[2][2] = 0.0;

    const adb = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

    const den = amag * bmag + adb;
    const denAsq = 0.5 * bmag / amag;
    const denBsq = 0.5 * amag / bmag;

    const t = (1.0 / amag + 1.0 / bmag) / den;

    const tAdb = -t / den;
    const tAsq = (-t / den) * denAsq - 0.5 / (den * amag * asq);
    const tBsq = (-t / den) * denBsq - 0.5 / (den * bmag * bsq);

    for (let k = 1; k <= 3; k += 1) {
      uvw[k - 1] = axb[k - 1] * t;

      for (let l = 1; l <= 3; l += 1) {
        uvwA[k - 1][l - 1] =
          axb[k - 1] * tAsq * a[l - 1] * 2.0 +
          axb[k - 1] * tAdb * b[l - 1] +
          axbA[k - 1][l - 1] * t;
        uvwB[k - 1][l - 1] =
          axb[k - 1] * tBsq * b[l - 1] * 2.0 +
          axb[k - 1] * tAdb * a[l - 1] +
          axbB[k - 1][l - 1] * t;
      }
    }
  }

  for (let k = 1; k <= 3; k += 1) {
    uvw[k - 1] = uvw[k - 1] / PI4;
    for (let l = 1; l <= 3; l += 1) {
      uvwA[k - 1][l - 1] = uvwA[k - 1][l - 1] / PI4;
      uvwB[k - 1][l - 1] = uvwB[k - 1][l - 1] / PI4;
    }
  }

  return { UVW: uvw, UVW_A: uvwA, UVW_B: uvwB };
}

function VRTXCO(IMAX, II, NBLDS, LDUCT, RAKE, XI, XV, GAM, ADW, VIND_GAM, VIND_ADW) {
  const xi = ensureVector(XI, IMAX, 'XI');
  const xv = ensureVector(XV, IMAX, 'XV');
  const gam = ensureVector(GAM, IMAX, 'GAM');
  const vindGam = VIND_GAM ?? allocateTensor3(3, IMAX, IMAX);
  const vindAdw = VIND_ADW ?? allocateMatrix(3, IMAX);

  ensureTensor3(vindGam, 3, IMAX, IMAX, 'VIND_GAM');
  ensureMatrix(vindAdw, 3, IMAX, 'VIND_ADW');

  const a = new Float64Array(3);
  const b = new Float64Array(3);
  const uvw = new Float64Array(3);
  const uvwA = allocateMatrix(3, 3);
  const uvwB = allocateMatrix(3, 3);
  const vsum = new Float64Array(3);
  const vadw = new Float64Array(3);
  const thetspc = new Float64Array(NTDIM);

  const blds = NBLDS;
  const pi = 4.0 * Math.atan(1.0);

  const xitip = xv[II];
  const tanrak = Math.tan(RAKE);

  for (let i = 1; i <= II; i += 1) {
    for (let j = 1; j <= II; j += 1) {
      vindGam[0][i - 1][j - 1] = 0.0;
      vindGam[1][i - 1][j - 1] = 0.0;
      vindGam[2][i - 1][j - 1] = 0.0;
    }
    vindAdw[0][i - 1] = 0.0;
    vindAdw[1][i - 1] = 0.0;
    vindAdw[2][i - 1] = 0.0;
  }

  const dth1 = pi / 60.0;
  const rad1 = 2.0;
  const thet1Lim = rad1 / ADW;
  const dth2 = pi / 20.0;
  const rad2 = 4.0;
  const thet2Lim = rad2 / ADW;
  const dth3 = pi / 8.0;
  const rad3 = 50.0;
  const thet3Lim = rad3 / ADW;

  const n1 = Math.trunc((2.0 * thet1Lim) / (dth2 + dth1));
  const n2 = Math.trunc((2.0 * (thet2Lim - thet1Lim)) / (dth3 + dth2));
  const ddth1 = (dth2 - dth1) / (n1 - 1);
  const ddth2 = (dth3 - dth2) / (n2 - 1);

  let thet = 0.0;
  let dth = dth1;
  let nthet = NTDIM;
  let spacingOverflow = true;
  for (let i = 1; i <= NTDIM; i += 1) {
    if (thet < thet1Lim) {
      thetspc[i - 1] = thet;
      thet = thet + dth;
      dth = dth + ddth1;
    } else if (thet < thet2Lim) {
      thetspc[i - 1] = thet;
      thet = thet + dth;
      dth = dth + ddth2;
    } else if (thet < thet3Lim) {
      thetspc[i - 1] = thet;
      dth = dth3;
      thet = thet + dth;
    } else {
      nthet = i - 1;
      spacingOverflow = false;
      break;
    }
  }

  if (LDUCT) {
    for (let i = 1; i <= II; i += 1) {
      for (let j = 1; j <= II; j += 1) {
        vindGam[0][i - 1][j - 1] = 0.0;
        vindGam[1][i - 1][j - 1] = 0.0;
        vindGam[2][i - 1][j - 1] = 0.0;
      }
      vindGam[2][i - 1][i - 1] = blds / (4.0 * pi * xi[i - 1]);
      vindAdw[2][i - 1] = 0.0;
      vindAdw[1][i - 1] = 0.0;
      vindGam[0][i - 1][i - 1] = (vindGam[2][i - 1][i - 1] * xi[i - 1]) / ADW;
      vindAdw[0][i - 1] = (-vindGam[0][i - 1][i - 1] * gam[i - 1]) / ADW;
    }
  } else {
    const dtbld = (2.0 * pi) / NBLDS;

    for (let i = 1; i <= II; i += 1) {
      const r0x = xi[i - 1] * tanrak;
      const r0y = xi[i - 1];
      const r0z = 0.0;

      vindAdw[0][i - 1] = 0.0;
      vindAdw[1][i - 1] = 0.0;
      vindAdw[2][i - 1] = 0.0;

      for (let j = 1; j <= II + 1; j += 1) {
        vsum[0] = 0.0;
        vsum[1] = 0.0;
        vsum[2] = 0.0;
        vadw[0] = 0.0;
        vadw[1] = 0.0;
        vadw[2] = 0.0;

        const rv = xv[j - 1];
        const xxv = rv * tanrak;

        let thetoff = 0.0;
        for (let n = 1; n <= NBLDS; n += 1) {
          let thet1 = thetspc[0];
          let r1x = xxv + thet1 * xitip * ADW;
          let r1y = rv * Math.cos(thet1 + thetoff);
          let r1z = rv * Math.sin(thet1 + thetoff);
          let r1Adw = thet1 * xitip;

          for (let l = 1; l <= nthet - 1; l += 1) {
            const thet2 = thetspc[l];
            const r2x = xxv + thet2 * xitip * ADW;
            const r2y = rv * Math.cos(thet2 + thetoff);
            const r2z = rv * Math.sin(thet2 + thetoff);
            const r2Adw = thet2 * xitip;

            a[0] = r1x - r0x;
            a[1] = r1y - r0y;
            a[2] = r1z - r0z;
            b[0] = r2x - r0x;
            b[1] = r2y - r0y;
            b[2] = r2z - r0z;
            VORSEGVEL(a, b, uvw, uvwA, uvwB);

            vsum[0] = vsum[0] + uvw[0];
            vsum[1] = vsum[1] + uvw[1];
            vsum[2] = vsum[2] + uvw[2];

            vadw[0] = vadw[0] + uvwA[0][0] * r1Adw + uvwB[0][0] * r2Adw;
            vadw[1] = vadw[1] + uvwA[1][0] * r1Adw + uvwB[1][0] * r2Adw;
            vadw[2] = vadw[2] + uvwA[2][0] * r1Adw + uvwB[2][0] * r2Adw;

            thet1 = thet2;
            r1x = r2x;
            r1y = r2y;
            r1z = r2z;
            r1Adw = r2Adw;
          }

          thetoff = thetoff + dtbld;
        }

        vsum[2] = -vsum[2];
        vadw[2] = -vadw[2];

        if (j <= II) {
          vindGam[0][i - 1][j - 1] = -vsum[0];
          vindGam[1][i - 1][j - 1] = -vsum[1];
          vindGam[2][i - 1][j - 1] = -vsum[2];
          vindAdw[0][i - 1] = vindAdw[0][i - 1] - vadw[0] * gam[j - 1];
          vindAdw[1][i - 1] = vindAdw[1][i - 1] - vadw[1] * gam[j - 1];
          vindAdw[2][i - 1] = vindAdw[2][i - 1] - vadw[2] * gam[j - 1];
        }
        if (j > 1) {
          vindGam[0][i - 1][j - 2] = vindGam[0][i - 1][j - 2] + vsum[0];
          vindGam[1][i - 1][j - 2] = vindGam[1][i - 1][j - 2] + vsum[1];
          vindGam[2][i - 1][j - 2] = vindGam[2][i - 1][j - 2] + vsum[2];
          vindAdw[0][i - 1] = vindAdw[0][i - 1] + vadw[0] * gam[j - 2];
          vindAdw[1][i - 1] = vindAdw[1][i - 1] + vadw[1] * gam[j - 2];
          vindAdw[2][i - 1] = vindAdw[2][i - 1] + vadw[2] * gam[j - 2];
        }
      }
    }
  }

  return {
    VIND_GAM: vindGam,
    VIND_ADW: vindAdw,
    NTHET: nthet,
    spacingOverflow,
  };
}

module.exports = {
  VRTXCO,
  VORSEGVEL,
};
