'use strict';

const xrotor = require('../../js/xrotor.js');
const xoper = require('../../js/xoper.js');
const xdesi = require('../../js/xdesi.js');
const { SPLINE } = require('../../js/spline.js');

function structuralState({ duct = false, structural = false, added = false, command = 'stload' } = {}) {
  const state = xrotor.createState();
  xrotor.SETDEF(state);
  Object.assign(state, { II: 4, RAD: 1.4, VEL: 45, RHO: 1.225, ADV: 0.7, RAKE: 0.05, DUCT: duct, LSTRUC: structural, URDUCT: 1.15 });
  for (let i = 0; i < state.II; i += 1) {
    state.XI[i] = 0.2 + 0.18 * (i + 1);
    for (const [field, value] of Object.entries({ DXI: 0.18, CH: 0.2, BETA: 0.5, BETA0: 0.5, CL: 0.6, CD: 0.02, CM: -0.05, UBODY: 0.01,
      EIXXB: 1.35e5, EIYYB: 1.72e5, EAB: 3.2e7, GJB: 8.5e4, EKB: 1.2e3, MB: 0.71, MXXB: 0.023, XOCG: 0.305, XOSC: 0.281, RSTB: 0.046 })) {
      state[field][i] = value;
    }
    state.VIND[0][i] = 0.08;
    state.VIND[2][i] = 0.03;
  }
  if (added) {
    state.NADD = 3;
    for (let i = 0; i < state.NADD; i += 1) {
      state.RADD[i] = 0.2 + 0.5 * i;
      state.UADD[i] = 0.02 + 0.03 * (i + 1);
      state.VADD[i] = -0.01 * (i + 1);
    }
    SPLINE(state.UADD, state.UADDR, state.RADD, state.NADD);
    SPLINE(state.VADD, state.VADDR, state.RADD, state.NADD);
  }
  if (command === 'coupled') {
    Object.assign(state, { NBLDS: 3, XI0: 0.2, XITIP: 1, XW0: 0.2, FREE: true, FAST: true, NITERA: 40, ADWFCTR: 1, LOPRINI: true });
    xrotor.SETX(state);
    for (let i = 0; i < state.II; i += 1) {
      state.BETA[i] = Math.atan2(state.ADV, state.XI[i]) + 0.07;
      state.BETA0[i] = state.BETA[i];
    }
    xrotor.XROTOR(state, { command: 'OPER', subcommand: 'ADVA', value: state.ADV });
  }
  return state;
}

function designState(niter = 40, { power = false, wind = false, duct = false, free = true, cl = wind ? -0.35 : 0.6, deff = 0 } = {}) {
  const state = xrotor.createState();
  xrotor.SETDEF(state);
  Object.assign(state, { II: 5, NBLDS: 3, FAST: true, FREE: free, DUCT: duct, WIND: wind, DEST: !power, DESP: power, NITERD: niter,
    RAD: 1.4, VEL: 45, ADV: 0.7, XI0: 0.2, XITIP: 1, XW0: 0.2, URDUCT: 1, ADWFCTR: 1 });
  const sign = wind ? -1 : 1;
  state.TDES = power ? 0 : sign * 180 / (state.RHO * state.VEL ** 2 * state.RAD ** 2);
  state.PDES = power ? sign * 9000 / (state.RHO * state.VEL ** 3 * state.RAD ** 2) : 0;
  xrotor.SETX(state);
  xoper.XWINIT(state);
  state.CL.fill(cl, 0, state.II);
  state.EFFINV = 1;
  if (free && !power) state.EFFINV = 0.5 * Math.sqrt(Math.abs(1 + state.TDES * 2 / xoper.PI)) + 0.5;
  if (free && power) state.EFFINV = 0.25 * Math.sqrt(Math.abs(1 + state.PDES * 4 / xoper.PI)) + 0.75;
  state.ADW = state.EFFINV * state.ADV;
  xdesi.DESINI(state);
  state.RMS = 123;
  state.RLX = 0.125;
  state.DEFF = deff;
  return state;
}

function operatingState(ii, mode, free) {
  const state = xrotor.createState();
  xrotor.SETDEF(state);
  Object.assign(state, {
    II: ii, IINF: ii + Math.trunc(ii / 2), XI0: 0.2, XITIP: 1,
    NBLDS: 3, RAD: 1.4, VEL: 45, ADV: 0.7, ADW: 0.75,
    FAST: mode === 'graded', VRTX: mode === 'vortex',
    DUCT: mode === 'duct', FREE: free, NITERA: 40, URDUCT: 1,
  });
  xrotor.SETX(state);
  for (let i = 0; i < ii; i += 1) {
    state.CH[i] = 0.2 - 0.08 * state.XI[i];
    state.BETA[i] = Math.atan2(state.ADV, state.XI[i]) + 0.07;
    state.BETA0[i] = state.BETA[i];
  }
  return state;
}

module.exports = { structuralState, designState, operatingState };
