import fs from 'fs/promises';
import path from 'path';
import { createHash, randomUUID } from 'node:crypto';

// Replace complete files only; do not trigger HMR for identical output.
async function writeChanged(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (await fs.readFile(file, 'utf8').catch(() => null) === content) return;
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, content, 'utf8');
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

const hashContent = content => createHash('sha256').update(content).digest('hex').slice(0, 20);
const versionedPath = (file, hash) => {
  const extension = path.extname(file);
  return `${extension ? file.slice(0, -extension.length) : file}.${hash}${extension}`;
};

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
  prefix = 'icon-',
  publicPath = '/',
  manifestFile = outputFile.replace(/\.svg$/i, '') + '.manifest.js'
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
    const files = (await fs.readdir(srcDir)).filter(f => f.endsWith('.svg')).sort();
    // An empty source must publish an empty sprite, not leave stale symbols.

    const variablesMap = new Set();

    const symbols = [];
    // Sequential processing keeps CSS variable order stable across rebuilds.
    for (const file of files) {
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
      const viewBox = viewBoxMatch && viewBoxMatch[1].trim().split(/\s+/).length === 4
        ? `viewBox="${viewBoxMatch[1]}"` : 'viewBox="0 0 24 24"';
      symbols.push(`<symbol id="${prefix}${id}" ${viewBox}>\n${cleaned}\n</symbol>`);
    }

    let sprite = `<svg xmlns=\"http://www.w3.org/2000/svg\" style=\"display:none\">\n${symbols.join('\n')}\n</svg>`;

    if (minify) {
      sprite = sprite.replace(/\s+/g, ' ').trim();
    }

    if (/[?#]/.test(publicPath)) throw new Error('publicPath must not contain a query or fragment');
    const publicUrl = file => `${publicPath.replace(/\/$/, '')}/${encodeURIComponent(path.basename(file))}`;
    const hash = hashContent(sprite);
    const spriteFile = versionedPath(outputFile, hash);
    await writeChanged(spriteFile, sprite);
    await writeChanged(outputFile, sprite); // Legacy alias, never cache as immutable.

    let cssUrl;
    if (useCssVars || forceAllVars) {
      const css = generateCssFileContent(variablesMap);
      const cssPath = path.join(path.dirname(outputFile), 'icons-vars.css');
      const hashedCss = versionedPath(cssPath, hashContent(css));
      await writeChanged(hashedCss, css);
      await writeChanged(cssPath, css);
      cssUrl = publicUrl(hashedCss);
    }
    const manifest = { url: publicUrl(spriteFile), hash, prefix, ...(cssUrl ? { cssUrl } : {}) };
    // Publish the pointer last, once all referenced assets exist.
    const declarationFile = manifestFile.replace(/\.(mjs|js)$/, '') + (manifestFile.endsWith('.mjs') ? '.d.mts' : '.d.ts');
    await writeChanged(declarationFile, 'declare const sprite: { readonly url: string; readonly hash: string; readonly prefix: string; readonly cssUrl?: string };\nexport default sprite;\n');
    await writeChanged(manifestFile, `// Generated by tiny-isprite. Do not edit.\nexport default ${JSON.stringify(manifest, null, 2)};\n`);
    console.log(`✅ Sprite with ${files.length} icons saved to ${spriteFile}`);
    return manifest;
  } catch (err) {
    throw new Error(`Sprite generation failed: ${err.message}`, { cause: err });
  }
}
