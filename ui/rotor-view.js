import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function bladeGeometry(stations, radius, hub) {
  const rows = [{ ...stations[0], r: hub }, ...stations, { ...stations.at(-1), r: 1 }];
  const positions = [];
  const indices = [];
  const segments = 20;
  // A symmetric display section; planform and pitch come from the rotor state.
  for (const row of rows) {
    const beta = row.pitch * Math.PI / 180;
    for (let side = 0; side < 2; side += 1) {
      for (let j = 0; j <= segments; j += 1) {
        const u = (1 - Math.cos(Math.PI * j / segments)) / 2;
        const chord = row.chord / radius;
        const thickness = 5 * 0.12 * chord * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u ** 2 + 0.2843 * u ** 3 - 0.1036 * u ** 4) * (side ? -1 : 1);
        const cx = (u - 0.25) * chord;
        positions.push(cx * Math.cos(beta) - thickness * Math.sin(beta), row.r, cx * Math.sin(beta) + thickness * Math.cos(beta));
      }
    }
  }
  const stride = 2 * (segments + 1);
  for (let i = 0; i < rows.length - 1; i += 1) {
    for (let side = 0; side < 2; side += 1) {
      for (let j = 0; j < segments; j += 1) {
        const a = i * stride + side * (segments + 1) + j;
        const b = a + stride;
        if (side) indices.push(a, a + 1, b, a + 1, b + 1, b);
        else indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function disposeGroup(group) {
  group.traverse(object => {
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach(m => m.dispose());
    else object.material?.dispose();
  });
  group.clear();
}

export class RotorView {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#111516');
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 2.4;
    this.controls.maxDistance = 12;
    this.controls.enablePan = true;
    this.scene.add(new THREE.HemisphereLight('#e3f3ec', '#3e514b', 2.3));
    const key = new THREE.DirectionalLight('#fff6e3', 3.5);
    key.position.set(2, 4, 5); this.scene.add(key);
    const rim = new THREE.DirectionalLight('#a1d8e8', 2);
    rim.position.set(-3, -1, 2); this.scene.add(rim);
    const grid = new THREE.GridHelper(5, 20, '#35443d', '#222e2a');
    grid.rotation.x = Math.PI / 2; grid.position.z = -0.3;
    this.scene.add(grid);
    const points = new THREE.EllipseCurve(0, 0, 1, 1, 0, 2 * Math.PI).getPoints(160);
    const disk = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color: '#60796a', dashSize: 0.035, gapSize: 0.025, transparent: true, opacity: 0.6 }));
    disk.position.z = -0.05; disk.computeLineDistances(); this.scene.add(disk);
    this.rotor = new THREE.Group(); this.scene.add(this.rotor);
    this.rotor.rotation.z = -0.12;
    this.spinning = false;
    this.wire = false;
    this.setView('iso');
    new ResizeObserver(() => this.resize()).observe(container);
    this.renderer.setAnimationLoop(time => {
      if (this.spinning && this.lastTime) this.rotor.rotation.z -= Math.min((time - this.lastTime) / 1000, 0.1) * 0.65;
      this.lastTime = time;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  update(config, stations) {
    disposeGroup(this.rotor);
    const geometry = bladeGeometry(stations, config.radius, config.hub);
    for (let i = 0; i < config.blades; i += 1) {
      const blade = new THREE.Mesh(geometry.clone(), new THREE.MeshStandardMaterial({ color: i === 0 ? '#b7dca9' : '#81bfa9', roughness: 0.37, metalness: 0.3, side: THREE.DoubleSide, wireframe: this.wire }));
      blade.rotation.z = i * 2 * Math.PI / config.blades;
      this.rotor.add(blade);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(blade.geometry, 30), new THREE.LineBasicMaterial({ color: '#d6ebc6', transparent: true, opacity: 0.28 }));
      blade.add(edges);
    }
    geometry.dispose();
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(config.hub, config.hub, 0.18, 48), new THREE.MeshStandardMaterial({ color: '#a7b3b4', metalness: 0.7, roughness: 0.3 }));
    hub.rotation.x = Math.PI / 2;
    this.rotor.add(hub);
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(config.hub * 0.95, config.hub * 1.5, 48), new THREE.MeshStandardMaterial({ color: '#c5cdca', metalness: 0.65, roughness: 0.35 }));
    spinner.rotation.x = Math.PI / 2; spinner.position.z = 0.08 + config.hub * 0.75;
    this.rotor.add(spinner);
    if (config.duct) {
      const duct = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.045, 12, 100), new THREE.MeshStandardMaterial({ color: '#718a85', metalness: 0.5, roughness: 0.4, transparent: true, opacity: 0.8 }));
      this.rotor.add(duct);
    }
    this.resize();
  }

  setView(view) {
    const positions = { iso: [2.3, 1.3, 5], front: [0, 0, 5.5], side: [5.5, 0, 0.001] };
    this.currentView = view;
    this.camera.position.set(...positions[view]);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }
  toggleWire() {
    this.wire = !this.wire;
    this.rotor.traverse(object => { if (object.isMesh) object.material.wireframe = this.wire; });
    return this.wire;
  }
  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.9 ? 43 : 32;
    this.camera.updateProjectionMatrix();
  }
}
