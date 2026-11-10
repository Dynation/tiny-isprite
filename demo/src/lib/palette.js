// Palette edits are baked into cleaned sources, so the published CLI can
// reproduce the exported sprite and its stylesheet without a browser adapter.
export function prepareIcons(icons, options) {
  return icons.map((icon) => {
    let content = icon.content;
    const width = options.strokeWidths?.[icon.name];
    if (Number.isFinite(width) && width >= 0 && width <= 12) {
      content = content.replace(
        /stroke-width="[^"]*"/g,
        `stroke-width="${width}"`,
      );
      content = content.replace(
        /(<svg\b[^>]*>)([\s\S]*)(<\/svg>)/,
        `$1<g stroke-width="${width}">$2</g>$3`,
      );
    }
    if (options.mode !== "variables") return { ...icon, content };
    if (options.editablePalette) {
      content = content.replace(
        /(fill|stroke)="currentColor"/g,
        '$1="#245cf3"',
      );
      if (!/fill="/.test(content))
        content = content.replace(
          /(<svg\b[^>]*>)([\s\S]*)(<\/svg>)/,
          '$1<g fill="#000000">$2</g>$3',
        );
    }
    const fills = [...content.matchAll(/fill="([^"]*)"/g)]
      .map((m) => m[1])
      .filter(
        (v) => v !== "none" && v !== "currentColor" && !v.startsWith("url("),
      );
    if (!options.allColors && new Set(fills).size > 1)
      return { ...icon, content };
    const counters = { fill: 1, stroke: 1 };
    content = content.replace(
      /(fill|stroke)="([^"]*)"/g,
      (match, prop, value) => {
        if (
          value === "none" ||
          value === "currentColor" ||
          value.startsWith("url(")
        )
          return match;
        const key = `--${options.allColors ? "all-" : ""}${icon.name}-${prop}-${counters[prop]++}`;
        const override = options.palette?.[icon.name]?.[key];
        return /^#[\da-f]{6}$/i.test(override || "")
          ? `${prop}="${override}"`
          : match;
      },
    );
    return { ...icon, content };
  });
}

export function iconVariables(css, name, allColors = false) {
  const prefix = `--${allColors ? "all-" : ""}${name}-`;
  return [...(css || "").matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)]
    .filter(
      (m) =>
        m[1].startsWith(prefix) &&
        /^(fill|stroke)-\d+$/.test(m[1].slice(prefix.length)),
    )
    .map((m) => ({
      name: m[1],
      value: m[2].trim(),
      property: m[1].slice(prefix.length).replace(/-/, " "),
    }));
}
export function variableCss(variables) {
  return variables.length
    ? `/* Import this CSS, then use className="my-icon" on a wrapper\n   around <Icon>, or directly on the standalone <ExampleIcon>.\n   Keep variable names; replace the color values on the right.\n   Remove inline variable overrides from style so this class can apply. */\n.my-icon {\n${variables.map((v) => `  ${v.name}: ${v.value};`).join("\n")}\n}`
    : "/* Select Generate CSS variables to create an editable palette. */";
}
export function colorHex(value, fallback = "#245cf3") {
  if (/^#[\da-f]{6}$/i.test(value)) return value;
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.fillStyle = fallback;
  ctx.fillStyle = value;
  const result = ctx.fillStyle;
  return /^#[\da-f]{6}$/i.test(result) ? result : fallback;
}
