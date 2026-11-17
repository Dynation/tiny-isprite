import test from "node:test";
import assert from "node:assert/strict";
import { DOMParser } from "@xmldom/xmldom";
import { buildSpriteContent } from "../core/sprite-content.js";

const parse = (text) => new DOMParser().parseFromString(text, "image/svg+xml");
const elements = (node, tag) => Array.from(node.getElementsByTagName(tag));
const one = async (content) =>
  parse(
    (
      await buildSpriteContent({
        icons: [{ name: "sample.svg", content }],
        preserveColored: true,
      })
    ).sprite,
  );

test("root paint, style, transform and aspect ratio survive conversion", async () => {
  const doc = await one(
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".6" transform="translate(1 0)" preserveAspectRatio="none" style="color:purple"><path d="M2 2h18"/></svg>`,
  );
  const root = elements(doc, "symbol")[0].getElementsByTagName("svg")[0];
  assert.ok(root, "retain an inner svg to preserve root CSS selectors");
  for (const [name, value] of Object.entries({
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    opacity: ".6",
    preserveAspectRatio: "none",
  }))
    assert.equal(root.getAttribute(name), value);
  assert.match(root.getAttribute("style"), /color:purple/);
  assert.equal(root.getAttribute("width"), "100%");
  assert.equal(
    elements(doc, "symbol")[0]
      .getElementsByTagName("g")[0]
      .getAttribute("transform"),
    "translate(1 0)",
  );
});

test("comma, whitespace and exponent viewBox numbers are normalized; invalid values reject", async () => {
  const doc = await one(
    `<svg viewBox='0, 0, 4e2,119.35483870967742'><path/></svg>`,
  );
  assert.equal(
    elements(doc, "symbol")[0]
      .getElementsByTagName("svg")[0]
      .getAttribute("viewBox"),
    "0 0 400 119.35483870967742",
  );
  for (const box of [
    "0 0 24",
    "0 0 nope 24",
    "0 0 -1 24",
    "0 0 0 24",
    "0 0 1e999 24",
  ]) {
    await assert.rejects(
      one(`<svg viewBox="${box}"><path/></svg>`),
      /sample.svg.*viewBox/,
    );
  }
});

test("internal IDs and all local references are isolated between symbols", async () => {
  const content = `<svg viewBox="0 0 24 24" aria-labelledby="title desc"><title id="title">Icon</title><desc id="desc">Details</desc><defs><linearGradient id="paint"><stop stop-color="red"/></linearGradient><clipPath id="crop"><rect id="shape" width="20" height="20"/></clipPath></defs><rect fill="url('#paint')" clip-path="url(#crop)" width="24" height="24"/><use href="#shape"/><use xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="#shape"/></svg>`;
  const doc = parse(
    (
      await buildSpriteContent({
        icons: [
          { name: "a.svg", content },
          { name: "b.svg", content },
        ],
      })
    ).sprite,
  );
  const all = elements(doc, "*");
  const ids = all
    .filter((e) => e.hasAttribute("id"))
    .map((e) => e.getAttribute("id"));
  assert.equal(new Set(ids).size, ids.length);
  for (const symbol of elements(doc, "symbol")) {
    const localIds = new Set(
      elements(symbol, "*")
        .filter((e) => e.hasAttribute("id"))
        .map((e) => e.getAttribute("id")),
    );
    for (const el of elements(symbol, "*"))
      for (const attr of Array.from(el.attributes)) {
        if (attr.localName === "href")
          assert.ok(ids.includes(attr.value.slice(1)));
        for (const match of attr.value.matchAll(
          /url\(["']?#([^)'"\s]+)["']?\)/g,
        ))
          assert.ok(ids.includes(match[1]));
        if (attr.name === "aria-labelledby")
          for (const id of attr.value.split(/\s+/)) assert.ok(localIds.has(id));
      }
  }
});

test("static selectors are resolved before ID and CSS URL rewriting", async () => {
  const doc = await one(
    `<svg id="art" viewBox="0 0 24 24"><style>svg > path {fill:#123456} :root{color:green} #p\\:1, [id="p:1"] {clip-path:url(#crop)} .mark{stroke:purple}</style><defs><clipPath id="crop"><circle r="5"/></clipPath></defs><path id="p:1" class="mark" d="M0 0h24v24z"/></svg>`,
  );
  assert.equal(elements(doc, "style")[0].textContent, "");
  const path = elements(doc, "path")[0];
  assert.match(path.getAttribute("style"), /fill:#123456/);
  assert.match(path.getAttribute("style"), /stroke:purple/);
  assert.doesNotMatch(path.getAttribute("style"), /url\(#crop\)/);
  assert.equal(
    elements(doc, "path")[0].getAttribute("id").includes("p:1"),
    false,
  );
});

test("CSS style paint participates in color modes without treating URL paint as a color", async () => {
  const result = await buildSpriteContent({
    icons: [
      {
        name: "root.svg",
        content: `<svg viewBox="0 0 24 24" style="fill:#123456;stroke:#abcdef"><path d="M0 0h20v20z"/></svg>`,
      },
    ],
    forceAllVars: true,
  });
  assert.match(result.sprite, /var\(--all-root-fill-1,#123456\)/);
  assert.match(result.sprite, /var\(--all-root-stroke-1,#abcdef\)/);
  assert.match(result.css, /--all-root-fill-1: #123456/);
});

test("unsupported CSS, duplicate IDs, malformed XML and duplicate symbol names fail with the source name", async () => {
  for (const content of [
    "<svg><style>@keyframes spin {to{opacity:0}}</style><path/></svg>",
    '<svg><path id="x"/><path id="x"/></svg>',
    "<svg><path></svg>",
  ])
    await assert.rejects(one(content), /sample.svg/);
  await assert.rejects(
    buildSpriteContent({
      icons: [
        { name: "a.svg", content: "<svg/>" },
        { name: "a.svg", content: "<svg/>" },
      ],
    }),
    /duplicate/i,
  );
});

test("static CSS preserves specificity, source order, inline styles and important", async () => {
  const doc = await one(
    `<svg><style>#p{fill:blue}.mark{fill:red!important}.mark{stroke:red;stroke:blue}path{opacity:.4}</style><path id="p" class="mark" style="fill:green;opacity:.8"/><path id="q" class="mark" style="fill:gold!important"/></svg>`,
  );
  const [p, q] = elements(doc, "path");
  assert.match(p.getAttribute("style"), /fill:red!important/);
  assert.match(p.getAttribute("style"), /stroke:blue/);
  assert.match(p.getAttribute("style"), /opacity:\.8/);
  assert.match(q.getAttribute("style"), /fill:gold!important/);
});

test("unsupported dynamic selectors, responsive CSS, shorthands and root CSS sizing fail explicitly", async () => {
  for (const rule of [
    "path:hover{fill:red}",
    "@media(min-width:40px){path{fill:red}}",
    "path{font:16px serif}",
    "svg{width:500px}",
  ]) {
    await assert.rejects(
      one(`<svg><style>${rule}</style><path/></svg>`),
      /sample.svg.*Unsupported/,
    );
  }
});

test("external target refuses paint servers while inline target preserves them", async () => {
  const icons = [
    {
      name: "paint.svg",
      content:
        '<svg><defs><linearGradient id="paint"><stop stop-color="red"/></linearGradient></defs><path fill="url(#paint)"/></svg>',
    },
  ];
  await assert.rejects(
    buildSpriteContent({ icons, target: "external" }),
    /paint.svg.*inline sprite/,
  );
  assert.match(
    (await buildSpriteContent({ icons, target: "inline" })).sprite,
    /url\(#icon-paint--id-/,
  );
});

test("minification does not collapse significant SVG text whitespace", async () => {
  const content = '<svg><text xml:space="preserve">A  B\n C</text></svg>';
  for (const minify of [false, true])
    assert.match(
      (
        await buildSpriteContent({
          icons: [{ name: "text.svg", content }],
          minify,
        })
      ).sprite,
      /A  B\n C/,
    );
});

test("legacy CSS helper still converts all explicitly requested colors and single quoted attributes", async () => {
  const { processSvgWithCssVars } = await import(
    "../core/generate-css-vars.js"
  );
  const variables = new Set();
  const result = await processSvgWithCssVars(
    "<path fill='red'/><path fill='blue'/>",
    "legacy",
    variables,
  );
  assert.match(result, /--legacy-fill-1/);
  assert.match(result, /--legacy-fill-2/);
  assert.equal(variables.size, 2);
});
