import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, writeFile, readFile, symlink, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

test('prepack rebuilds stale dist and removes obsolete outputs before creating the npm artifact', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'tiny-isprite-pack-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project');
  await mkdir(project);
  for (const file of ['src', 'core', 'bin', 'package.json', 'tsconfig.json', 'README.md', 'LICENSE.md']) {
    await cp(path.resolve(file), path.join(project, file), { recursive: true });
  }
  await symlink(path.resolve('node_modules'), path.join(project, 'node_modules'), 'dir');
  await mkdir(path.join(project, 'dist'));
  await writeFile(path.join(project, 'dist/Icon.js'), 'STALE_DIST');
  await writeFile(path.join(project, 'dist/obsolete.js'), 'OBSOLETE');
  execFileSync('npm', ['pack', '--json', '--pack-destination', root], { cwd: project, encoding: 'utf8' });
  const { version } = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
  const filename = `tiny-isprite-${version}.tgz`;
  execFileSync('tar', ['-xf', path.join(root, filename), '-C', root]);
  const output = path.join(root, 'package/dist');
  assert.doesNotMatch(await readFile(path.join(output, 'Icon.js'), 'utf8'), /STALE_DIST/);
  assert.ok((await readdir(output)).includes('Icon.cjs'));
  assert.ok((await readdir(output)).includes('Icon.d.ts'));
  assert.ok(!(await readdir(output)).includes('obsolete.js'));
});
