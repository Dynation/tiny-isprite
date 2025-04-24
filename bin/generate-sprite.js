import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ICONS_DIR = process.argv[2] || path.join(__dirname, '../icons');
const OUTPUT_FILE = process.argv[3] || path.join(__dirname, '../public/sprite.svg');
const PRESERVE_FLAG = process.argv.includes('--preserve-colored');

async function isMulticolor(svgContent) {
  // Detects multiple fills that are not 'none' or 'currentColor'
  const fillMatches = svgContent.match(/fill=["'](.*?)["']/gi) || [];
  const distinct = new Set(
    fillMatches.map(f => f.replace(/fill=|['"]/g, '').trim())
               .filter(v => v !== 'none' && v !== 'currentColor')
  );
  return distinct.size > 1;
}

function sanitizeSvg(svgContent, convertFill = true) {
  let cleaned = svgContent
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/<!DOCTYPE[^>]*>/g, '')
    .replace(/<!--.*?-->/gs, '')
    .replace(/<svg[^>]*>/, '')
    .replace(/<\/svg>/, '')
    .trim();

  if (convertFill) {
    cleaned = cleaned.replace(/fill=["'](?!none|currentColor).*?["']/gi, 'fill="currentColor"');
  }

  return cleaned;
}

async function getSymbolFromSvg(svgContent, id, preserveColor) {
  const viewBoxMatch = svgContent.match(/viewBox=["']([^"']+)["']/);
  const viewBox = viewBoxMatch ? `viewBox=\"${viewBoxMatch[1]}\"` : '';

  const cleaned = sanitizeSvg(svgContent, !preserveColor);
  return `<symbol id="icon-${id}" ${viewBox}>\n${cleaned}\n</symbol>`;
}

async function generateSprite() {
  try {
    const files = (await fs.readdir(ICONS_DIR)).filter(f => f.endsWith('.svg'));
    if (!files.length) {
      console.warn('⚠️ No SVG files found.');
      return;
    }

    const symbols = await Promise.all(
      files.map(async (file) => {
        const content = await fs.readFile(path.join(ICONS_DIR, file), 'utf8');
        const id = path.basename(file, '.svg');
        const multicolor = await isMulticolor(content);

        if (multicolor && PRESERVE_FLAG) {
          console.log(`🎨 Icon '${file}' detected as multicolor — preserved.`);
        }

        return getSymbolFromSvg(content, id, multicolor && PRESERVE_FLAG);
      })
    );

    const sprite = `<svg xmlns=\"http://www.w3.org/2000/svg\" style=\"display:none\">\n${symbols.join('\n')}\n</svg>`;
    await fs.writeFile(OUTPUT_FILE, sprite, 'utf8');
    console.log(`✅ sprite.svg created with ${symbols.length} icons at ${OUTPUT_FILE}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

generateSprite();
