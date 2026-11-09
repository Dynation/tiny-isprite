// Install the packed artifact with each supported React major, then execute it
// under the current Node (CI matrix) or explicitly supplied local Node binaries.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './helpers.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const root = await mkdtemp(path.join(tmpdir(), 'tiny-isprite-compat-'));
const results = [];
const packageVersion = JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8')).version;
const nodes = process.env.COMPAT_NODE_PATHS?.split(path.delimiter) ?? [process.execPath];
try {
  const [{ filename }] = JSON.parse(await run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', root], { cwd: repo }));
  for (const version of ['17.0.2', '18.3.1', '19.3.1']) {
    const major = version.split('.')[0];
    const cwd = path.join(root, `react-${major}`);
    await mkdir(cwd);
    await writeFile(path.join(cwd, 'package.json'), JSON.stringify({
      private: true, type: 'module', dependencies: {
        'tiny-isprite': `file:${path.join(root, filename)}`,
        react: version, 'react-dom': version,
        '@types/react': major, '@types/react-dom': major,
      },
    }));
    await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd });
    await writeFile(path.join(cwd, 'consumer.mjs'), `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
const { renderToString } = createRequire(import.meta.url)('react-dom/server');
import Icon, { Icon as Named } from 'tiny-isprite';
import { generateSprite } from 'tiny-isprite/generator';
const cjs = createRequire(import.meta.url)('tiny-isprite');
assert.equal(Icon, Named);
for (const component of [Icon, cjs.Icon, cjs.default]) {
  const html = renderToString(React.createElement(component, {
    name: 'star', spriteUrl: '/demo/sprite.hash.svg?theme=dark', version: 0, prefix: 'custom-',
  }));
  assert.match(html, /href="\\/demo\\/sprite.hash.svg\\?theme=dark&amp;v=0#custom-star"/);
}
const result = await generateSprite({ srcDir: './icons', outputFile: './public/sprite.svg' });
assert.match(result.url, /^\\/sprite\\.[a-f0-9]{20}\\.svg$/);
console.log('PASS Node ' + process.versions.node + ' / React ' + React.version + ': ESM, CJS, SSR, generator');
`);
    await mkdir(path.join(cwd, 'icons'));
    await writeFile(path.join(cwd, 'icons/star.svg'), '<svg viewBox="0 0 24 24"><path d="M0 0h24v24z"/></svg>');
    await writeFile(path.join(cwd, 'consumer.mts'), `
import Icon, { type IconProps } from 'tiny-isprite';
import { generateSprite, type SpriteManifest } from 'tiny-isprite/generator';
const props: IconProps = { name: 'star', spriteUrl: '/sprite.hash.svg', prefix: 'custom-', version: 0 };
Icon(props);
const sprite: SpriteManifest = await generateSprite({});
void sprite.url;
`);
    await writeFile(path.join(cwd, 'consumer.cts'), `import Icons = require('tiny-isprite');\nIcons.Icon({ name: 'star', spriteUrl: '/sprite.hash.svg' });\n`);
    for (const node of nodes) {
      const version = (await run(node, ['--version'])).trim();
      console.log((await run(node, ['consumer.mjs'], { cwd })).trim());
      assert.equal((await run(node, ['node_modules/tiny-isprite/bin/build-sprite.js', '--version'], { cwd })).trim(), packageVersion);
      await run(node, [path.join(repo, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'Node16', '--moduleResolution', 'Node16', '--skipLibCheck', 'consumer.mts', 'consumer.cts'], { cwd });
      console.log(`PASS ${version} / React ${major}: CLI and published TypeScript declarations`);
      results.push({ node: version, react: major, package: packageVersion, esm: true, cjs: true, ssr: true, cli: true, types: true });
    }
  }
  await mkdir(path.join(repo, '.release-artifacts'), { recursive: true });
  await writeFile(path.join(repo, '.release-artifacts/compatibility-results.json'), JSON.stringify(results, null, 2) + '\n');
} finally {
  await rm(root, { recursive: true, force: true });
}
