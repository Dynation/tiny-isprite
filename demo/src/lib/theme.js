// Tailwind v4 example. Theme tokens belong in global CSS, not in SVG paths.
export function darkColor(hex) {
  return (
    "#" +
    (hex.match(/[\da-f]{2}/gi) || ["24", "5c", "f3"])
      .slice(0, 3)
      .map((part) =>
        Math.round(parseInt(part, 16) * 0.55 + 255 * 0.45)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function buildThemeExample({
  name,
  variables,
  color,
  darkPalette = {},
  foregroundDark = "#e2e8f0",
  single,
  size,
  aspectRatio = 1,
  rotation = 0,
}) {
  const foreground = `--color-icon-${name}-foreground`;
  const paints = variables.map((v) => ({
    ...v,
    token: `--color-icon-${v.name.replace(/^--(?:all-)?/, "")}`,
    dark: darkPalette[v.name] || darkColor(v.value),
  }));
  const css = `/* globals.css — Tailwind CSS v4. Merge with your existing global stylesheet. */\n@import "tailwindcss";\n\n/* Manual theme switching. Omit this line to use the system color scheme instead. */\n@custom-variant dark (&:where(.dark, .dark *));\n\n/* static keeps tokens available even when SVG variables are their only consumers. */\n@theme static {\n  ${foreground}: ${color};\n${paints.map((v) => `  ${v.token}: ${v.value};`).join("\n")}\n}\n\n/* Same semantic tokens, different values. Keep @theme at the top level. */\n.dark {\n  ${foreground}: ${foregroundDark};\n${paints.map((v) => `  ${v.token}: ${v.dark};`).join("\n")}\n}\n`;
  const classes = [
    "inline-flex",
    `text-icon-${name}-foreground`,
    ...(!single && rotation ? [`rotate-[${rotation}deg]`] : []),
    ...paints.map((v) => `[${v.name}:var(${v.token})]`),
  ].join(" ");
  const imports = single
    ? `import { ExampleIcon } from './${name}.jsx';`
    : `import { Icon } from 'tiny-isprite';\nimport sprite from './generated/sprite.js';`;
  const icon = single
    ? `<ExampleIcon width={${size}} height={${size * aspectRatio}} className=${JSON.stringify(classes)} role="img" aria-label="Your icon" />`
    : `<span className=${JSON.stringify(classes)}>\n          <Icon name=${JSON.stringify(name)} spriteUrl={sprite.url} prefix={sprite.prefix} size={${size}} />\n        </span>`;
  const jsx = `"use client";\n\nimport { useState } from 'react';\nimport './globals.css';\n${imports}\n\n// Keep this file beside globals.css${single ? ` and ${name}.jsx` : ", with the manifest in generated/"}.\n// No inline palette style: colors must come from the theme tokens.\nexport default function ThemeExample() {\n  const [dark, setDark] = useState(false);\n  return (\n    <section className={dark ? 'dark' : ''}>\n${single ? "" : '      {sprite.cssUrl && <link rel="stylesheet" href={sprite.cssUrl} />}\n'}      <div className="bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 p-6">\n        <button type="button" onClick={() => setDark(value => !value)} aria-pressed={dark}>\n          {dark ? 'Switch to light' : 'Switch to dark'}\n        </button>\n        ${icon}\n      </div>\n    </section>\n  );\n}\n\n// If your app already switches themes, keep its existing toggle and use just\n// the icon classes above. A .dark ancestor switches every connected token.\n// Keep utility classes literal so Tailwind can discover them.\n`;
  return { css, jsx, classes, paints, foreground, foregroundDark };
}
