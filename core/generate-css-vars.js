// core/generate-css-vars.js
export async function processSvgWithCssVars(svgContent, iconId, variablesMap) {
    let counter = { fill: 1, stroke: 1 };
  
    const updatedSvg = svgContent.replace(/(fill|stroke)=["'](.*?)["']/gi, (match, prop, color) => {
      if (color === 'none' || color === 'currentColor') return match;
  
      const varName = `--${iconId}-${prop}-${counter[prop]++}`;
      variablesMap.add(`  ${varName}: ${color};`);
      return `${prop}="var(${varName})"`;
    });
  
    return updatedSvg;
  }
  
  export function generateCssFileContent(variablesMap) {
    return `:root {\n${Array.from(variablesMap).join('\n')}\n}`;
  }
  