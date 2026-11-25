'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const esbuild = require('esbuild');
const { options, assets } = require('../../scripts/build.cjs');
const solver = require('../../ui/solver.cjs');
const root = path.resolve(__dirname, '../../dist');
const artifacts = path.resolve(__dirname, '../../test-results');

async function canvasPixels(page) {
  return page.locator('#rotorScene canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2');
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let bright = 0;
    const colors = new Set();
    for (let i = 0; i < pixels.length; i += 16) {
      colors.add(pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2]);
      if (pixels[i] > 85 && pixels[i + 1] > 100 && pixels[i + 2] > 70) bright += 1;
    }
    return { bright, colors: colors.size, width: canvas.width, height: canvas.height };
  });
}
async function assertLayout(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Page must not overflow horizontally');
  const overlaps = await page.locator('.metric strong').evaluateAll(nodes => nodes.filter(node => {
    if (!node.checkVisibility()) return false;
    return node.getBoundingClientRect().right > node.parentElement.getBoundingClientRect().right + 1;
  }).length);
  assert.equal(overlaps, 0, 'Metric values must fit');
  const layout = await page.locator('.related-apps').evaluate(nav => {
    const header = document.querySelector('.app-header').getBoundingClientRect();
    const brand = document.querySelector('.brand h1').parentElement.getBoundingClientRect();
    const star = document.querySelector('.github-star--desktop').getBoundingClientRect();
    const grid = nav.getBoundingClientRect();
    const tiles = [...nav.querySelectorAll('a')].map(link => {
      const tile = link.getBoundingClientRect();
      return {
        top: tile.top,
        left: tile.left,
        square: tile.width > 0 && tile.width === tile.height,
      };
    });
    return {
      tiles,
      fits: brand.right <= grid.left && grid.right <= (star.width ? star.left : header.right) &&
        grid.top >= header.top && grid.bottom <= header.bottom,
      centerDifference: Math.abs((grid.top + grid.bottom - brand.top - brand.bottom) / 2),
      heightDifference: Math.abs(grid.height - brand.height),
    };
  });
  const { tiles } = layout;
  assert.ok(layout.fits, 'Tool grid must fit between the title and the Star button or header edge');
  assert.ok(layout.centerDifference <= 1 && layout.heightDifference <= 7, 'Tool grid should align with the title stack');
  assert.ok(tiles.every(tile => tile.square), 'Tool tiles must be square');
  assert.deepEqual(tiles.map(tile => tile.top === tiles[0].top), [true, true, true, false, false]);
  assert.equal(tiles[3].top, tiles[4].top, 'The last two tiles must share a row');
  assert.deepEqual(tiles.slice(3).map(tile => tile.left), tiles.slice(0, 2).map(tile => tile.left));
}

async function main() {
  await esbuild.build({ ...options, minify: true });
  assets();
  await fs.mkdir(artifacts, { recursive: true });
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const filename = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    try {
      const body = await fs.readFile(filename);
      res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css' }[path.extname(filename)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || undefined,
      headless: true,
      args: ['--no-sandbox', '--use-gl=angle', '--use-angle=' + (process.env.CHROMIUM_ANGLE || 'swiftshader'), '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    // Keep the layout and fallback tests independent of the external widget and API.
    await page.route('https://buttons.github.io/buttons.js', route => route.fulfill({ body: '' }));
    page.setDefaultTimeout(15000);
    const errors = [];
    const wasmResponses = [];
    page.on('response', response => { if (response.url().endsWith('/xrotor.wasm')) wasmResponses.push(response.status()); });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('404')) errors.push(msg.text()); });
    const url = 'http://127.0.0.1:' + server.address().port;
    await page.goto(url);
    const desktopStar = page.locator('.app-header .github-star--desktop');
    const mobileStar = page.locator('.setup .github-star--mobile');
    await expect(desktopStar).toBeVisible();
    await expect(mobileStar).toBeHidden();
    for (const placement of [desktopStar, mobileStar]) {
      const button = placement.getByRole('link', { name: 'Star kennyjensen/viberotor on GitHub', includeHidden: true });
      await expect(button).toHaveAttribute('href', 'https://github.com/kennyjensen/viberotor');
      await expect(button).toHaveAttribute('data-size', 'large');
      await expect(button).toHaveAttribute('data-show-count', 'true');
    }
    await expect(page.locator('.setup #openFile')).toBeVisible();
    await expect(page.locator('.setup #saveFile')).toBeVisible();
    const tools = page.getByRole('navigation', { name: 'Related tools' });
    for (const [name, href] of [
      ['Vibefoil', 'https://www.vibefoil.com/'],
      ['VibeLattice', 'https://avl.vibefoil.com/'],
      ['VibeSim', 'https://sim.vibefoil.com/'],
      ['Alula', 'https://alula.vibefoil.com/'],
      ['OpenSwing', 'https://openswing.vibefoil.com/'],
    ]) {
      const link = tools.getByRole('link', { name, exact: true });
      await expect(link).toHaveAttribute('href', href);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('title', name);
    }
    await expect(page.locator('.brand-sub')).toHaveText('An interactive propeller designer based on XROTOR');
    await expect(page.locator('.brand-sub').getByRole('link', { name: 'XROTOR' }))
      .toHaveAttribute('href', 'https://web.mit.edu/drela/Public/web/xrotor/');
    const licenseLink = page.getByRole('link', { name: 'License & source' });
    await expect(licenseLink).toBeVisible();
    const licensePage = new URL(await licenseLink.getAttribute('href'), url);
    const notices = await page.request.get(licensePage.href);
    assert.ok(notices.ok());
    assert.match(await notices.text(), /GPL-2\.0-or-later/);
    for (const name of ['XROTOR-COPYING.txt', 'libf2c-Notice.txt', 'Emscripten.txt', 'musl.txt', 'three-LICENSE.txt', 'lucide-LICENSE.txt', 'Feather.txt']) {
      assert.ok((await page.request.get(new URL(name, licensePage).href)).ok(), name + ' is served');
    }
    await expect(page.locator('#solutionStatus')).toHaveText('Converged');
    await expect(page.locator('#stationRows tr')).toHaveCount(30);
    await expect(page.locator('#thrust')).toHaveText('1,644N');
    await expect(page.locator('#engineLabel')).toHaveText('WASM / FLOAT64');
    assert.deepEqual(wasmResponses, [200], 'The default backend must load the real WASM artifact');
    await expect(page.locator('#webglFallback')).toBeHidden();
    await page.waitForTimeout(600);
    const pixels = await canvasPixels(page);
    assert.ok(pixels.bright > 500 && pixels.colors > 100, JSON.stringify(pixels));
    await assertLayout(page);
    await page.screenshot({ path: path.join(artifacts, 'gui-desktop.png') });
    const iso = await page.locator('#rotorScene canvas').evaluate(c => c.toDataURL());
    await page.locator('#viewFront').click();
    await page.waitForTimeout(400);
    const front = await page.locator('#rotorScene canvas').evaluate(c => c.toDataURL());
    assert.notEqual(iso, front, 'Camera must change the rendered image');
    const bounds = await page.locator('#rotorScene canvas').boundingBox();
    await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.6, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    assert.notEqual(front, await page.locator('#rotorScene canvas').evaluate(c => c.toDataURL()), 'Orbit drag must change the image');
    await page.locator('#spin').click();
    const beforeSpin = await page.locator('#rotorScene canvas').evaluate(c => c.toDataURL());
    await page.waitForTimeout(400);
    assert.notEqual(beforeSpin, await page.locator('#rotorScene canvas').evaluate(c => c.toDataURL()), 'Animation must move');
    await page.locator('#spin').click();
    await page.locator('#fitView').click();
    const solid = await page.locator('#rotorScene canvas').evaluate(c => c.toDataURL());
    await page.locator('#wireframe').click();
    await page.waitForTimeout(300);
    assert.notEqual(solid, await page.locator('#rotorScene canvas').evaluate(c => c.toDataURL()), 'Wireframe must change the image');
    await page.locator('#wireframe').click();
    await page.locator('[data-table=history]').click();
    await expect(page.locator('#historyMeta')).toContainText('5 iterations');
    await expect(page.locator('#historyChart')).toBeVisible();
    await page.locator('[data-table=stations]').click();

    const examples = page.locator('#preset optgroup[label="XROTOR examples"] option');
    await expect(examples).toHaveCount(6);
    for (const [id, title] of [
      ['f1d', 'F1D propeller'], ['ecruzer', 'EDICS CRUZER PROP 7'],
      ['hydro', 'HYDROFOIL AIR PROP'], ['four-blade', 'FM 4bld D10in'],
      ['ducted', 'Ducted rotor R=0.1m, 6bld, 16000'], ['windmill', 'Small Windmill'],
    ]) {
      await page.locator('#preset').selectOption('xrotor-' + id);
      await expect(page.locator('#headerName')).toHaveText(title);
      await expect(page.locator('#solutionStatus')).toHaveText('Converged');
      await expect(page.locator('#exampleNote')).toBeVisible();
      await expect(page.locator('#stationRows tr')).toHaveCount(30);
      if (id === 'f1d') await expect(page.locator('#thrust')).toHaveText('5.1mN');
      if (id === 'ducted') await expect(page.locator('[name=duct]')).toBeChecked();
    }
    await page.locator('#preset').selectOption('baseline');
    await expect(page.locator('#thrust')).toHaveText('1,644N');
    await expect(page.locator('#exampleNote')).toBeHidden();

    await page.locator('[data-mode=design]').click();
    await page.locator('#solve').click();
    await expect(page.locator('#message')).toContainText('Design converged');
    await expect(page.locator('#thrust')).toHaveText('600N');
    await expect(page.locator('#geometryBadge')).toHaveText('Designed');
    await page.locator('[data-mode=operate]').click();
    await page.locator('#solve').click();
    await expect(page.locator('#message')).toContainText('Operating point converged');
    await expect(page.locator('#thrust')).toHaveText('600N');
    await page.locator('#saveCase').click();
    await expect(page.locator('#caseCount')).toHaveText('1');
    const projectDownload = page.waitForEvent('download');
    await page.locator('#saveFile').click();
    const downloaded = await projectDownload;
    const project = JSON.parse(await fs.readFile(await downloaded.path(), 'utf8'));
    assert.equal(project.config.geometry.length, 30);
    const csvDownload = page.waitForEvent('download');
    await page.locator('#exportCsv').click();
    const csv = await fs.readFile(await (await csvDownload).path(), 'utf8');
    assert.equal(csv.trim().split('\n').length, 31);
    assert.ok(csv.includes('chord_m'));

    await page.locator('#preset').selectOption('baseline');
    await expect(page.locator('#thrust')).toHaveText('1,644N');
    await page.locator('#fileInput').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"viberotor","version":1,"config":{"radius":0}}') });
    await expect(page.locator('#message')).toContainText('radius must be');
    await expect(page.locator('[name=radius]')).toHaveValue('1.4');
    const fileChooser = page.waitForEvent('filechooser');
    await page.locator('.setup #openFile').click();
    await (await fileChooser).setFiles({ name: 'rotor.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) });
    await expect(page.locator('#thrust')).toHaveText('600N');
    await page.locator('#preset').selectOption('baseline');
    await expect(page.locator('#thrust')).toHaveText('1,644N');

    await page.locator('#tab-performance').click();
    await page.evaluate(() => {
      document.getElementById('runSweep').click();
      document.querySelector('#message button').click();
    });
    await expect(page.locator('#message')).toContainText('Calculation cancelled');
    await expect(page.locator('#runSweep')).toBeEnabled();
    await page.locator('#sweepFrom').fill('800');
    await page.locator('#sweepTo').fill('1000');
    await page.locator('#runSweep').click();
    await expect(page.locator('#sweepStatus')).toHaveText('9 of 9 operating points converged.');
    await page.screenshot({ path: path.join(artifacts, 'gui-performance.png') });
    const sweepDownload = page.waitForEvent('download');
    await page.locator('#exportSweep').click();
    const sweep = await fs.readFile(await (await sweepDownload).path(), 'utf8');
    assert.equal(sweep.trim().split('\n').length, 10);
    const baseline = sweep.trim().split('\n')[5].split(',');
    assert.ok(Math.abs(Number(baseline[2]) - solver.solve({}).summary.TDIM) < 1e-8);
    await page.locator('#tab-noise').click();
    await page.locator('#runNoise').click();
    await expect(page.locator('#noiseSpl')).toHaveText('74.2dB');
    await expect(page.locator('#noiseBpf')).toHaveText('45.0Hz');
    await page.screenshot({ path: path.join(artifacts, 'gui-acoustics.png') });
    await page.locator('#observerZ').fill('0');
    await page.locator('#runNoise').click();
    await expect(page.locator('#message')).toContainText('at least one rotor diameter');

    await page.reload();
    await expect(page.locator('#solutionStatus')).toHaveText('Converged');
    await expect(page.locator('#caseCount')).toHaveText('1');
    await page.locator('.case-row > button:first-child').click();
    await expect(page.locator('#thrust')).toHaveText('600N');
    await page.locator('#preset').selectOption('baseline');
    await expect(page.locator('#thrust')).toHaveText('1,644N');
    await page.locator('[name=rpm]').fill('950');
    await expect(page.locator('#solutionStatus')).toHaveText('Modified');
    await expect(page.locator('#saveCase')).toBeDisabled();
    await expect(page.locator('#exportCsv')).toBeDisabled();
    await page.locator('#solve').click();
    await expect(page.locator('#solutionStatus')).toHaveText('Converged');
    await page.locator('.advanced summary').click();
    await page.locator('#backend').selectOption('js');
    await expect(page.locator('#solutionStatus')).toHaveText('Modified');
    await page.locator('#solve').click();
    await expect(page.locator('#solutionStatus')).toHaveText('Converged');
    await expect(page.locator('#engineLabel')).toHaveText('JS / FLOAT64');
    await page.locator('#backend').selectOption('wasm');
    await page.locator('[name=iterations]').fill('1');
    await page.locator('#solve').click();
    await expect(page.locator('#solutionStatus')).toHaveText('Not converged');
    await expect(page.locator('#message')).toContainText('provisional');
    await page.locator('#preset').selectOption('baseline');
    await expect(page.locator('#solutionStatus')).toHaveText('Converged');

    for (const width of [1920, 1024, 768, 390, 320]) {
      await page.locator('.setup').evaluate(el => { el.scrollTop = 0; });
      await page.setViewportSize({ width, height: width <= 620 ? 844 : 960 });
      await page.waitForTimeout(400);
      await assertLayout(page);
      if (width <= 900) await expect(desktopStar).toBeHidden();
      else await expect(desktopStar).toBeVisible();
      const rendered = await canvasPixels(page);
      assert.ok(rendered.bright > 150 && rendered.colors > 100, JSON.stringify({ width, ...rendered }));
      await page.screenshot({ path: path.join(artifacts, 'gui-' + width + '.png'), fullPage: true });
      if (width <= 620) {
        await page.locator('.mobile-tabs [data-panel=results]').click();
        await expect(page.locator('#thrust')).toBeVisible();
        await assertLayout(page);
        await page.screenshot({ path: path.join(artifacts, 'gui-results-' + width + '.png'), fullPage: true });
        await page.locator('.mobile-tabs [data-panel=setup]').click();
        await expect(page.locator('#solve')).toBeVisible();
        await expect(page.locator('.setup #openFile')).toBeVisible();
        await expect(page.locator('.setup #saveFile')).toBeVisible();
        await expect(mobileStar).toBeVisible();
        await page.screenshot({ path: path.join(artifacts, 'gui-setup-' + width + '.png'), fullPage: true });
        if (width === 390) {
          await mobileStar.scrollIntoViewIfNeeded();
          await expect(mobileStar).toBeInViewport();
          await page.screenshot({ path: path.join(artifacts, 'gui-setup-star-390.png') });
        }
        await page.locator('.mobile-tabs [data-panel=workspace]').click();
      }
    }
    await page.setViewportSize({ width: 320, height: 720 });
    await assertLayout(page);
    await expect(page.locator('#message')).toBeVisible();
    const messageBounds = await page.locator('#message').boundingBox();
    const workspaceBounds = await page.locator('.workspace').boundingBox();
    assert.ok(messageBounds.y + messageBounds.height <= workspaceBounds.y + workspaceBounds.height + 1, 'Short mobile layout must not clip status');
    assert.deepEqual(errors, []);
    const unavailable = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    await unavailable.route('https://buttons.github.io/buttons.js', route => route.fulfill({ body: '' }));
    await unavailable.route('**/xrotor.wasm', route => route.abort());
    await unavailable.goto(url);
    await expect(unavailable.locator('#message')).toContainText('WASM could not load');
    await expect(unavailable.locator('#solutionStatus')).toHaveText('Not solved');
    await unavailable.locator('.advanced summary').click();
    await unavailable.locator('#backend').selectOption('js');
    await unavailable.locator('#solve').click();
    await expect(unavailable.locator('#solutionStatus')).toHaveText('Converged');
    await expect(unavailable.locator('#thrust')).toHaveText('1,644N');
    await unavailable.close();
    console.log('GUI checks passed: WASM and JS solvers, WASM load failure/recovery, design roundtrip, files, saved cases, sweeps, acoustics, responsive layout, WebGL pixels and interaction.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
