import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzipSync, strFromU8 } from 'fflate';
import { buildProject, defaultOptions, exportBundle, validateOptions } from '../src/lib/project.js';

const icons = [{ name: 'badge', content: '<svg viewBox="0 0 24 24"><rect width="24" height="24" fill="red"/></svg>' }];
test('exported asset names depend on bytes; color-only CSS edits update the CSS pointer', async () => {
  const options = { ...defaultOptions, mode: 'variables' };
  const first = await buildProject(icons, options);
  const repeat = await buildProject(icons, options);
  assert.deepEqual(first, repeat);
  const recolored = await buildProject([{ ...icons[0], content: icons[0].content.replace('red', 'blue') }], options);
  assert.equal(first.filename, recolored.filename);
  assert.notEqual(first.cssFilename, recolored.cssFilename);
  assert.notEqual(first.module, recolored.module);
});
test('bundle includes all referenced assets, cleaned sources and the selected React example', async () => {
  const options = { ...defaultOptions, publicPath: '/assets/', prefix: 'demo-', mode: 'variables' };
  const artifact = await buildProject(icons, options);
  const zip = unzipSync(exportBundle(artifact, icons, options, { name: 'badge', size: 48 }));
  assert.ok(zip[`public${artifact.manifest.url}`]);
  assert.ok(zip[`public${artifact.manifest.cssUrl}`]);
  assert.equal(strFromU8(zip['icons/badge.svg']), icons[0].content);
  assert.ok(strFromU8(zip['Icon-example.jsx']).includes('export function ExampleIcon()'));
  assert.ok(strFromU8(zip['Icon-example.jsx']).includes('size={48}'));
  assert.ok(zip['src/generated/sprite.d.ts']);
});
test('invalid paths and prefixes cannot become exported paths or markup', async () => {
  for (const patch of [{ publicPath: '/../' }, { publicPath: 'https://external.invalid/' }, { prefix: '\"><script>' }]) {
    assert.ok(validateOptions({ ...defaultOptions, ...patch }));
    await assert.rejects(buildProject(icons, { ...defaultOptions, ...patch }));
  }
});
