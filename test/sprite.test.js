import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat, rm, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Icon from '../dist/Icon.js';
import { generateSprite } from '../core/generate-sprite.js';

const svg = (shape = '<path d="M0 0h24v24H0z" fill="red"/>') => `<svg viewBox="0 0 24 24">${shape}</svg>`;
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'tiny-isprite-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const srcDir = path.join(root, 'icons');
  await mkdir(srcDir);
  const options = { srcDir, outputFile: path.join(root, 'public/sprite.svg'), manifestFile: path.join(root, 'src/sprite.js') };
  await writeFile(path.join(srcDir, 'star.svg'), svg());
  return { root, options };
}

test('stable hash and manifest on identical rebuild; changed content gets a new URL and retains old asset', async t => {
  const { root, options } = await fixture(t);
  const first = await generateSprite(options);
  const before = await stat(options.manifestFile);
  assert.deepEqual(await generateSprite(options), first);
  assert.equal((await stat(options.manifestFile)).mtimeMs, before.mtimeMs);
  const oldBytes = await readFile(path.join(root, 'public', first.url), 'utf8');
  await writeFile(path.join(options.srcDir, 'star.svg'), svg('<circle cx="12" cy="12" r="10"/>'));
  const second = await generateSprite(options);
  assert.notEqual(second.url, first.url);
  assert.equal(await readFile(path.join(root, 'public', first.url), 'utf8'), oldBytes);
  assert.match(await readFile(options.manifestFile, 'utf8'), new RegExp(second.hash));
  assert.equal(await readFile(options.outputFile, 'utf8'), await readFile(path.join(root, 'public', second.url), 'utf8'));
  assert.match(renderToStaticMarkup(React.createElement(Icon, { name: 'star', spriteUrl: second.url })), new RegExp(second.hash));
});

test('CSS-only changes update hashed CSS pointer even when sprite bytes are unchanged', async t => {
  const { options } = await fixture(t);
  const first = await generateSprite({ ...options, useCssVars: true, publicPath: '/app/assets', prefix: 'custom-' });
  await writeFile(path.join(options.srcDir, 'star.svg'), svg().replace('red', 'blue'));
  const second = await generateSprite({ ...options, useCssVars: true, publicPath: '/app/assets', prefix: 'custom-' });
  assert.equal(second.url, first.url);
  assert.notEqual(second.cssUrl, first.cssUrl);
  assert.match(second.url, /^\/app\/assets\/sprite\.[a-f0-9]{20}\.svg$/);
  assert.equal(second.prefix, 'custom-');
});

test('add, rename, delete and empty source remove stale symbols', async t => {
  const { options } = await fixture(t);
  await writeFile(path.join(options.srcDir, 'new.svg'), svg());
  const added = await generateSprite(options);
  await rename(path.join(options.srcDir, 'star.svg'), path.join(options.srcDir, 'renamed.svg'));
  const renamed = await generateSprite(options);
  assert.notEqual(added.hash, renamed.hash);
  assert.match(await readFile(options.outputFile, 'utf8'), /icon-renamed/);
  await rm(path.join(options.srcDir, 'renamed.svg'));
  const deleted = await generateSprite(options);
  assert.notEqual(added.hash, deleted.hash);
  assert.doesNotMatch(await readFile(options.outputFile, 'utf8'), /icon-star/);
  await rm(path.join(options.srcDir, 'new.svg'));
  const empty = await generateSprite(options);
  assert.notEqual(empty.hash, deleted.hash);
  assert.doesNotMatch(await readFile(options.outputFile, 'utf8'), /<symbol/);
});

test('ordering across batches and generation flags are deterministic', async t => {
  const { options } = await fixture(t);
  for (let i = 15; i >= 0; i--) await writeFile(path.join(options.srcDir, `${i}.svg`), svg());
  const first = await generateSprite({ ...options, forceAllVars: true });
  assert.deepEqual(await generateSprite({ ...options, forceAllVars: true }), first);
  assert.notEqual((await generateSprite({ ...options, minify: true })).hash, first.hash);
});

test('errors reject API calls and fail CLI instead of reporting success', async t => {
  const { options } = await fixture(t);
  await assert.rejects(generateSprite({ ...options, srcDir: '/does-not-exist' }), /Sprite generation failed/);
  assert.throws(() => execFileSync(process.execPath, ['bin/build-sprite.js', '/does-not-exist'], { stdio: 'pipe' }), { status: 1 });
});

test('React preserves legacy inline/external API and supports version, queries, prefixes and fragment replacement', () => {
  const markup = props => renderToStaticMarkup(React.createElement(Icon, { name: 'star', ...props }));
  assert.match(markup({}), /href="#icon-star"/);
  assert.match(markup({ external: true }), /href="\/sprite.svg#icon-star"/);
  assert.match(markup({ spriteUrl: '/base/custom.svg?theme=dark&v=old#ignored', version: 'a b', prefix: 'custom-' }), /href="\/base\/custom.svg\?theme=dark&amp;v=a\+b#custom-star"/);
  assert.match(markup({ spriteUrl: '/sprite.svg', version: 0 }), /href="\/sprite.svg\?v=0#icon-star"/);
  assert.match(markup({ spriteUrl: '/sprite.abc.svg', size: 32, className: 'icon' }), /width="32" height="32" class="icon"/);
});

test('published entry points resolve via ESM and CommonJS', async () => {
  const esm = await import('tiny-isprite');
  const cjs = createRequire(import.meta.url)('tiny-isprite');
  assert.equal(typeof esm.Icon, 'function');
  assert.equal(typeof esm.default, 'function');
  assert.equal(typeof cjs.Icon, 'function');
  assert.equal(typeof (await import('tiny-isprite/generator')).generateSprite, 'function');
});

test('packed npm artifact contains working ESM/CJS/types/CLI/generator entry points', async t => {
  const { root } = await fixture(t);
  const repo = path.resolve('.');
  const [{ filename }] = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', root], { encoding: 'utf8' }));
  const modules = path.join(root, 'node_modules');
  await mkdir(modules);
  execFileSync('tar', ['-xf', path.join(root, filename), '-C', root]);
  const { rename, symlink } = await import('node:fs/promises');
  await rename(path.join(root, 'package'), path.join(modules, 'tiny-isprite'));
  for (const dependency of ['react', 'commander', '@types']) {
    await symlink(path.join(repo, 'node_modules', dependency), path.join(modules, dependency), 'dir');
  }
  const esm = execFileSync(process.execPath, ['--input-type=module', '-e', "import Icon, { Icon as Named } from 'tiny-isprite'; import { generateSprite } from 'tiny-isprite/generator'; if (Icon !== Named || typeof generateSprite !== 'function') process.exit(1);"], { cwd: root });
  assert.equal(esm.length, 0);
  execFileSync(process.execPath, ['-e', "if(typeof require('tiny-isprite').Icon !== 'function') process.exit(1)"], { cwd: root });
  await writeFile(path.join(root, 'consumer.mts'), `import Icon, { type IconProps } from 'tiny-isprite';\nconst props: IconProps = { name: 'star', spriteUrl: '/sprite.hash.svg', prefix: 'custom-', version: 0 };\nIcon(props);\nimport { generateSprite, type SpriteManifest } from 'tiny-isprite/generator';\nconst sprite: SpriteManifest = await generateSprite({ manifestFile: './src/sprite.js' });\nvoid sprite.url;\n`);
  execFileSync(process.execPath, [path.join(repo, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.mts'], { cwd: root });
  const cli = execFileSync(process.execPath, [path.join(modules, 'tiny-isprite/bin/build-sprite.js'), path.join(root, 'icons'), path.join(root, 'built/sprite.svg'), '--manifest', path.join(root, 'generated/sprite.js')], { cwd: root, encoding: 'utf8' });
  assert.match(cli, /saved to/);
  assert.match(await readFile(path.join(root, 'generated/sprite.js'), 'utf8'), /sprite\.[a-f0-9]{20}\.svg/);
});

test('generated JS and MJS manifests resolve with strict TypeScript checking', async t => {
  const { root, options } = await fixture(t);
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  for (const extension of ['js', 'mjs']) {
    const manifestFile = path.join(root, `src/sprite.${extension}`);
    await generateSprite({ ...options, manifestFile });
    await writeFile(path.join(root, 'consumer.mts'), `import sprite from './src/sprite.${extension}';\nconst url: string = sprite.url;\nconst css: string | undefined = sprite.cssUrl;\nvoid [url, css];\n`);
    execFileSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', path.join(root, 'consumer.mts')]);
  }
});
