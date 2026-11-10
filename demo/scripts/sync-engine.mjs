import { readFile, writeFile } from 'node:fs/promises';
const source = new URL('../../core/sprite-content.js', import.meta.url);
const destination = new URL('../src/lib/sprite-content.js', import.meta.url);
let content;
try { content = await readFile(source, 'utf8'); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
  // A standalone Sites source snapshot includes this generated mirror.
  await readFile(destination, 'utf8');
  process.exit(0);
}
const generated = '// GENERATED from core/sprite-content.js by scripts/sync-engine.mjs.\n' + content;
if (await readFile(destination, 'utf8').catch(() => '') !== generated) await writeFile(destination, generated);
