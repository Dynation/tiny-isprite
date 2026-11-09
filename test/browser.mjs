// End-to-end test: actual external SVG rendering, watch/Fast Refresh, immutable cache.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer, build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { generateSprite } from '../core/generate-sprite.js';

const repo = fileURLToPath(new URL('../', import.meta.url));
const root = await mkdtemp(path.join(repo, '.browser-'));
const srcDir = path.join(root, 'icons');
const outputFile = path.join(root, 'public/sprite.svg');
const manifestFile = path.join(root, 'src/sprite.js');
const options = { srcDir, outputFile, manifestFile, publicPath: '/app/' };
const shape = size => `<svg viewBox="0 0 24 24"><rect width="${size}" height="${size}" fill="currentColor"/></svg>`;
let browser, dev, prod, watcher;
const immutable = {
  name: 'immutable-svg',
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      if (/\.svg(?:\?|$)/.test(req.url)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      next();
    });
  },
};
async function poll(fn, message) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(message);
}
try {
  await mkdir(srcDir, { recursive: true });
  await writeFile(path.join(srcDir, 'star.svg'), shape(24));
  await generateSprite(options);
  await writeFile(path.join(root, 'index.html'), '<div id="root"></div><script type="module" src="/src/App.jsx"></script>');
  await writeFile(path.join(root, 'src/App.jsx'), `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Icon } from ${JSON.stringify(path.join(repo, 'dist/Icon.js'))};
import sprite from './sprite.js';
function App() {
  const [count, setCount] = useState(0);
  return <><button onClick={() => setCount(count + 1)}>{count}</button>
    <Icon name="star" spriteUrl={sprite.url} size={24} /></>;
}
createRoot(document.getElementById('root')).render(<App />);
`);
  // A separate component module lets React Refresh retain component state.
  let app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');
  app = app.replace("import { createRoot } from 'react-dom/client';", '').replace('function App()', 'export default function App()').replace("createRoot(document.getElementById('root')).render(<App />);", '');
  await writeFile(path.join(root, 'src/App.jsx'), app);
  await writeFile(path.join(root, 'src/main.jsx'), `import React from 'react'; import { createRoot } from 'react-dom/client'; import App from './App.jsx'; createRoot(document.getElementById('root')).render(<App />);`);
  await writeFile(path.join(root, 'index.html'), '<div id="root"></div><script type="module" src="/src/main.jsx"></script>');
  watcher = spawn(process.execPath, [path.join(repo, 'bin/build-sprite.js'), srcDir, outputFile, '--manifest', manifestFile, '--public-path', '/app/', '--watch'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let watchLog = '';
  watcher.stdout.on('data', data => { watchLog += data; });
  watcher.stderr.on('data', data => { watchLog += data; });
  await poll(() => watchLog.includes('saved to'), 'watch did not start');
  dev = await createServer({ root, base: '/app/', configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 0 } });
  await dev.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(dev.resolvedUrls.local[0]);
  const use = page.locator('use');
  await use.waitFor();
  const oldHref = await use.getAttribute('href');
  await poll(async () => await use.evaluate(el => el.getBBox().width) === 24, 'initial external SVG did not render');
  await page.locator('button').click();
  await page.evaluate(() => { window.persisted = 'still-here'; });
  await writeFile(path.join(srcDir, 'star.svg'), shape(12));
  await poll(async () => await use.getAttribute('href') !== oldHref, 'watch/HMR did not update href');
  await poll(async () => await use.evaluate(el => el.getBBox().width) === 12, 'updated SVG did not render');
  assert.equal(await page.locator('button').textContent(), '1');
  assert.equal(await page.evaluate(() => window.persisted), 'still-here');
  assert.deepEqual(errors, []);
  console.log('PASS development: CLI watch -> manifest -> Fast Refresh, rendered SVG changed without reload; React state retained');
  await page.close();
  await dev.close(); dev = undefined;
  watcher.kill('SIGTERM');
  await new Promise(resolve => watcher.once('exit', resolve)); watcher = undefined;

  await build({ root, base: '/app/', configFile: false, logLevel: 'error', plugins: [react()] });
  prod = await preview({ root, base: '/app/', configFile: false, plugins: [immutable], preview: { host: '127.0.0.1', port: 0 } });
  const productionPage = await browser.newPage();
  const responses = [];
  productionPage.on('response', response => { if (/sprite\.[a-f0-9]{20}\.svg$/.test(response.url())) responses.push(response); });
  await productionPage.goto(prod.resolvedUrls.local[0]);
  const prodUse = productionPage.locator('use');
  await prodUse.waitFor();
  await poll(async () => await prodUse.evaluate(el => el.getBBox().width) === 12, 'production v1 did not render');
  const v1 = await prodUse.getAttribute('href');
  const cachedAlias = await productionPage.evaluate(() => fetch('/app/sprite.svg').then(response => response.text()));
  assert.match(cachedAlias, /width="12"/);
  await poll(() => responses.length > 0, 'no sprite response');
  assert.match(responses[0].headers()['cache-control'], /immutable/);
  await writeFile(path.join(srcDir, 'star.svg'), shape(6));
  await generateSprite(options);
  // Model atomic deployment of a new application build, preserving old assets.
  await build({ root, base: '/app/', configFile: false, logLevel: 'error', plugins: [react()], build: { emptyOutDir: false } });
  assert.equal(await productionPage.evaluate(() => fetch('/app/sprite.svg').then(response => response.text())), cachedAlias);
  const freshAlias = await productionPage.request.get(new URL('/app/sprite.svg', prod.resolvedUrls.local[0]).href);
  assert.match(await freshAlias.text(), /width="6"/);
  console.log('PASS regression reproduced: fixed URL stayed stale in browser cache while server already held new bytes');
  await productionPage.reload();
  await prodUse.waitFor();
  await poll(async () => await prodUse.getAttribute('href') !== v1, 'production build reused old href');
  await poll(async () => await prodUse.evaluate(el => el.getBBox().width) === 6, 'immutable cache returned stale SVG');
  assert.ok(responses.length >= 2);
  assert.notEqual(responses.at(-1).url(), responses[0].url());
  const oldAsset = await productionPage.request.get(new URL(v1.split('#')[0], prod.resolvedUrls.local[0]).href);
  assert.equal(oldAsset.status(), 200);
  assert.match(await oldAsset.text(), /width="12"/);
  console.log('PASS production: new build renders new content despite year-long immutable cache; old asset still available');
} finally {
  watcher?.kill('SIGTERM');
  await browser?.close();
  await dev?.close();
  await new Promise(resolve => prod ? prod.httpServer.close(resolve) : resolve());
  await rm(root, { recursive: true, force: true });
}
