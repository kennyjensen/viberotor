'use strict';

const { SPLIND, SEVAL, DEVAL } = require('./spline.js');

const NWX = 100;

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

function keyOf(event) {
  if (!event) {
    return ' ';
  }
  const key = event.key ?? event.kchar ?? event.char ?? event.action ?? ' ';
  if (typeof key === 'number') {
    return String.fromCharCode(key);
  }
  const text = String(key);
  return text.length === 0 ? ' ' : text[0];
}

function SORT(NW, S, W) {
  let nw = Math.trunc(NW);
  ensureVector(S, nw, 'S');
  ensureVector(W, nw, 'W');

  let done = false;
  for (let ipass = 1; ipass <= 500; ipass += 1) {
    done = true;
    for (let n = 0; n < nw - 1; n += 1) {
      const np = n + 1;
      if (S[np] >= S[n]) {
        continue;
      }
      let temp = S[np];
      S[np] = S[n];
      S[n] = temp;
      temp = W[np];
      W[np] = W[n];
      W[n] = temp;
      done = false;
    }
    if (done) {
      break;
    }
  }

  if (!done) {
    throw new Error('SORT failed');
  }

  const nws = nw;
  for (let n = 0; n < nws; n += 1) {
    if (n >= nw - 1) {
      return nw;
    }
    if (S[n] !== S[n + 1]) {
      continue;
    }
    nw -= 2;
    for (let nt = n; nt < nw; nt += 1) {
      S[nt] = S[nt + 2];
      W[nt] = W[nt + 2];
    }
  }

  return nw;
}

function CRSMOD(
  N,
  X,
  Y,
  YP,
  XOFF,
  XSF,
  YOFF,
  YSF,
  SSIZ,
  NSPLT,
  LSLOPE,
  options = {},
) {
  const n = Math.trunc(N);
  ensureVector(X, n, 'X');
  ensureVector(Y, n, 'Y');
  ensureVector(YP, n, 'YP');

  const events = Array.isArray(options.events) ? options.events : [];
  const W1 = new Float64Array(NWX);
  const W2 = new Float64Array(NWX);
  const W3 = new Float64Array(NWX);
  const symbols = [];
  const previewCurve = [];
  let eventIndex = 0;
  let imod1 = 1;
  let imod2 = 0;
  let aborted = false;
  let replotCount = 0;

  function xmod(xarg) {
    return XSF * (xarg - XOFF);
  }

  function ymod(yarg) {
    return YSF * (yarg - YOFF);
  }

  function nextEvent() {
    if (eventIndex >= events.length) {
      throw new Error('CRSMOD: insufficient cursor events');
    }
    const event = events[eventIndex];
    eventIndex += 1;
    return event;
  }

  function takePoint() {
    while (true) {
      const event = nextEvent();
      const key = keyOf(event);
      if ('Qq'.includes(key)) {
        aborted = true;
        return null;
      }
      if ('Zz'.includes(key)) {
        replotCount += 1;
        continue;
      }
      if ('Uu'.includes(key)) {
        replotCount += 1;
        continue;
      }
      return event;
    }
  }

  const first = takePoint();
  if (!first) {
    return {
      IMOD1: imod1,
      IMOD2: imod2,
      aborted,
      modified: false,
      replotCount,
      KK: 0,
      symbols,
      previewCurve,
    };
  }

  W1[0] = first.x / XSF + XOFF;
  W2[0] = first.y / YSF + YOFF;
  if (W1[0] < X[0]) {
    W1[0] = X[0];
  }
  if (W1[0] > X[n - 1]) {
    W1[0] = X[n - 1];
  }
  if (LSLOPE) {
    W2[0] = SEVAL(W1[0], Y, YP, X, n);
  }
  symbols.push({ x: xmod(W1[0]), y: ymod(W2[0]), kind: 'circle', size: SSIZ });

  let kk = 1;
  for (let k = 2; k <= NWX; k += 1) {
    const event = takePoint();
    if (!event) {
      return {
        IMOD1: imod1,
        IMOD2: imod2,
        aborted,
        modified: false,
        replotCount,
        KK: kk,
        symbols,
        previewCurve,
      };
    }

    symbols.push({ x: event.x, y: event.y, kind: 'plus', size: SSIZ });
    W1[k - 1] = event.x / XSF + XOFF;
    W2[k - 1] = event.y / YSF + YOFF;
    kk = k;

    if (k >= 3 && W1[k - 1] === W1[k - 2] && W1[k - 1] === W1[k - 3]) {
      break;
    }
  }

  if (LSLOPE) {
    if (W1[kk - 1] < X[0]) {
      W1[kk - 1] = X[0];
    }
    if (W1[kk - 1] > X[n - 1]) {
      W1[kk - 1] = X[n - 1];
    }
    W2[kk - 1] = SEVAL(W1[kk - 1], Y, YP, X, n);
    symbols.push({ x: xmod(W1[kk - 1]), y: ymod(W2[kk - 1]), kind: 'circle', size: SSIZ });
  }

  kk = SORT(kk, W1, W2);
  if (kk < 2) {
    return {
      IMOD1: imod1,
      IMOD2: imod2,
      aborted,
      modified: false,
      replotCount,
      KK: kk,
      symbols,
      previewCurve,
      reason: 'Need at least 2 points',
    };
  }

  let yp1 = -999.0;
  let yp2 = -999.0;
  const lslop1 = LSLOPE && W1[0] >= X[0] && W1[0] <= X[n - 1];
  const lslop2 = LSLOPE && W1[kk - 1] >= X[0] && W1[kk - 1] <= X[n - 1];
  if (lslop1) {
    yp1 = DEVAL(W1[0], Y, YP, X, n);
  }
  if (lslop2) {
    yp2 = DEVAL(W1[kk - 1], Y, YP, X, n);
  }

  const dx = (X[n - 1] - X[0]) / Number(n - 1);
  const dw1 = (W1[kk - 1] - W1[0]) / Number(kk - 1);
  const nt = Math.trunc(10.0 * Math.max(dw1 / dx, 1.0));

  let k = 1;
  while (true) {
    k += 1;
    if (k > kk) {
      break;
    }
    if (W1[k - 1] !== W1[k - 2]) {
      continue;
    }
    for (let kt = k - 1; kt < kk - 1; kt += 1) {
      W1[kt] = W1[kt + 1];
      W2[kt] = W2[kt + 1];
      W3[kt] = W3[kt + 1];
    }
    kk -= 1;
    k -= 1;
  }

  if (kk < 2) {
    return {
      IMOD1: imod1,
      IMOD2: imod2,
      aborted,
      modified: false,
      replotCount,
      KK: kk,
      symbols,
      previewCurve,
      reason: 'Corrupted input detected',
    };
  }

  SPLIND(W2, W3, W1, kk, yp1, yp2);

  for (let segment = 2; segment <= kk; segment += 1) {
    const localDx = W1[segment - 1] - W1[segment - 2];
    let xplt = W1[segment - 2];
    let yplt = W2[segment - 2];
    previewCurve.push({ x: xmod(xplt), y: ymod(yplt) });
    for (let it = 1; it <= NSPLT; it += 1) {
      xplt = W1[segment - 2] + (localDx * it) / Number(NSPLT);
      yplt = SEVAL(xplt, W2, W3, W1, kk);
      previewCurve.push({ x: xmod(xplt), y: ymod(yplt) });
    }
  }

  for (let i = 0; i < n; i += 1) {
    if (X[i] < W1[0]) {
      imod1 = i + 2;
    } else if (X[i] <= W1[kk - 1]) {
      Y[i] = SEVAL(X[i], W2, W3, W1, kk);
      imod2 = i + 1;
    } else {
      break;
    }
  }

  return {
    IMOD1: imod1,
    IMOD2: imod2,
    aborted,
    modified: imod2 >= imod1,
    replotCount,
    KK: kk,
    NT: nt,
    symbols,
    previewCurve,
    W1: W1.slice(0, kk),
    W2: W2.slice(0, kk),
    W3: W3.slice(0, kk),
  };
}

module.exports = {
  CRSMOD,
  SORT,
};
