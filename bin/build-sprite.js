#!/usr/bin/env node

import { readFileSync, watch } from 'node:fs';
import { Command } from 'commander';
import { generateSprite } from '../core/generate-sprite.js';

const program = new Command();

program
  .name('build-sprite')
  .description('Generate an SVG sprite from individual icons')
  .argument('[srcDir]', 'Source directory with SVG icons', './icons')
  .argument('[outputFile]', 'Output sprite file', './public/sprite.svg')
  .option('-p, --preserve-colored', 'Preserve original colors in multicolor icons', false)
  .option('-c, --use-css-vars', 'Convert fills and strokes to CSS variables (monochrome only)', false)
  .option('-a, --all', 'Force CSS variables for all icons', false)
  .option('-m, --minify', 'Minify the output sprite.svg', false)
  .option('-x, --prefix <prefix>', 'Add prefix to all icon IDs', 'icon-')
  .option('--public-path <url>', 'Public URL directory (including deployment base path)', '/')
  .option('--manifest <file>', 'Generated ES module to import from application source')
  .option('-w, --watch', 'Regenerate when source SVG files change', false)
  .version(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version)
  .action(async (srcDir, outputFile, options) => {
    const build = () => generateSprite({
      srcDir,
      outputFile,
      preserveColored: options.preserveColored,
      useCssVars: options.useCssVars,
      forceAllVars: options.all,
      minify: options.minify,
      prefix: options.prefix,
      publicPath: options.publicPath,
      manifestFile: options.manifest
    });
    if (!options.watch) return build();
    // Subscribe before the initial build so edits during generation are not lost.
    let timer;
    let queue = Promise.resolve();
    const rebuild = () => { queue = queue.then(build).catch(error => console.error(error.message)); };
    const watcher = watch(srcDir, (_event, filename) => {
      if (filename && !String(filename).endsWith('.svg')) return;
      clearTimeout(timer);
      timer = setTimeout(rebuild, 75);
    });
    queue = build();
    try { await queue; } catch (error) { watcher.close(); throw error; }
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
      clearTimeout(timer);
      watcher.close();
    });
  });

program.parseAsync(process.argv).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
