// core/generate-css-vars.js

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

import fs from 'fs/promises';
import path from 'path';

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

    const symbols = await Promise.all(
      files.map(async file => {
        const content = await fs.readFile(path.join(srcDir, file), 'utf8');
        const id = path.basename(file, '.svg');
        const multicolor = await isMulticolor(content);

        let cleaned = sanitizeSvg(content);

        if (forceAllVars) {
          cleaned = await processSvgWithCssVars(cleaned, id, variablesMap, true);
        } else if (useCssVars && !multicolor) {
          cleaned = await processSvgWithCssVars(cleaned, id, variablesMap);
        } else if (!multicolor && !preserveColored) {
          cleaned = cleaned.replace(/fill=\"(?!none|currentColor|url\()[^\"]+\"/gi, 'fill="currentColor"');
        }

        const viewBoxMatch = content.match(/viewBox=\"([^\"]+)\"/);
        const viewBox = viewBoxMatch ? `viewBox="${viewBoxMatch[1]}"` : '';

        return `<symbol id="${prefix}${id}" ${viewBox}>\n${cleaned}\n</symbol>`;
      })
    );

    let sprite = `<svg xmlns=\"http://www.w3.org/2000/svg\" style=\"display:none\">\n${symbols.join('\n')}\n</svg>`;

    if (minify) {
      sprite = sprite.replace(/\s+/g, ' ').trim();
    }

    await fs.writeFile(outputFile, sprite, 'utf8');
    console.log(`✅ Sprite with ${files.length} icons saved to ${outputFile}`);

    if ((useCssVars || forceAllVars) && variablesMap.size) {
      await fs.writeFile('./icons-vars.css', generateCssFileContent(variablesMap), 'utf8');
      console.log(`🎨 CSS variables saved to ${srcDir}`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}
