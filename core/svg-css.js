import { selectAll } from "css-select";
import parse from "css-tree/parser";
import generate from "css-tree/generator";
import walk from "css-tree/walker";

const adapter = {
  isTag: (node) => node?.nodeType === 1,
  getChildren: (node) => Array.from(node.childNodes || []),
  getParent: (node) => node.parentNode,
  getSiblings: (node) =>
    node.parentNode ? Array.from(node.parentNode.childNodes) : [node],
  getName: (node) => node.localName,
  getAttributeValue: (node, name) =>
    node.hasAttribute(name) ? node.getAttribute(name) : undefined,
  hasAttrib: (node, name) => node.hasAttribute(name),
  getText: (node) => node.textContent || "",
  removeSubsets(nodes) {
    return nodes.filter(
      (node) =>
        !nodes.some((parent) => parent !== node && contains(parent, node)),
    );
  },
  existsOne(test, nodes) {
    return nodes.some(
      (node) =>
        adapter.isTag(node) &&
        (test(node) || adapter.existsOne(test, adapter.getChildren(node))),
    );
  },
  findAll(test, nodes) {
    return nodes.flatMap((node) =>
      adapter.isTag(node)
        ? [
            ...(test(node) ? [node] : []),
            ...adapter.findAll(test, adapter.getChildren(node)),
          ]
        : [],
    );
  },
  findOne(test, nodes) {
    for (const node of nodes)
      if (adapter.isTag(node)) {
        if (test(node)) return node;
        const found = adapter.findOne(test, adapter.getChildren(node));
        if (found) return found;
      }
    return null;
  },
};
function contains(parent, child) {
  for (let node = child.parentNode; node; node = node.parentNode)
    if (node === parent) return true;
  return false;
}
const parseCss = (text, context) =>
  parse(text, {
    context,
    parseCustomProperty: true,
    onParseError(error) {
      throw error;
    },
  });
const staticPseudos = new Set([
  "root",
  "empty",
  "first-child",
  "last-child",
  "only-child",
  "first-of-type",
  "last-of-type",
  "only-of-type",
  "nth-child",
  "nth-last-child",
  "nth-of-type",
  "nth-last-of-type",
]);
function specificity(selector) {
  const score = [0, 0, 0, 0];
  walk(selector, function (node) {
    if (node.type === "IdSelector") score[1]++;
    if (["ClassSelector", "AttributeSelector"].includes(node.type)) score[2]++;
    if (node.type === "TypeSelector" && node.name !== "*") score[3]++;
    if (node.type === "PseudoClassSelector") {
      if (["where", "is", "not"].includes(node.name.toLowerCase())) {
        let maximum = [0, 0, 0, 0];
        node.children?.forEach((list) => list.children.forEach((child) => {
          const next = specificity(child);
          if (compare(next, maximum) > 0) maximum = next;
        }));
        if (node.name.toLowerCase() !== "where") maximum.forEach((n, i) => { score[i] += n; });
        return this.skip;
      }
      if (!staticPseudos.has(node.name.toLowerCase()))
        throw new Error(
          `Unsupported dynamic or complex SVG CSS :${node.name}; retain this artwork inline`,
        );
      score[2]++;
    }
    if (
      node.type === "PseudoElementSelector" ||
      node.type === "NestingSelector" ||
      node.type === "Raw"
    )
      throw new Error(
        "Unsupported SVG CSS selector; retain this artwork inline",
      );
  });
  return score;
}
function compare(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// Flatten only self-contained static author CSS. Match the original tree before
// changing IDs or style nodes; retain cascade, !important and inherited values.
export function flattenStyles(root) {
  const nodes = [root, ...Array.from(root.getElementsByTagName("*"))];
  const winners = new Map(nodes.map((node) => [node, new Map()]));
  let order = 0;
  function apply(node, decl, score) {
    if (decl.type !== "Declaration")
      throw new Error("Unsupported SVG CSS declaration");
    const property = decl.property.startsWith("--")
      ? decl.property
      : decl.property.toLowerCase();
    if (
      node === root &&
      [
        "width",
        "min-width",
        "min-height",
        "max-height",
        "x",
        "y",
        "transform",
        "transform-origin",
        "transform-box",
      ].includes(property)
    )
      throw new Error(
        `Unsupported root CSS ${property}; retain this artwork inline`,
      );
    if (
      /^(?:all|font|font-variant|marker|animation|transition|background|border(?:-.+)?|margin|padding|inset|offset)$/.test(
        property,
      )
    )
      throw new Error(
        `Unsupported SVG CSS shorthand ${property}; use longhand properties or retain this artwork inline`,
      );
    const previous = winners.get(node).get(property);
    let value = generate(decl.value);
    // Plot's legacy WebKit fallback has the same intrinsic geometry as auto
    // for the finite, viewBox-matched responsive viewport validated below.
    if (node === root && property === "height" && value === "intrinsic" && previous?.value === "auto") value = "auto";
    const entry = {
      property,
      value,
      important: Boolean(decl.important),
      score,
      order: order++,
    };
    if (
      !previous ||
      Number(entry.important) > Number(previous.important) ||
      (entry.important === previous.important &&
        (compare(entry.score, previous.score) > 0 ||
          (compare(entry.score, previous.score) === 0 &&
            entry.order > previous.order)))
    )
      winners.get(node).set(property, entry);
  }
  for (const style of nodes.filter((node) => node.localName === "style")) {
    const sheet = parseCss(style.textContent, "stylesheet");
    sheet.children.forEach((rule) => {
      if (rule.type !== "Rule" || rule.prelude?.type !== "SelectorList")
        throw new Error(
          `Unsupported SVG CSS ${rule.type === "Atrule" ? "@" + rule.name : "rule"}; retain this artwork inline`,
        );
      rule.prelude.children.forEach((selector) => {
        const score = specificity(selector);
        for (const node of selectAll(generate(selector), [root], {
          xmlMode: true,
          adapter,
        }))
          rule.block.children.forEach((decl) => apply(node, decl, score));
      });
    });
  }
  for (const node of nodes)
    if (node.hasAttribute("style"))
      parseCss(node.getAttribute("style"), "declarationList").children.forEach(
        (decl) => apply(node, decl, [1, 0, 0, 0]),
      );
  // Empty placeholders retain element positions used by structural selectors.
  for (const style of nodes.filter((node) => node.localName === "style"))
    style.textContent = "";
  for (const [node, properties] of winners)
    if (properties.size)
      node.setAttribute(
        "style",
        Array.from(properties.values())
          .sort((a, b) => a.order - b.order)
          .map(
            (d) => `${d.property}:${d.value}${d.important ? "!important" : ""}`,
          )
          .join(";"),
      );
}
