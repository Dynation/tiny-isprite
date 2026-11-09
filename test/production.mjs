// Test real package consumers through production build/start, not a dev server.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, writeFile, rm, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { run, freePort, poll, stop } from './helpers.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const artifacts = path.join(repo, '.release-artifacts');
await mkdir(artifacts, { recursive: true });
await run('npm', ['pack', '--json', '--pack-destination', artifacts], { cwd: repo });
const { version } = JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8'));
const filename = `tiny-isprite-${version}.tgz`;
const tarball = path.join(artifacts, filename);
const environment = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', CI: '1', RAYON_NUM_THREADS: '2' };
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const framework of ['vite', 'next']) {
    console.log(`Testing packed tiny-isprite in ${framework}: installing isolated consumer`);
    const workspace = await mkdtemp(path.join(repo, '.browser-production-'));
    const cwd = path.join(workspace, 'app');
    let server;
    let serverLog = '';
    let buildLog = '';
    let context;
    try {
      await cp(path.join(repo, 'examples', framework), cwd, {
        recursive: true,
        filter: file => !path.relative(path.join(repo, 'examples', framework), file).split(path.sep)
          .some(part => ['node_modules', '.next', 'dist', 'public', 'generated', 'package-lock.json'].includes(part)),
      });
      const pkg = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'));
      pkg.dependencies['tiny-isprite'] = `file:${tarball}`;
      await writeFile(path.join(cwd, 'package.json'), JSON.stringify(pkg, null, 2));
      buildLog += await run('npm', ['install', '--ignore-scripts', '--no-fund', '--no-audit'], { cwd, env: environment });
      assert.equal((await lstat(path.join(cwd, 'node_modules/tiny-isprite'))).isSymbolicLink(), false);
      // Each fixture is a real package install. Catch vulnerabilities in its own tree too.
      buildLog += await run('npm', ['audit', '--audit-level=moderate'], { cwd, env: environment });
      const bin = path.join(cwd, 'node_modules', framework, framework === 'next' ? 'dist/bin/next' : 'bin/vite.js');
      const port = await freePort();
      const base = `http://127.0.0.1:${port}/demo/`;
      const start = async () => {
        const args = framework === 'next' ? ['start', '-H', '127.0.0.1', '-p', String(port)] : ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'];
        server = spawn(process.execPath, [bin, ...args], { cwd, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
        server.stdout.on('data', data => { serverLog += data; });
        server.stderr.on('data', data => { serverLog += data; });
        await poll(async () => {
          if (server.exitCode !== null) throw new Error(`Production server exited\n${serverLog}`);
          try { return (await fetch(base, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
        }, `${framework} production server start`, 60_000);
      };
      console.log(`${framework}: building version A`);
      buildLog += await run('npm', ['run', 'build'], { cwd, env: environment });
      await start();
      const html = await (await fetch(base)).text();
      context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      const failures = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
      await page.goto(base);
      await page.locator('use').waitFor();
      const use = page.locator('use');
      await poll(async () => await use.evaluate(el => el.getBBox().width) === 24, `${framework} initial SVG geometry`);
      const first = await use.getAttribute('href');
      assert.match(first, /^\/demo\/assets\/sprite\.[a-f0-9]{20}\.svg#demo-star$/);
      if (framework === 'next') assert.ok(html.includes(first), 'SSR and hydrated client must use the same sprite URL');
      await page.locator('button').click();
      await poll(async () => await page.locator('button').textContent() === 'Count: 1', `${framework} hydration / interaction`);
      // Warm the real browser cache and inspect server headers without disabling cache.
      const cached = await page.evaluate(async url => {
        const response = await fetch(url);
        return { text: await response.text(), cache: response.headers.get('cache-control') };
      }, first.split('#')[0]);
      assert.match(cached.cache, /immutable/);
      assert.match(cached.text, /width="24"/);
      await page.screenshot({ path: path.join(artifacts, `${framework}-before.png`) });
      await stop(server); server = undefined;
      await writeFile(path.join(cwd, 'icons/star.svg'), '<svg viewBox="0 0 24 24"><rect width="8" height="8" fill="currentColor"/></svg>\n');
      console.log(`${framework}: building version B with regenerated sprite; keeping browser cache`);
      buildLog += await run('npm', ['run', 'build'], { cwd, env: environment });
      await start();
      // A tab left open across deployment keeps its original working reference.
      assert.equal(await use.getAttribute('href'), first);
      const retained = await page.request.get(new URL(first.split('#')[0], base).href);
      assert.equal(retained.status(), 200);
      assert.match(await retained.text(), /width="24"/);
      await page.reload();
      await poll(async () => await use.getAttribute('href') !== first, `${framework} new production manifest`);
      await poll(async () => await use.evaluate(el => el.getBBox().width) === 8, `${framework} regenerated SVG geometry with warm cache`);
      const second = await use.getAttribute('href');
      const newAsset = await page.request.get(new URL(second.split('#')[0], base).href);
      assert.equal(newAsset.status(), 200);
      assert.match(newAsset.headers()['content-type'], /image\/svg\+xml/);
      assert.deepEqual(errors, []);
      assert.deepEqual(failures, []);
      await page.screenshot({ path: path.join(artifacts, `${framework}-after.png`) });
      const frameworkVersion = JSON.parse(await readFile(path.join(cwd, `node_modules/${framework}/package.json`), 'utf8')).version;
      const result = { framework, frameworkVersion, package: JSON.parse(await readFile(path.join(cwd, 'node_modules/tiny-isprite/package.json'), 'utf8')).version, node: process.versions.node, first, second, cacheControl: cached.cache, ssr: framework === 'next', hydrationErrors: errors, failedResponses: failures, oldAssetRetained: true };
      results.push(result);
      console.log(`PASS ${framework} ${frameworkVersion}: packed artifact, two production builds, warm immutable cache, visible SVG update, retained old asset${framework === 'next' ? ', SSR + hydration, Turbopack build' : ''}`);
    } finally {
      await context?.close();
      await stop(server);
      await writeFile(path.join(artifacts, `${framework}-build.log`), buildLog + '\n' + serverLog);
      await writeFile(path.join(artifacts, 'production-results.json'), JSON.stringify(results, null, 2) + '\n');
      await rm(workspace, { recursive: true, force: true });
    }
  }
} finally {
  await browser.close();
}
