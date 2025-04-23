import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ICONS_DIR = path.join(__dirname, '../icons');
const OUTPUT_FILE = path.join(__dirname, '../public/sprite.svg');

function getSymbolFromSvg(svgContent, id) {
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

function generateSprite() {
  const files = fs.readdirSync(ICONS_DIR).filter(file => file.endsWith('.svg'));

  const symbols = files.map(file => {
    const content = fs.readFileSync(path.join(ICONS_DIR, file), 'utf8');
    const id = path.basename(file, '.svg');
    return getSymbolFromSvg(content, id);
  });

  const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n${symbols.join('\n')}\n</svg>`;

  fs.writeFileSync(OUTPUT_FILE, sprite, 'utf8');
  console.log(`✅ sprite.svg created with ${symbols.length} icons`);
}

generateSprite();
