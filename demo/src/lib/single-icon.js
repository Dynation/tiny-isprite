import { prepareIcons } from "./palette.js";
import { buildSpriteContent } from "./sprite-content.js";

// Input has already passed through the playground's SVG sanitizer.
export async function buildSingleIcon(icon, options, size = 24) {
  const output = await buildSpriteContent({
    icons: [
      {
        name: `${icon.name}.svg`,
        content: prepareIcons([icon], options)[0].content,
      },
    ],
    prefix: "icon-",
    minify: options.minify,
    preserveColored: options.mode === "original",
    useCssVars: options.mode === "variables",
    forceAllVars: options.mode === "variables" && options.allColors,
  });
  const doc = new DOMParser().parseFromString(output.sprite, "image/svg+xml");
  const symbol = doc.querySelector("symbol");
  const root = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  root.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  root.setAttribute("viewBox", symbol.getAttribute("viewBox"));
  root.setAttribute("width", String(size));
  const viewBox = root.getAttribute("viewBox").split(/\s+/).map(Number);
  const height = Number(((size * viewBox[3]) / viewBox[2]).toFixed(3));
  root.setAttribute("height", String(height));
  if (options.exportColor) root.setAttribute("color", options.exportColor);
  if (options.rotation) {
    const [x, y, w, h] = root.getAttribute("viewBox").split(/\s+/).map(Number);
    const group = doc.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute(
      "transform",
      `rotate(${options.rotation} ${x + w / 2} ${y + h / 2})`,
    );
    while (symbol.firstChild) group.appendChild(symbol.firstChild);
    symbol.appendChild(group);
  }
  while (symbol.firstChild) root.appendChild(symbol.firstChild);
  const defaults = new Map(
    [...(output.css || "").matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)].map(
      (m) => [m[1], m[2].trim()],
    ),
  );
  for (const el of root.querySelectorAll("*")) {
    for (const attr of [...el.attributes]) {
      attr.value = attr.value.replace(/var\((--[\w-]+)\)/g, (match, key) =>
        defaults.has(key) ? `var(${key}, ${defaults.get(key)})` : match,
      );
    }
  }
  const ids = [...root.querySelectorAll("[id]")].map((el) => el.id);
  const jsxName = (name) =>
    ({
      class: "className",
      "xlink:href": "xlinkHref",
      "xml:space": "xmlSpace",
      "xmlns:xlink": "xmlnsXlink",
    })[name] ||
    (/^(aria|data)-/.test(name)
      ? name
      : name.replace(/-([a-z])/g, (_, c) => c.toUpperCase()));
  function value(attr) {
    const index = ids.findIndex(
      (id) =>
        (attr.value === id && attr.name === "id") ||
        (attr.value === `#${id}` && /href$/.test(attr.name)) ||
        attr.value === `url(#${id})`,
    );
    if (index < 0) return JSON.stringify(attr.value);
    const id = ids[index];
    const replacement = `iconId + ${JSON.stringify(`-${index}`)}`;
    if (attr.name === "id") return replacement;
    if (attr.value === `#${id}`) return `"#" + ${replacement}`;
    return `"url(#" + ${replacement} + ")"`;
  }
  function jsx(node, depth = 2) {
    const indent = "  ".repeat(depth);
    if (node.nodeType === 3)
      return node.textContent.trim()
        ? `${indent}{${JSON.stringify(node.textContent)}}`
        : "";
    if (node.nodeType !== 1) return "";
    const attrs = [...node.attributes]
      .filter((a) => a.name !== "xmlns")
      .map((a) => `${jsxName(a.name)}={${value(a)}}`)
      .join(" ");
    const children = [...node.childNodes]
      .map((child) => jsx(child, depth + 1))
      .filter(Boolean);
    const extra = node === root ? " {...props}" : "";
    return children.length
      ? `${indent}<${node.localName}${attrs ? " " + attrs : ""}${extra}>\n${children.join("\n")}\n${indent}</${node.localName}>`
      : `${indent}<${node.localName}${attrs ? " " + attrs : ""}${extra} />`;
  }
  const component = `${ids.length ? '"use client";\n\nimport { useId } from "react";\n\n' : ""}export function ExampleIcon(props) {\n${ids.length ? "  const iconId = useId();\n" : ""}  return (\n${jsx(root)}\n  );\n}\n`;
  return {
    height,
    aspectRatio: viewBox[3] / viewBox[2],
    svg: new XMLSerializer().serializeToString(root),
    component,
    filename: `${icon.name}.svg`,
    componentFilename: `${icon.name}.jsx`,
  };
}
