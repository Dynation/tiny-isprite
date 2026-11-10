import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { buildSpriteContent } from "../core/sprite-content.js";
import { generateSprite } from "../core/generate-sprite.js";

test("browser generation mirrors CLI bytes, CSS, ordering and hashes for every exposed color mode", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "tiny-isprite-engine-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const srcDir = path.join(root, "icons");
  await mkdir(srcDir);
  const icons = [
    {
      name: "z.svg",
      content:
        '<svg viewBox="0 0 32 32"><path fill="#123456" stroke="#fedcba" d="M0 0h20v20z"/></svg>',
    },
    {
      name: "a.svg",
      content:
        '<svg><circle fill="red" r="10"/><path fill="blue" d="M1 1h2v2z"/></svg>',
    },
  ];
  for (const icon of icons)
    await writeFile(path.join(srcDir, icon.name), icon.content);
  for (const options of [
    {},
    { preserveColored: true },
    { useCssVars: true },
    { forceAllVars: true },
    { minify: true, prefix: "custom-" },
  ]) {
    const browser = await buildSpriteContent({ icons, ...options });
    const outputFile = path.join(root, "public/sprite.svg");
    const manifest = await generateSprite({ srcDir, outputFile, ...options });
    assert.equal(await readFile(outputFile, "utf8"), browser.sprite);
    assert.equal(
      manifest.hash,
      createHash("sha256").update(browser.sprite).digest("hex").slice(0, 20),
    );
    if (browser.css !== undefined)
      assert.equal(
        await readFile(path.join(root, "public/icons-vars.css"), "utf8"),
        browser.css,
      );
  }
});

test("standalone playground mirror is an exact generated copy of the shared engine", async () => {
  const canonical = await readFile(
    new URL("../core/sprite-content.js", import.meta.url),
    "utf8",
  );
  const mirror = await readFile(
    new URL("../demo/src/lib/sprite-content.js", import.meta.url),
    "utf8",
  );
  assert.equal(mirror.split("\n").slice(1).join("\n"), canonical);
});
