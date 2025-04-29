import fs from 'fs/promises';
import path from 'path';

export async function processSvgWithCssVars(svgContent, iconId, variablesMap, allMode = false) {
  let counter = { fill: 1, stroke: 1 };

  const updatedSvg = svgContent.replace(/(fill|stroke)=\"(.*?)\"/gi, (match, prop, color) => {
    if (color === 'none' || color === 'currentColor' || color.startsWith('url(')) return match;

    const varName = allMode 
      ? `--all-${iconId}-${prop}-${counter[prop]++}`
      : `--${iconId}-${prop}-${counter[prop]++}`;

    variablesMap.add(`  ${varName}: ${color};`);
    return `${prop}="var(${varName})"`;
  });

  return updatedSvg;
}

export function generateCssFileContent(variablesMap) {
  return `:root {\n${Array.from(variablesMap).join('\n')}\n}`;
}



export async function generateSprite({
  srcDir = './public/icons',
  outputFile = './public/sprite.svg',
  preserveColored = false,
  useCssVars = false,
  forceAllVars = false,
  minify = false,
  prefix = 'icon-'
}) {
  async function isMulticolor(svgContent) {
    const fills = [...svgContent.matchAll(/fill=\"(.*?)\"/gi)]
      .map(m => m[1])
      .filter(v => v !== 'none' && v !== 'currentColor' && !v.startsWith('url('));

    return new Set(fills).size > 1;
  }

  function sanitizeSvg(svgContent) {
    return svgContent
      .replace(/<\?xml[^>]*>/g, '')
      .replace(/<!DOCTYPE[^>]*>/g, '')
      .replace(/<!--.*?-->/gs, '')
      .replace(/<svg[^>]*>/, '')
      .replace(/<\/svg>/, '')
      .trim();
  }

  try {
    const files = (await fs.readdir(srcDir)).filter(f => f.endsWith('.svg'));
    if (!files.length) return console.warn(`⚠️ No SVG files found in ${srcDir}`);

    const variablesMap = new Set();

    const batchSize = 10;
    const batches = [];
    for (let i = 0; i < files.length; i += batchSize) {
      batches.push(files.slice(i, i + batchSize));
    }

    const symbols = await Promise.all(batches.map(async (batch) => {
      const results = [];
      for (const file of batch) {
        const content = await fs.readFile(path.join(srcDir, file), 'utf8');
        const id = path.basename(file, '.svg');
        const hasMultipleColors = await isMulticolor(content);
        let cleaned = sanitizeSvg(content);

        if (forceAllVars) {
          cleaned = await processSvgWithCssVars(cleaned, id, variablesMap, true);
        } else if (useCssVars && !hasMultipleColors) {
          cleaned = await processSvgWithCssVars(cleaned, id, variablesMap);
        } else if (!hasMultipleColors && !preserveColored) {
          cleaned = cleaned.replace(/fill=\"(?!none|currentColor|url\()[^\"]+\"/gi, 'fill="currentColor"');
        }

        const viewBoxMatch = content.match(/viewBox=\"([^\"]+)\"/);
        const viewBox = viewBoxMatch && viewBoxMatch[1].split(' ').length === 4
          ? `viewBox="${viewBoxMatch[1]}"`
          : 'viewBox="0 0 24 24"';

        results.push(`<symbol id="${prefix}${id}" ${viewBox}>\n${cleaned}\n</symbol>`);
      }
      return results;
    })).then(results => results.flat());

    let sprite = `<svg xmlns=\"http://www.w3.org/2000/svg\" style=\"display:none\">\n${symbols.join('\n')}\n</svg>`;

    if (minify) {
      sprite = sprite.replace(/\s+/g, ' ').trim();
    }

    await fs.writeFile(outputFile, sprite, 'utf8');
    console.log(`✅ Sprite with ${files.length} icons saved to ${outputFile}`);

    if ((useCssVars || forceAllVars) && variablesMap.size) {
      // Исправить путь для CSS файла
      const cssPath = path.join(path.dirname(outputFile), 'icons-vars.css');
      await fs.writeFile(cssPath, generateCssFileContent(variablesMap), 'utf8');
      console.log(`🎨 CSS variables saved to ${cssPath}`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}
