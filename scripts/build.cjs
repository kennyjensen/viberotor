'use strict';

const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const exampleRotor = require('../ui/example-rotor.cjs');
const root = path.resolve(__dirname, '..');
const options = {
  absWorkingDir: root, entryPoints: ['ui/app.js', 'ui/solver.worker.js'],
  bundle: true, format: 'esm', platform: 'browser', outdir: 'dist', target: 'es2022',
  alias: { 'node:fs': path.join(root, 'ui/fs-browser.js') },
  plugins: [{
    name: 'xrotor-examples',
    setup(build) {
      build.onLoad({ filter: /\.(prop|newinput)$/ }, ({ path: file }) => ({
        contents: JSON.stringify(exampleRotor(fs.readFileSync(file, 'utf8'))),
        loader: 'json',
      }));
    },
  }],
  sourcemap: true, logLevel: 'info',
};
function assets() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'wasm/generated/manifest.json'), 'utf8'));
  for (const [file, expected] of Object.entries({ ...manifest.sources, 'wasm/generated/xrotor.wasm': manifest.wasmSha256 })) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
    if (actual !== expected) throw new Error('WASM sources changed (' + file + '). Run npm run build:wasm.');
  }
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist/index.html'), fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('./dist/app.js', './app.js').replace('./ui/styles.css', './styles.css'));
  fs.copyFileSync(path.join(root, 'ui/styles.css'), path.join(root, 'dist/styles.css'));
  fs.copyFileSync(path.join(root, 'favicon.ico'), path.join(root, 'dist/favicon.ico'));
  fs.cpSync(path.join(root, 'wasm/generated'), path.join(root, 'dist/generated'), { recursive: true });
  fs.copyFileSync(path.join(root, 'third_party/libf2c/Notice'), path.join(root, 'dist/generated/libf2c-Notice.txt'));
  fs.copyFileSync(path.join(root, 'wasm/COPYING'), path.join(root, 'dist/generated/XROTOR-COPYING.txt'));
}
if (require.main === module) esbuild.build({ ...options, minify: true }).then(assets).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { options, assets };
