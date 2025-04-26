#!/usr/bin/env node

import { Command } from 'commander';
import { generateSprite } from './core.js';  // Логіку винесемо сюди

const program = new Command();

program
  .name('build-sprite')
  .description('Generate an SVG sprite from individual icons')
  .argument('[srcDir]', 'Source directory with SVG icons', './icons')
  .argument('[outputFile]', 'Output sprite file', './public/sprite.svg')
  .option('-p, --preserve-colored', 'Preserve original colors in multicolor icons', false)
  .option('-c, --use-css-vars', 'Convert fills and strokes to CSS variables', false)
  .option('-m, --minify', 'Minify the output sprite.svg', false)
  .option('-x, --prefix <prefix>', 'Add prefix to all icon IDs', 'icon-')
  .version('2.0.0')
  .action((srcDir, outputFile, options) => {
    generateSprite({
      srcDir,
      outputFile,
      preserveColored: options.preserveColored,
      useCssVars: options.useCssVars,
      minify: options.minify,
      prefix: options.prefix
    });
  });

program.parse(process.argv);
