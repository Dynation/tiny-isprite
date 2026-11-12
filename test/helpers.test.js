import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './helpers.mjs';

test('successful command JSON is not mixed with stderr lifecycle logs', async () => {
  const output = await run(process.execPath, ['-e', 'console.error("prepare build diagnostics"); console.log(JSON.stringify({ filename: "package.tgz" }))']);
  assert.deepEqual(JSON.parse(output), { filename: 'package.tgz' });
});
test('failed commands retain stdout and stderr diagnostics', async () => {
  await assert.rejects(run(process.execPath, ['-e', 'console.log("stdout context"); console.error("stderr failure"); process.exit(1)']), error => error.message.includes('stdout context') && error.message.includes('stderr failure'));
});
