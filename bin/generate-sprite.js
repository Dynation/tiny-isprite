#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

const cwd = process.cwd(); // Get the current working directory

const ICONS_DIR = process.argv[2] 
    ? path.resolve(cwd, process.argv[2]) 
    : path.join(cwd, 'icons');

const OUTPUT_FILE = process.argv[3] 
    ? path.resolve(cwd, process.argv[3]) 
    : path.join(cwd, 'public', 'sprite.svg');

async function getSymbolFromSvg(svgContent, id) {
  const cleaned = svgContent
    .replace(/<\?xml.*?\?>/, '')
    .replace(/<!DOCTYPE.*?>/, '')
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>/, '')
    .trim();

  const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch ? `viewBox="${viewBoxMatch[1]}"` : '';

  return `<symbol id="icon-${id}" ${viewBox}>${cleaned}</symbol>`;
}

async function generateSprite() {
  try {
    const files = (await fs.readdir(ICONS_DIR)).filter(file => file.endsWith('.svg'));

    if (files.length === 0) {
      console.warn('⚠️  No SVG files found in:', ICONS_DIR);
      return;
    }

    const symbols = await Promise.all(
      files.map(async file => {
        const content = await fs.readFile(path.join(ICONS_DIR, file), 'utf8');
        const id = path.basename(file, '.svg');
        return getSymbolFromSvg(content, id);
      })
    );

    const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n${symbols.join('\n')}\n</svg>`;

    await fs.writeFile(OUTPUT_FILE, sprite, 'utf8');
    console.log(`✅ sprite.svg created with ${symbols.length} icons at ${OUTPUT_FILE}`);
  } catch (error) {
    console.error('❌ Error generating sprite:', error.message);
  }
}

generateSprite();
