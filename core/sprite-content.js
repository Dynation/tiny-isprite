// Shared, filesystem-free generation used by the CLI and browser playground.
import { parseSvg, prepareSvg, recolor, serialize } from "./svg-document.js";

export async function processSvgWithCssVars(
  svgContent,
  iconId,
  variablesMap,
  allMode = false,
) {
  const root = parseSvg(
    `<svg xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`,
  );
  recolor(root, iconId, variablesMap, {
    useCssVars: true,
    forceAllVars: allMode,
    convertAll: true,
  });
  return Array.from(root.childNodes, serialize).join("");
}

export function generateCssFileContent(variablesMap) {
  return `:root {\n${Array.from(variablesMap).join("\n")}\n}`;
}

export async function buildSpriteContent({
  icons,
  preserveColored = false,
  useCssVars = false,
  forceAllVars = false,
  minify = false,
  prefix = "icon-",
  target = "inline",
}) {
  if (!["inline", "external"].includes(target))
    throw new Error("target must be inline or external");
  const variables = new Set();
  const symbols = [];
  const seen = new Set();
  const reserved = new Set(
    icons.map((icon) => `${prefix}${icon.name.replace(/\.svg$/, "")}`),
  );
  const outputIds = new Set();
  for (const { name, content } of [...icons].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    const id = name.replace(/\.svg$/, "");
    const symbolId = `${prefix}${id}`;
    try {
      if (!id || /[\s#<>"']/.test(symbolId))
        throw new Error("Invalid SVG symbol name");
      if (seen.has(symbolId))
        throw new Error(`Duplicate SVG symbol ID: ${symbolId}`);
      seen.add(symbolId);
      const root = parseSvg(content);
      const symbol = prepareSvg(root, symbolId, { target });
      recolor(root, id, variables, {
        preserveColored,
        useCssVars,
        forceAllVars,
      });
      for (const node of [
        symbol,
        ...Array.from(symbol.getElementsByTagName("*")),
      ])
        if (node.hasAttribute("id")) {
          const value = node.getAttribute("id");
          if (outputIds.has(value) || (node !== symbol && reserved.has(value)))
            throw new Error(
              `Generated SVG ID collision: ${value}; choose a different prefix or filename`,
            );
          outputIds.add(value);
        }
      symbols.push(serialize(symbol));
    } catch (error) {
      throw new Error(`${name}: ${error.message}`, { cause: error });
    }
  }
  // Minify only wrapper formatting: whitespace inside text and CSS is meaningful.
  const separator = minify ? "" : "\n";
  const sprite = `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;pointer-events:none">${separator}${symbols.join(separator)}${separator}</svg>`;
  return {
    sprite,
    css:
      useCssVars || forceAllVars
        ? generateCssFileContent(variables)
        : undefined,
  };
}
