// XML/CSS parsing is shared by Node and the browser entry; no browser globals.
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import parse from "css-tree/parser";
import generate from "css-tree/generator";
import walk from "css-tree/walker";
import { ident } from "css-tree/utils";
import { flattenStyles } from "./svg-css.js";

const SVG = "http://www.w3.org/2000/svg";
const serializer = new XMLSerializer();
export const serialize = (node) => serializer.serializeToString(node);
export const descendants = (root) => [
  root,
  ...Array.from(root.getElementsByTagName("*")),
];
const encoded = (value) =>
  Array.from(value, (c) => c.codePointAt(0).toString(16)).join("-");

function css(source, context) {
  return parse(source, {
    context,
    parseCustomProperty: true,
    onParseError(error) {
      throw error;
    },
  });
}

export function parseSvg(content) {
  const doc = new DOMParser({
    onError(level, message) {
      throw new Error(`Invalid SVG XML: ${message}`);
    },
  }).parseFromString(content, "image/svg+xml");
  if (
    doc.documentElement?.localName !== "svg" ||
    doc.documentElement.namespaceURI !== SVG
  ) {
    throw new Error("Expected one SVG root element");
  }
  if (doc.doctype?.internalSubset)
    throw new Error("SVG internal DTD subsets are unsupported");
  return doc.documentElement;
}

function viewBox(root) {
  if (!root.hasAttribute("viewBox")) return "0 0 24 24";
  const value = root.getAttribute("viewBox").trim();
  const number = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";
  const separator = "(?:\\s*,\\s*|\\s+)";
  if (!new RegExp(`^${number}(?:${separator}${number}){3}$`).test(value)) {
    throw new Error(`Invalid viewBox: ${value}`);
  }
  const values = value.split(/[\s,]+/).map(Number);
  if (!values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0) {
    throw new Error(`Invalid viewBox: ${value}`);
  }
  return values.join(" ");
}

export function prepareSvg(root, symbolId, { target = "inline" } = {}) {
  const nodes = descendants(root);
  const ids = new Map();
  for (const node of nodes) {
    if (
      [
        "animate",
        "animateTransform",
        "animateMotion",
        "set",
        "foreignObject",
        "script",
      ].includes(node.localName)
    ) {
      throw new Error(
        `Unsupported SVG element <${node.localName}>; retain this artwork inline`,
      );
    }
    if (node.hasAttribute("id")) {
      const old = node.getAttribute("id");
      if (!old || ids.has(old))
        throw new Error(`Duplicate or empty SVG ID: ${old}`);
      ids.set(old, `${symbolId}--id-${encoded(old)}`);
    }
  }
  flattenStyles(root);
  const box = viewBox(root);
  let viewport;
  if (root.hasAttribute("style")) {
    const styles = css(root.getAttribute("style"), "declarationList");
    const layout = new Map();
    let display, layoutImportant = false;
    styles.children.forEach((decl) => {
      if (decl.property === "display") display = generate(decl.value);
      if (["height", "max-width", "display"].includes(decl.property) && decl.important) layoutImportant = true;
      if (["height", "max-width"].includes(decl.property)) layout.set(decl.property, generate(decl.value));
    });
    if (layout.size) {
      const dimension = (name) => {
        const text = root.getAttribute(name) || "";
        return /^(?:\d+(?:\.\d*)?|\.\d+)(?:px)?$/.test(text) ? parseFloat(text) : NaN;
      };
      const width = dimension("width"), height = dimension("height");
      const bounds = box.split(" ").map(Number);
      if (layout.get("height") !== "auto" || layout.get("max-width") !== "100%" || display !== "block" || layoutImportant ||
        !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
        Math.abs(width / height - bounds[2] / bounds[3]) > 1e-9 ||
        ["transform", "x", "y"].some((name) => root.hasAttribute(name)))
        throw new Error("Unsupported root CSS viewport; expected height:auto, max-width:100% and finite dimensions matching viewBox");
      if (target === "external") throw new Error("Responsive root CSS requires an inline viewport; generate an inline sprite");
      viewport = { width, height };
      styles.children.forEach((decl, item) => {
        if (["height", "max-width"].includes(decl.property)) styles.children.remove(item);
      });
      const value = generate(styles);
      if (value) root.setAttribute("style", value); else root.removeAttribute("style");
    }
  }
  const scopeId = `scope--${encoded(symbolId)}`;
  const rootId = root.hasAttribute("id")
    ? ids.get(root.getAttribute("id"))
    : `${scopeId}--root`;
  const resolve = (id) => {
    if (!ids.has(id)) throw new Error(`Unresolved local SVG reference: #${id}`);
    return ids.get(id);
  };
  const reference = (value) =>
    value.startsWith("#")
      ? `#${resolve(decodeURIComponent(value.slice(1)))}`
      : value;
  const rewrite = (ast) =>
    walk(ast, function (node) {
      if (node.type === "Raw" || node.type === "NestingSelector")
        throw new Error("Unsupported or unparsed SVG CSS");
      if (node.type === "Url") {
        if (target === "external")
          throw new Error(
            "Paint-server URL references are not portable in external SVG use; generate an inline sprite",
          );
        node.value = reference(
          node.value.startsWith("#") ? ident.decode(node.value) : node.value,
        );
      }
    });
  for (const node of nodes) {
    for (const attr of Array.from(node.attributes)) {
      if (attr.localName === "id") node.setAttribute("id", ids.get(attr.value));
      else if (attr.localName === "href") attr.value = reference(attr.value);
      else if (["aria-labelledby", "aria-describedby"].includes(attr.name)) {
        attr.value = attr.value.trim().split(/\s+/).map(resolve).join(" ");
      } else if (attr.name === "style") {
        const ast = css(attr.value, "declarationList");
        rewrite(ast);
        attr.value = generate(ast);
      } else if (/url\s*\(/i.test(attr.value)) {
        const ast = css(attr.value, "value");
        rewrite(ast);
        attr.value = generate(ast);
      }
    }
  }

  root.setAttribute("id", rootId);
  root.setAttribute("viewBox", box);
  // The retained SVG owns the viewport and preserves inherited paint;
  // inherited paint and transforms; source pixel dimensions must not clip it.
  root.setAttribute("width", "100%");
  root.setAttribute("height", "100%");
  const doc = root.ownerDocument;
  const symbol = doc.createElementNS(SVG, "symbol");
  symbol.setAttribute("id", symbolId);
  // The consuming inline adapter applies layout to its outer visible SVG;
  // the retained inner SVG continues to own the source coordinate system.
  if (viewport) symbol.setAttribute("data-isprite-viewport", JSON.stringify(viewport));
  // Keep viewport mapping on the retained root: root transforms use the
  // instance viewport, not coordinates scaled a second time by the symbol.

  const scope = doc.createElementNS(SVG, "g");
  scope.setAttribute("id", scopeId);
  // A root transform operates in the instance viewport. Applying it to a
  // nested SVG is ignored by WebKit; the outer group preserves that frame.
  if (root.hasAttribute("transform")) {
    scope.setAttribute("transform", root.getAttribute("transform"));
    root.removeAttribute("transform");
  }
  scope.appendChild(root);
  symbol.appendChild(scope);
  return symbol;
}

function candidates(root) {
  const paint = [];
  const sheets = [];
  function declarations(ast) {
    walk(ast, {
      visit: "Declaration",
      enter(decl) {
        if (["fill", "stroke"].includes(decl.property.toLowerCase())) {
          paint.push({
            prop: decl.property.toLowerCase(),
            value: generate(decl.value),
            set(value) {
              decl.value = css(value, "value");
            },
          });
        }
      },
    });
  }
  for (const node of descendants(root)) {
    for (const attr of Array.from(node.attributes)) {
      if (["fill", "stroke"].includes(attr.name))
        paint.push({
          prop: attr.name,
          value: attr.value,
          set(value) {
            attr.value = value;
          },
        });
      if (attr.name === "style") {
        const ast = css(attr.value, "declarationList");
        declarations(ast);
        sheets.push(() => {
          attr.value = generate(ast);
        });
      }
    }
    if (node.localName === "style") {
      const ast = css(node.textContent, "stylesheet");
      declarations(ast);
      sheets.push(() => {
        node.textContent = generate(ast);
      });
    }
  }
  return {
    paint,
    flush() {
      for (const write of sheets) write();
    },
  };
}
const fixed = (value) =>
  !/^(?:none|currentcolor|inherit|initial|unset|revert(?:-layer)?|context-fill|context-stroke)$/i.test(
    value.trim(),
  ) && !/\b(?:url|var)\s*\(/i.test(value);

export function recolor(
  root,
  iconId,
  variables,
  {
    preserveColored = false,
    useCssVars = false,
    forceAllVars = false,
    convertAll = false,
  } = {},
) {
  const { paint, flush } = candidates(root);
  const multi =
    new Set(
      paint
        .filter((p) => p.prop === "fill" && fixed(p.value))
        .map((p) => p.value),
    ).size > 1;
  const counters = { fill: 1, stroke: 1 };
  for (const p of paint) {
    if (!fixed(p.value)) continue;
    if (convertAll || forceAllVars || (useCssVars && !multi)) {
      const name = ident.encode(
        `--${forceAllVars ? "all-" : ""}${iconId}-${p.prop}-${counters[p.prop]++}`,
      );
      variables.add(`  ${name}: ${p.value};`);
      p.set(`var(${name})`);
    } else if (!multi && !preserveColored && p.prop === "fill")
      p.set("currentColor");
  }
  flush();
}
