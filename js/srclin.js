'use strict';

const { GAUSS } = require('./xutils.js');

const NMAX = 200;

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

function SRCLIN(NB, ZB, RB, SRC) {
  assert(NB <= NMAX, 'SRCLIN: Local array overflow. Increase NMAX.');
  const zb = ensureVector(ZB, NB, 'ZB');
  const rb = ensureVector(RB, NB, 'RB');
  const src = ensureVector(SRC, NB - 1, 'SRC');
  const pi = 4.0 * Math.atan(1.0);
  const n = NB - 1;
  const a = Array.from({ length: NMAX }, () => new Float64Array(NMAX));
  const r = Array.from({ length: NMAX }, () => new Float64Array(1));

  for (let i = 1; i <= n; i += 1) {
    const rc = 0.5 * (rb[i] + rb[i - 1]);
    const zc = 0.5 * (zb[i] + zb[i - 1]);
    const dr = rb[i] - rb[i - 1];
    const dz = zb[i] - zb[i - 1];

    for (let j = 1; j <= n; j += 1) {
      const rs = 0.5 * (rb[j] + rb[j - 1]);
      const zs = 0.5 * (zb[j] + zb[j - 1]);
      const rcs = Math.sqrt((zc - zs) ** 2 + rc ** 2);

      const u = (zc - zs) / rcs ** 3;
      const v = rc / rcs ** 3;
      a[i - 1][j - 1] = u * dr - v * dz;
      void rs;
    }

    src[i - 1] = -4.0 * pi * dr;
    r[i - 1][0] = src[i - 1];
  }

  GAUSS(NMAX, n, a, r, 1);

  for (let i = 1; i <= n; i += 1) {
    src[i - 1] = r[i - 1][0];
  }

  return src;
}

function SRCVEL(NB, ZB, SRC, Z, R) {
  const zb = ensureVector(ZB, NB, 'ZB');
  const src = ensureVector(SRC, NB - 1, 'SRC');
  const pi = 4.0 * Math.atan(1.0);
  const n = NB - 1;

  let usum = 0.0;
  let vsum = 0.0;
  for (let i = 1; i <= n; i += 1) {
    const zs = 0.5 * (zb[i] + zb[i - 1]);
    const rs = Math.sqrt((Z - zs) ** 2 + R ** 2);

    usum = usum + (src[i - 1] * (Z - zs)) / rs ** 3;
    vsum = vsum + (src[i - 1] * R) / rs ** 3;
  }

  const u = usum / (4.0 * pi);
  const v = vsum / (4.0 * pi);

  return { U: u, V: v };
}

module.exports = {
  SRCLIN,
  SRCVEL,
};
