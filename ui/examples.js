import f1d from '../third_party/Xrotor/runs/prop/F1D.prop';
import ecruzer from '../third_party/Xrotor/runs/prop/ecruzer.prop';
import hydro from '../third_party/Xrotor/runs/prop/hydro.prop';
import fourBlade from '../third_party/Xrotor/runs/prop/prop4bld.newinput';
import ducted from '../third_party/Xrotor/runs/ducted/duct.prop';
import windmill from '../third_party/Xrotor/runs/windmill/wmill.prop';

export default Object.fromEntries([
  ['f1d', 'F1D propeller', f1d],
  ['ecruzer', 'EDICS Cruzer', ecruzer],
  ['hydro', 'Hydrofoil air prop', hydro],
  ['four-blade', 'FM 10-inch four-blade', fourBlade],
  ['ducted', 'Ducted rotor', ducted],
  ['windmill', 'Small windmill', windmill],
].map(([id, label, config]) => ['xrotor-' + id, { label, config }]));
