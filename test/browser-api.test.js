import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { buildSpriteContent } from "tiny-isprite/browser";
import { buildSpriteContent as canonical } from "../core/sprite-content.js";

test("public browser API preserves canonical output and bundles without Node built-ins or native DOM globals", async () => {
  const icons = [{ name: "badge.svg", content: '<svg viewBox="0 0 24 24"><path fill="#112233" stroke="#445566" d="M0 0h24v24z"/></svg>' }];
  for (const options of [{}, { preserveColored: true }, { useCssVars: true }, { forceAllVars: true }, { minify: true, prefix: "web-" }]) {
    assert.deepEqual(await buildSpriteContent({ icons, ...options }), await canonical({ icons, ...options }));
  }
  const bundle = await build({ stdin: { contents: 'export { buildSpriteContent } from "tiny-isprite/browser";', resolveDir: process.cwd() }, bundle: true, platform: "browser", format: "esm", write: false, metafile: true });
  // Runtime parsers are bundled; browser entry must still have no Node built-ins.
  assert.ok(bundle.outputFiles[0].text.length > 0);
  assert.ok(Object.values(bundle.metafile.outputs).every(output => output.imports.length === 0));
  const loaded = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  const result = await loaded.buildSpriteContent({ icons, forceAllVars: true });
  assert.match(result.sprite, /var\(--all-badge-fill-1\)/);
  assert.match(result.css, /#112233/);
});
