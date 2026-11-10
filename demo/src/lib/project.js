import DOMPurify from "dompurify";
import { zipSync, strToU8 } from "fflate";
import { prepareIcons, iconVariables } from "./palette.js";
import { buildSpriteContent } from "./sprite-content.js";

export const MAX_FILE_SIZE = 128 * 1024;
export const SINGLE_FILE_SIZE = 2 * 1024 * 1024;
export const MAX_ICONS = 80;
export const defaultOptions = {
  prefix: "icon-",
  publicPath: "/",
  mode: "currentColor",
  minify: true,
};
export function iconName(filename) {
  return (
    filename
      .replace(/\.svg$/i, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "untitled"
  );
}
export function validateOptions(options) {
  if (!/^(?:[a-zA-Z_][a-zA-Z0-9_-]*)?$/.test(options.prefix))
    return "Use letters, numbers, dashes or underscores for the prefix; start with a letter or underscore.";
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(options.publicPath))
    return "Asset path must be / or a path like /assets/. End it with a slash.";
  return "";
}

export function cleanSvg(raw, name, maxSize = MAX_FILE_SIZE) {
  if (new TextEncoder().encode(raw).length > maxSize)
    throw new Error(`SVG exceeds the ${maxSize / 1024} KB limit.`);
  const parser = new DOMParser();
  const initial = parser.parseFromString(raw, "image/svg+xml");
  if (
    initial.querySelector("parsererror") ||
    initial.documentElement.localName !== "svg" ||
    (initial.documentElement.namespaceURI &&
      initial.documentElement.namespaceURI !== "http://www.w3.org/2000/svg")
  ) {
    throw new Error("Not a valid SVG document.");
  }
  if (!initial.documentElement.namespaceURI)
    initial.documentElement.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const normalized = new XMLSerializer().serializeToString(initial);
  const namespaced = parser.parseFromString(normalized, "image/svg+xml");
  const clean = DOMPurify.sanitize(namespaced.documentElement, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: [
      "script",
      "foreignObject",
      "style",
      "image",
      "a",
      "animate",
      "animateMotion",
      "animateTransform",
      "set",
      "mpath",
    ],
    FORBID_ATTR: ["style"],
  });
  const doc = parser.parseFromString(clean, "image/svg+xml");
  const root = doc.documentElement;
  if (doc.querySelector("parsererror") || root.localName !== "svg")
    throw new Error("Could not read the cleaned SVG.");
  const elements = [root, ...root.querySelectorAll("*")];
  const ids = new Map();
  for (const element of elements) {
    if (element.id) {
      if (ids.has(element.id)) throw new Error("SVG contains duplicate IDs.");
      ids.set(element.id, `${name}-source-${ids.size}`);
    }
  }
  for (const element of elements) {
    for (const attribute of [...element.attributes]) {
      const key = attribute.localName.toLowerCase();
      let value = attribute.value;
      if (key === "id") value = ids.get(value);
      if (
        key.startsWith("on") ||
        key === "style" ||
        key === "src" ||
        key === "base"
      ) {
        element.removeAttributeNode(attribute);
        continue;
      }
      if (key === "href") {
        if (!value.startsWith("#") || !ids.has(value.slice(1))) {
          element.removeAttributeNode(attribute);
          continue;
        }
        value = `#${ids.get(value.slice(1))}`;
      }
      if (/url\s*\(/i.test(value)) {
        const match = value.match(/^url\(\s*['"]?#([^\s'"()]+)['"]?\s*\)$/i);
        if (!match || !ids.has(match[1])) {
          element.removeAttributeNode(attribute);
          continue;
        }
        value = `url(#${ids.get(match[1])})`;
      } else if (key === "fill" || key === "stroke") {
        if (
          value !== "none" &&
          value !== "currentColor" &&
          !CSS.supports("color", value)
        ) {
          element.removeAttributeNode(attribute);
          continue;
        }
      }
      if (attribute.namespaceURI)
        element.setAttributeNS(attribute.namespaceURI, attribute.name, value);
      else element.setAttribute(attribute.name, value);
    }
  }
  if (
    !root.querySelector(
      "path, rect, circle, ellipse, line, polyline, polygon, text, use",
    )
  )
    throw new Error("SVG has no supported drawing elements after cleanup.");
  const parts = (root.getAttribute("viewBox") ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    parts.length !== 4 ||
    parts.some((value) => !Number.isFinite(value)) ||
    parts[2] <= 0 ||
    parts[3] <= 0
  )
    root.setAttribute("viewBox", "0 0 24 24");
  else root.setAttribute("viewBox", parts.join(" "));
  // Root presentation attributes would be stripped by sprite conversion. Preserve
  // their inheritance on a group before passing the source to the shared engine.
  const group = doc.createElementNS("http://www.w3.org/2000/svg", "g");
  for (const key of [
    "id",
    "fill",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-dasharray",
    "stroke-dashoffset",
    "fill-rule",
    "clip-rule",
    "opacity",
    "color",
    "transform",
  ]) {
    if (root.hasAttribute(key)) {
      group.setAttribute(key, root.getAttribute(key));
      root.removeAttribute(key);
    }
  }
  if (group.attributes.length) {
    while (root.firstChild) group.appendChild(root.firstChild);
    root.appendChild(group);
  }
  return new XMLSerializer().serializeToString(root);
}

export async function contentHash(text) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 20);
}
export async function buildProject(icons, options) {
  const error = validateOptions(options);
  if (error) throw new Error(error);
  const sources = prepareIcons(icons, options);
  const output = await buildSpriteContent({
    icons: sources.map((icon) => ({
      name: `${icon.name}.svg`,
      content: icon.content,
    })),
    prefix: options.prefix,
    minify: options.minify,
    preserveColored: options.mode === "original",
    useCssVars: options.mode === "variables",
    forceAllVars: options.mode === "variables" && options.allColors,
  });
  const hash = await contentHash(output.sprite);
  const filename = `sprite.${hash}.svg`;
  const cssFilename =
    output.css === undefined
      ? undefined
      : `icons-vars.${await contentHash(output.css)}.css`;
  const manifest = {
    url: `${options.publicPath}${filename}`,
    hash,
    prefix: options.prefix,
    ...(cssFilename ? { cssUrl: `${options.publicPath}${cssFilename}` } : {}),
  };
  return {
    ...output,
    sources,
    filename,
    cssFilename,
    manifest,
    module: `// Generated by tiny-isprite.\nexport default ${JSON.stringify(manifest, null, 2)};\n`,
    bytes: new TextEncoder().encode(output.sprite).length,
    count: icons.length,
  };
}
export function reactSnippet(artifact, name, size = 24, preview = {}) {
  const icon = `    <Icon\n      name=${JSON.stringify(name)}\n      spriteUrl={sprite.url}\n      prefix={sprite.prefix}\n      size={${size}}\n    />`;
  const vars = iconVariables(
    artifact.css,
    name,
    artifact.css?.includes("--all-"),
  );
  const wrapperStyle = Object.fromEntries(vars.map((v) => [v.name, v.value]));
  if (preview.color) wrapperStyle.color = preview.color;
  if (Object.keys(wrapperStyle).length || preview.rotation)
    wrapperStyle.display = "inline-flex";
  if (preview.rotation)
    wrapperStyle.transform = `rotate(${preview.rotation}deg)`;
  const wrapped = Object.keys(wrapperStyle).length
    ? `    <span style={iconStyle} className="my-icon">\n${icon.replace(/^/gm, "  ")}\n    </span>`
    : icon;
  const body = artifact.cssFilename
    ? `    <>\n      {sprite.cssUrl && <link rel="stylesheet" href={sprite.cssUrl} />}\n${wrapped.replace(/^/gm, "  ")}\n    </>`
    : wrapped;
  const instructions = `// 1. Install tiny-isprite and copy public/ + src/generated/ from the bundle.\n// 2. Render <ExampleIcon /> in your app.\n// 3. Change color values in iconStyle below; keep the CSS-variable names.\n// The published Icon accepts className, not style: apply style to the wrapper.\n`;
  const styleDeclaration = Object.keys(wrapperStyle).length
    ? `const iconStyle = ${JSON.stringify(wrapperStyle, null, 2)};\n\n`
    : "";
  return `${instructions}import { Icon } from 'tiny-isprite';\nimport sprite from './generated/sprite.js';\n\n${styleDeclaration}export function ExampleIcon() {\n  return (\n${body}\n  );\n}`;
}
export function download(data, name, type) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportBundle(artifact, icons, options, preview = {}) {
  const files = {};
  const add = (name, value) => {
    files[name] = strToU8(value);
  };
  const publicDirectory = `public${options.publicPath}`;
  add(`${publicDirectory}${artifact.filename}`, artifact.sprite);
  add(`${publicDirectory}sprite.svg`, artifact.sprite);
  add("src/generated/sprite.js", artifact.module);
  add(
    "src/generated/sprite.d.ts",
    "declare const sprite: { url: string; hash: string; prefix: string; cssUrl?: string };\nexport default sprite;\n",
  );
  if (artifact.cssFilename) {
    add(`${publicDirectory}${artifact.cssFilename}`, artifact.css);
    add(`${publicDirectory}icons-vars.css`, artifact.css);
  }
  for (const icon of artifact.sources || icons)
    add(`icons/${icon.name}.svg`, icon.content);
  add(
    "Icon-example.jsx",
    reactSnippet(
      artifact,
      preview.name || icons[0].name,
      preview.size || 24,
      preview,
    ),
  );
  if (preview.theme) {
    add("src/globals.css", preview.theme.css);
    add("src/Theme-example.jsx", preview.theme.jsx);
  }
  const mode =
    options.mode === "original"
      ? " --preserve-colored"
      : options.mode === "variables"
        ? options.allColors
          ? " --all"
          : " --use-css-vars"
        : "";
  add(
    "README.md",
    `# Your tiny-isprite bundle\n\nInstall: npm install tiny-isprite@^2.1.0\n\nCopy public/ and src/generated/ into your application. Use Icon-example.jsx as a component snippet.\n\nRegenerate before each application build:\n\nnpx build-sprite ./icons ./${publicDirectory}sprite.svg --manifest ./src/generated/sprite.js --public-path ${options.publicPath} --prefix "${options.prefix}"${mode}${options.minify ? " --minify" : ""}\n\nAdd --watch for development. Files in icons/ are cleaned SVG sources: scripts, animation, embedded images, style blocks and external references were removed. Root presentation attributes are preserved on a group, and internal IDs are namespaced. Palette colors and stroke-width edits are baked into exported sources, so regeneration keeps your edits.\n\nNew SVG bytes produce a new hashed filename. Deploy the manifest with its assets, retain older hashed assets for open tabs and use the generated URL rather than the mutable sprite.svg alias.\n\nBrowser preview: tiny-isprite 2.1.0 React Icon; generation: shared CLI engine.\n`,
  );
  return zipSync(files, { level: 6 });
}
