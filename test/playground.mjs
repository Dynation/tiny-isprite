import { transformSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { freePort, poll, stop } from "./helpers.mjs";
import { generateSprite } from "../demo/node_modules/tiny-isprite/core/generate-sprite.js";
const { unzipSync, strFromU8 } = createRequire(
  new URL("../demo/package.json", import.meta.url),
)("fflate");
const repo = fileURLToPath(new URL("../", import.meta.url));
const artifacts = path.join(repo, ".release-artifacts/playground");
await mkdir(artifacts, { recursive: true });
const temp = await mkdtemp(path.join(tmpdir(), "tiny-isprite-playground-"));
let server;
let serverLog = "";
let browser;
try {
  let url = process.env.PLAYGROUND_URL;
  if (!url) {
    const port = await freePort();
    server = spawn(
      process.execPath,
      [
        path.join(repo, "demo/node_modules/vite/bin/vite.js"),
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--strictPort",
      ],
      { cwd: path.join(repo, "demo"), stdio: ["ignore", "pipe", "pipe"] },
    );
    server.stdout.on("data", (data) => {
      serverLog += data;
    });
    server.stderr.on("data", (data) => {
      serverLog += data;
    });
    url = `http://127.0.0.1:${port}`;
    await poll(async () => {
      try {
        return (await fetch(url)).ok;
      } catch {
        return false;
      }
    }, "playground preview");
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
    acceptDownloads: true,
  });
  const errors = [],
    requests = [],
    dialogs = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/evil\.invalid/.test(request.url()) || request.method() === "POST")
      requests.push(request.url());
  });
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.goto(url);
  const exportButton = page.getByRole("button", {
    name: "Download bundle",
    exact: true,
  });
  const ready = () =>
    poll(() => exportButton.isEnabled(), "generated artifact");
  await ready();
  assert.equal(await page.locator(".icon-card").count(), 12);
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".icon-card use")].every(
      (element) => element.getBBox().width > 0,
    ),
  );
  console.log(
    "PASS actual React component renders all twelve external SVG symbols",
  );
  await page.getByRole("textbox", { name: "Search icons" }).fill("heart");
  assert.equal(await page.locator(".icon-card").count(), 1);
  await page.getByRole("textbox", { name: "Search icons" }).fill("");
  const firstHref = await page
    .locator(".icon-card use")
    .first()
    .getAttribute("href");
  await page.getByLabel("Symbol prefix", { exact: true }).fill("demo-");
  await ready();
  assert.match(
    await page.locator(".icon-card use").first().getAttribute("href"),
    /#demo-arrow-up-right$/,
  );
  assert.notEqual(
    await page.locator(".icon-card use").first().getAttribute("href"),
    firstHref,
  );
  await page.getByLabel("Asset path", { exact: true }).fill("/assets/");
  await ready();
  await page.getByLabel("Preview color", { exact: true }).fill("#d83868");
  await page.getByRole("slider", { name: /Size/ }).focus();
  await page.getByRole("slider", { name: /Size/ }).press("End");
  assert.ok(
    (await page.locator("#code-output").textContent()).includes("size={64}"),
  );
  await page.getByRole("tab", { name: "Manifest", exact: true }).click();
  const firstModule = await page.locator("#code-output").textContent();
  const firstManifest = JSON.parse(
    firstModule.match(/export default ([\s\S]*);/)[1],
  );
  await page.getByRole("checkbox", { name: /Minify output/ }).uncheck();
  await ready();
  const secondManifest = JSON.parse(
    (await page.locator("#code-output").textContent()).match(
      /export default ([\s\S]*);/,
    )[1],
  );
  assert.notEqual(firstManifest.hash, secondManifest.hash);
  assert.match(secondManifest.url, /^\/assets\/sprite\.[a-f0-9]{20}\.svg$/);
  console.log(
    "PASS search, prefix, public path, preview color/size and content-hash updates",
  );
  const unsafe = `<svg viewBox="0 0 24 24" fill="#ef4444" onload="window.svgExecuted=true"><script>window.svgExecuted=true</script><style>body{display:none}</style><image href="https://evil.invalid/image.svg"/><foreignObject><iframe src="https://evil.invalid/"></iframe></foreignObject><rect width="20" height="20"/></svg>`;
  const gradient = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="color"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><rect width="24" height="24" fill="url(#color)"/></svg>`;
  await page.getByLabel("Upload SVG files", { exact: true }).setInputFiles([
    {
      name: "badge.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(unsafe),
    },
    {
      name: "gradient.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(gradient),
    },
  ]);
  await ready();
  await poll(
    async () => (await page.locator(".icon-card").count()) === 14,
    "SVG uploads",
  );
  await page.getByLabel("Upload SVG files", { exact: true }).setInputFiles({
    name: "badge.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg viewBox="0 0 24 24"><circle fill="red" cx="12" cy="12" r="8"/></svg>',
    ),
  });
  await ready();
  await poll(
    async () => (await page.locator(".icon-card").count()) === 15,
    "duplicate name upload",
  );
  assert.ok(
    await page
      .getByRole("button", { name: "Remove badge-2", exact: true })
      .count(),
  );
  await page.getByLabel("Upload SVG files", { exact: true }).setInputFiles({
    name: "broken.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg><broken>"),
  });
  await poll(
    async () =>
      (await page.locator(".notice").textContent()).includes("Not a valid SVG"),
    "invalid SVG rejection",
  );
  assert.equal(await page.locator(".icon-card").count(), 15);
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(
      new File(
        ['<svg viewBox="0 0 24 24"><rect width="24" height="24"/></svg>'],
        "dropped.svg",
        { type: "image/svg+xml" },
      ),
    );
    return data;
  });
  await page
    .locator(".icon-canvas")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await poll(
    async () => (await page.locator(".icon-card").count()) === 16,
    "drag and drop upload",
  );
  await ready();
  await page.getByLabel("Upload SVG files", { exact: true }).setInputFiles({
    name: "oversized.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.alloc(129 * 1024, 32),
  });
  await poll(
    async () =>
      (await page.locator(".notice").textContent()).includes("exceeds 128 KB"),
    "oversized SVG rejection",
  );
  assert.equal(await page.evaluate(() => window.svgExecuted), undefined);
  assert.deepEqual(requests, []);
  assert.deepEqual(dialogs, []);
  await page.getByRole("radio", { name: /Generate CSS variables/ }).check();
  await ready();
  await page.getByRole("checkbox", { name: /Minify output/ }).check();
  await ready();
  const selectedBeforeExport = await page
    .locator(".icon-card.selected .icon-select > span")
    .textContent();
  const nextDownload = page.waitForEvent("download");
  await exportButton.click();
  const bundle = await nextDownload;
  const bundlePath = path.join(artifacts, "test-bundle.zip");
  await bundle.saveAs(bundlePath);
  const zipped = unzipSync(new Uint8Array(await readFile(bundlePath)));
  const module = strFromU8(zipped["src/generated/sprite.js"]);
  const manifest = JSON.parse(module.match(/export default ([\s\S]*);/)[1]);
  assert.equal(manifest.prefix, "demo-");
  assert.ok(zipped[`public${manifest.url}`]);
  assert.ok(zipped[`public${manifest.cssUrl}`]);
  const sprite = strFromU8(zipped[`public${manifest.url}`]);
  assert.doesNotMatch(
    sprite,
    /<script|<style|foreignObject|onload=|evil\.invalid|<image/i,
  );
  assert.match(sprite, /gradient-source-0/);
  assert.ok(
    strFromU8(zipped["Icon-example.jsx"]).includes(
      `name="${selectedBeforeExport}"`,
    ),
  );
  assert.ok(strFromU8(zipped["Icon-example.jsx"]).includes("size={64}"));
  // Exported sources reproduce the same bytes through the real published CLI engine.
  const srcDir = path.join(temp, "icons");
  await mkdir(srcDir);
  for (const [filename, bytes] of Object.entries(zipped)) {
    if (filename.startsWith("icons/"))
      await writeFile(path.join(temp, filename), bytes);
  }
  const result = await generateSprite({
    srcDir,
    outputFile: path.join(temp, "public/assets/sprite.svg"),
    prefix: "demo-",
    useCssVars: true,
    minify: true,
    publicPath: "/assets/",
  });
  assert.equal(
    await readFile(path.join(temp, "public/assets/sprite.svg"), "utf8"),
    sprite,
  );
  assert.deepEqual(result, manifest);
  console.log(
    "PASS upload cleanup, root attribute preservation, local gradients, duplicates and ZIP export reproduce published CLI bytes",
  );
  // Single output is independent of sprite settings and a package install.
  await page.getByLabel("Asset path", { exact: true }).fill("../unsafe/");
  await page.getByRole("radio", { name: "Single icon", exact: true }).check();
  const singleReady = () =>
    poll(
      () =>
        page
          .getByRole("button", {
            name: "Download React component",
            exact: true,
          })
          .isEnabled(),
      "single icon output",
    );
  await singleReady();
  await page
    .locator(".icon-select")
    .filter({ hasText: /^gradient$/ })
    .click();
  await singleReady();
  const component = await page.locator("#code-output").textContent();
  assert.doesNotMatch(component, /tiny-isprite|sprite\.url|<symbol/);
  assert.match(component, /useId/);
  const compiled = transformSync(component, {
    loader: "jsx",
    jsx: "automatic",
    format: "cjs",
  }).code;
  const compiledModule = { exports: {} };
  new Function("module", "exports", "require", compiled)(
    compiledModule,
    compiledModule.exports,
    createRequire(import.meta.url),
  );
  const Generated = compiledModule.exports.ExampleIcon;
  const markup = renderToStaticMarkup(
    React.createElement(
      "div",
      null,
      React.createElement(Generated),
      React.createElement(Generated),
    ),
  );
  const idValues = [...markup.matchAll(/ id="([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.equal(idValues.length, 2);
  assert.equal(new Set(idValues).size, 2);
  for (const id of idValues) assert.ok(markup.includes(`url(#${id})`));
  await page.getByRole("tab", { name: "Inline SVG", exact: true }).click();
  let standalone = await page.locator("#code-output").textContent();
  assert.match(standalone, /^<svg/);
  assert.match(standalone, /width="64"/);
  assert.doesNotMatch(standalone, /<symbol|display:none|sprite\./);
  await page
    .locator(".icon-select")
    .filter({ hasText: /^badge$/ })
    .click();
  await singleReady();
  standalone = await page.locator("#code-output").textContent();
  assert.match(standalone, /var\(--badge-fill-1, #ef4444\)/);
  assert.doesNotMatch(standalone, /onload|script|foreignObject|evil\.invalid/);
  await page.getByRole("radio", { name: /Keep original colors/ }).check();
  await singleReady();
  assert.match(
    await page.locator("#code-output").textContent(),
    /fill="#ef4444"/,
  );
  await page.getByRole("radio", { name: /Use currentColor/ }).check();
  await singleReady();
  assert.match(
    await page.locator("#code-output").textContent(),
    /fill="currentColor"/,
  );
  const svgDownloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download standalone SVG/ }).click();
  const svgDownload = await svgDownloadEvent.catch((error) => {
    console.error({ errors, url: page.url() });
    throw error;
  });
  assert.equal(svgDownload.suggestedFilename(), "badge.svg");
  await svgDownload.saveAs(path.join(artifacts, "badge.svg"));
  assert.equal(
    await readFile(path.join(artifacts, "badge.svg"), "utf8"),
    await page.locator("#code-output").textContent(),
  );
  await page.screenshot({
    path: path.join(artifacts, "single-icon.png"),
    fullPage: true,
  });
  await page.getByRole("radio", { name: "Sprite", exact: true }).check();
  console.log(
    "PASS standalone SVG/React export, color fallbacks, safe cleanup, unique React instance IDs and sprite mode recovery",
  );
  await page.getByLabel("Asset path", { exact: true }).fill("../unsafe/");
  await poll(
    async () => !(await exportButton.isEnabled()),
    "invalid path disables stale export",
  );
  await page.getByLabel("Asset path", { exact: true }).fill("/");
  await ready();
  const currentNames = await page
    .locator(".remove-icon")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("aria-label")),
    );
  for (const name of currentNames)
    await page.getByRole("button", { name, exact: true }).click();
  assert.equal(await page.locator(".icon-card").count(), 0);
  assert.equal(await exportButton.isEnabled(), false);
  await page.getByRole("button", { name: "Load samples", exact: true }).click();
  await ready();
  assert.equal(await page.locator(".icon-card").count(), 12);
  console.log(
    "PASS invalid options cannot export stale artifacts; empty-state and sample recovery",
  );
  await page.getByRole("radio", { name: /Use currentColor/ }).check();
  await ready();
  await page.getByRole("tab", { name: "React usage", exact: true }).click();
  await page.screenshot({
    path: path.join(artifacts, "desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: path.join(artifacts, "mobile.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS desktop/mobile layout; no script execution, external SVG requests or browser errors",
  );
} finally {
  await browser?.close();
  await stop(server);
  await rm(temp, { recursive: true, force: true });
}
