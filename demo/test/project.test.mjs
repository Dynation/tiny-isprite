import { test } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import {
  buildProject,
  defaultOptions,
  exportBundle,
  validateOptions,
} from "../src/lib/project.js";

const icons = [
  {
    name: "badge",
    content:
      '<svg viewBox="0 0 24 24"><rect width="24" height="24" fill="red"/></svg>',
  },
];
test("exported asset names depend on bytes; color-only CSS edits update the CSS pointer", async () => {
  const options = { ...defaultOptions, mode: "variables" };
  const first = await buildProject(icons, options);
  const repeat = await buildProject(icons, options);
  assert.deepEqual(first, repeat);
  const recolored = await buildProject(
    [{ ...icons[0], content: icons[0].content.replace("red", "blue") }],
    options,
  );
  assert.equal(first.filename, recolored.filename);
  assert.notEqual(first.cssFilename, recolored.cssFilename);
  assert.notEqual(first.module, recolored.module);
});
test("bundle includes all referenced assets, cleaned sources and the selected React example", async () => {
  const options = {
    ...defaultOptions,
    publicPath: "/assets/",
    prefix: "demo-",
    mode: "variables",
  };
  const artifact = await buildProject(icons, options);
  const zip = unzipSync(
    exportBundle(artifact, icons, options, { name: "badge", size: 48 }),
  );
  assert.ok(zip[`public${artifact.manifest.url}`]);
  assert.ok(zip[`public${artifact.manifest.cssUrl}`]);
  assert.equal(strFromU8(zip["icons/badge.svg"]), icons[0].content);
  assert.ok(
    strFromU8(zip["Icon-example.jsx"]).includes(
      "export function ExampleIcon()",
    ),
  );
  assert.ok(strFromU8(zip["Icon-example.jsx"]).includes("size={48}"));
  assert.ok(zip["src/generated/sprite.d.ts"]);
});
test("invalid paths and prefixes cannot become exported paths or markup", async () => {
  for (const patch of [
    { publicPath: "/../" },
    { publicPath: "https://external.invalid/" },
    { prefix: '\"><script>' },
  ]) {
    assert.ok(validateOptions({ ...defaultOptions, ...patch }));
    await assert.rejects(buildProject(icons, { ...defaultOptions, ...patch }));
  }
});

test("editable palettes expose currentColor strokes and bake independent overrides into exported sources", async () => {
  const { iconVariables } = await import("../src/lib/palette.js");
  const sources = ["heart", "heart-filled"].map((name) => ({
    name,
    content:
      '<svg viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="1.7"><path d="M1 1h20"/></g></svg>',
  }));
  const options = {
    ...defaultOptions,
    mode: "variables",
    editablePalette: true,
    palette: { heart: { "--heart-stroke-1": "#13c38b" } },
  };
  const artifact = await buildProject(sources, options);
  assert.deepEqual(iconVariables(artifact.css, "heart"), [
    { name: "--heart-stroke-1", value: "#13c38b", property: "stroke 1" },
  ]);
  assert.equal(iconVariables(artifact.css, "heart-filled")[0].value, "#245cf3");
  const exported = unzipSync(
    exportBundle(artifact, sources, options, { name: "heart" }),
  );
  assert.match(strFromU8(exported["icons/heart.svg"]), /stroke="#13c38b"/);
  const recreated = await buildProject(artifact.sources, {
    ...options,
    editablePalette: false,
    palette: {},
  });
  assert.equal(recreated.sprite, artifact.sprite);
  assert.equal(recreated.css, artifact.css);
  assert.match(
    strFromU8(exported["Icon-example.jsx"]),
    /<span style=\{iconStyle\}/,
  );
  assert.match(strFromU8(exported["Icon-example.jsx"]), /--heart-stroke-1/);
});

test("multicolor palette and stroke edits preserve regeneration and reject CSS injection", async () => {
  const sources = [
    {
      name: "logo",
      content:
        '<svg viewBox="0 0 400 120"><path fill="red" stroke-width="2"/><path fill="blue"/></svg>',
    },
  ];
  const options = {
    ...defaultOptions,
    mode: "variables",
    editablePalette: true,
    allColors: true,
    strokeWidths: { logo: 3 },
    palette: {
      logo: {
        "--all-logo-fill-1": "#123456",
        "--all-logo-fill-2": "red; background:url(https://evil.invalid)",
      },
    },
  };
  const artifact = await buildProject(sources, options);
  assert.match(artifact.css, /--all-logo-fill-1: #123456/);
  assert.match(artifact.css, /--all-logo-fill-2: blue/);
  assert.doesNotMatch(artifact.css, /evil|background/);
  assert.match(artifact.sources[0].content, /stroke-width="3"/);
  const recreated = await buildProject(artifact.sources, {
    ...options,
    strokeWidths: {},
    palette: {},
  });
  assert.equal(recreated.sprite, artifact.sprite);
  assert.equal(recreated.css, artifact.css);
});

test("single usage explains import, real variable overrides and proportional resizing", async () => {
  const { singleUsageSnippet } = await import("../src/lib/usage.js");
  const snippet = singleUsageSnippet(
    { aspectRatio: 0.3 },
    "logo",
    [{ name: "--logo-fill-1", value: "#123456", property: "fill 1" }],
    "#245cf3",
    512,
  );
  assert.match(snippet, /import \{ ExampleIcon \} from '\.\/logo\.jsx'/);
  assert.match(snippet, /"--logo-fill-1": "#123456"/);
  assert.match(snippet, /style=\{iconColors\}/);
  assert.match(snippet, /height=\{width \* 0\.3\}/);
  const plain = singleUsageSnippet(
    { aspectRatio: 1 },
    "plain",
    [],
    "#245cf3",
    24,
  );
  assert.doesNotMatch(plain, /iconColors|style=\{/);
});

test("theme files connect per-icon variables to global semantic tokens without inline overrides", async () => {
  const { buildThemeExample } = await import("../src/lib/theme.js");
  const artifact = await buildProject(icons, {
    ...defaultOptions,
    mode: "variables",
  });
  const theme = buildThemeExample({
    name: "badge",
    variables: [{ name: "--badge-fill-1", value: "#123456" }],
    color: "#245cf3",
    darkPalette: { "--badge-fill-1": "#f97316" },
    single: false,
    size: 32,
  });
  assert.match(theme.css, /@theme static \{/);
  assert.match(theme.css, /--color-icon-badge-fill-1: #123456/);
  assert.match(theme.css, /\.dark \{[\s\S]*--color-icon-badge-fill-1: #f97316/);
  assert.match(
    theme.jsx,
    /\[--badge-fill-1:var\(--color-icon-badge-fill-1\)\]/,
  );
  assert.doesNotMatch(theme.jsx, /style=/);
  assert.match(theme.jsx, /setDark\(value => !value\)/);
  const zip = unzipSync(
    exportBundle(
      artifact,
      icons,
      { ...defaultOptions, mode: "variables" },
      { theme },
    ),
  );
  assert.equal(strFromU8(zip["src/globals.css"]), theme.css);
  assert.equal(strFromU8(zip["src/Theme-example.jsx"]), theme.jsx);
});
