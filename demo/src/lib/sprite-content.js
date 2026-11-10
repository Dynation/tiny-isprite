// GENERATED from core/sprite-content.js by scripts/sync-engine.mjs.
// Shared, filesystem-free generation used by the CLI and browser playground.
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

export async function buildSpriteContent({
  icons, preserveColored = false, useCssVars = false, forceAllVars = false,
  minify = false, prefix = 'icon-',
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

    const variablesMap = new Set();

    const symbols = [];
    // Sequential processing keeps CSS variable order stable across rebuilds.
    for (const { name: file, content } of [...icons].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const id = file.replace(/\.svg$/, '');
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

    return { sprite, css: useCssVars || forceAllVars ? generateCssFileContent(variablesMap) : undefined };
}
