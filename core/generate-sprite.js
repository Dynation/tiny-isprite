import fs from 'fs/promises';
import path from 'path';

export async function generateSprite({
  srcDir = './icons',
  outputFile = './public/sprite.svg',
  preserveColored = false,
  useCssVars = false,
  minify = false,
  prefix = 'icon-'
}) {
  async function isMulticolor(svgContent) {
    const fills = [...svgContent.matchAll(/fill=["'](.*?)["']/gi)]
      .map(m => m[1])
      .filter(v => v !== 'none' && v !== 'currentColor' && !v.startsWith('url('));

    return new Set(fills).size > 1;
  }

  function applyCssVars(svg) {
    return svg
      .replace(/fill=["'](?!none|currentColor|url\()[^"']+["']/gi, 'fill="var(--icon-fill)"')
      .replace(/stroke=["'](?!none|currentColor|url\()[^"']+["']/gi, 'stroke="var(--icon-stroke)"');
  }

  function sanitizeSvg(svgContent, forceColor) {
    let cleaned = svgContent
      .replace(/<\?xml[^>]*>/g, '')
      .replace(/<!DOCTYPE[^>]*>/g, '')
      .replace(/<!--.*?-->/gs, '')
      .replace(/<svg[^>]*>/, '')
      .replace(/<\/svg>/, '')
      .trim();

    if (forceColor) {
      if (!/fill=/i.test(cleaned)) {
        cleaned = cleaned.replace(/<path/g, '<path fill="currentColor"')
                         .replace(/<rect/g, '<rect fill="currentColor"')
                         .replace(/<circle/g, '<circle fill="currentColor"');
      } else {
        cleaned = cleaned.replace(/fill=["'](?!none|currentColor|url\()[^"']+["']/gi, 'fill="currentColor"');
      }
    }

    if (useCssVars) {
      cleaned = applyCssVars(cleaned);
    }

    return cleaned;
  }

  async function getSymbol(svgContent, id, preserve) {
    const viewBoxMatch = svgContent.match(/viewBox=["']([^"']+)["']/);
    const viewBox = viewBoxMatch ? `viewBox="${viewBoxMatch[1]}"` : '';

    const forceColor = !preserve;
    const cleaned = sanitizeSvg(svgContent, forceColor);

    return `<symbol id="${prefix}${id}" ${viewBox}>\n${cleaned}\n</symbol>`;
  }

  try {
    const files = (await fs.readdir(srcDir)).filter(f => f.endsWith('.svg'));
    if (!files.length) return console.warn(`⚠️ No SVG files found in ${srcDir}`);

    const symbols = await Promise.all(
      files.map(async file => {
        const content = await fs.readFile(path.join(srcDir, file), 'utf8');
        const id = path.basename(file, '.svg');
        const multicolor = await isMulticolor(content);

        if (multicolor && preserveColored) {
          console.log(`🎨 [${file}] preserved as multicolor`);
          return getSymbol(content, id, true);
        }

        return getSymbol(content, id, !multicolor);
      })
    );

    let sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n${symbols.join('\n')}\n</svg>`;

    if (minify) {
      sprite = sprite.replace(/\s+/g, ' ').trim();
    }

    await fs.writeFile(outputFile, sprite, 'utf8');
    console.log(`✅ Sprite with ${files.length} icons saved to ${outputFile}`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}
