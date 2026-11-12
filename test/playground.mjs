import { samples } from "../demo/src/samples.js";
import { transformSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile as compileTailwind } from "../demo/node_modules/@tailwindcss/node/dist/index.mjs";
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
    url = `http://127.0.0.1:${port}${process.env.VITE_BASE_PATH || "/"}`;
    await poll(async () => {
      try {
        return (await fetch(url)).ok;
      } catch {
        return false;
      }
    }, "playground preview");
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1080 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
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
  assert.equal(
    new URL(
      await page
        .getByRole("link", { name: "tiny-isprite home" })
        .getAttribute("href"),
      url,
    ).pathname,
    process.env.VITE_BASE_PATH || "/",
  );
  const favicon = await page.locator('link[rel="icon"]').getAttribute("href");
  assert.equal(
    (await page.request.get(new URL(favicon, url).href)).status(),
    200,
  );
  await page
    .getByRole("button", { name: "Download React component", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("radio", { name: "Single icon", exact: true })
      .isChecked(),
    true,
  );
  assert.equal(
    await page
      .getByRole("radio", { name: /Generate CSS variables/ })
      .isChecked(),
    true,
  );
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Include multicolor fills and strokes" })
      .isChecked(),
    true,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Dark page theme" })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(await page.locator(".icon-library").getAttribute("open"), null);
  await poll(
    () =>
      page.getByRole("button", { name: "Play fill", exact: true }).isEnabled(),
    "featured flow field",
  );
  assert.ok((await page.locator(".animation-tracks fieldset").count()) >= 3);
  await page.screenshot({
    path: path.join(artifacts, "launch-dark.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.equal(await page.locator(".settings").isVisible(), false);
  await page.screenshot({
    path: path.join(artifacts, "launch-mobile-dark.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole("button", { name: "Dark page theme" }).click();
  await page.reload();
  assert.equal(
    await page
      .getByRole("button", { name: "Dark page theme" })
      .getAttribute("aria-pressed"),
    "false",
  );
  await page.getByRole("button", { name: "Dark page theme" }).click();
  await page.reload();
  assert.equal(
    await page
      .getByRole("button", { name: "Dark page theme" })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(await page.locator(".icon-inspector h3").textContent(), "orbit");
  await page.getByRole("tab", { name: "Colors", exact: true }).click();
  await poll(
    () =>
      page
        .locator('.variable-picker input[aria-label^="Color "]')
        .count()
        .then((c) => c >= 3),
    "featured palette",
  );
  const orbitColor = "--all-orbit-stroke-1";
  await page.getByLabel(`Color ${orbitColor}`, { exact: true }).fill("#24b38c");
  await page.getByRole("tab", { name: "Fill animation", exact: true }).click();
  const paintDot = page.getByRole("img", {
    name: new RegExp(`^Current color ${orbitColor}:`),
  });
  assert.equal(
    await paintDot.evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(36, 179, 140)",
  );
  await page.getByRole("tab", { name: "Colors", exact: true }).click();
  await page
    .getByLabel(`Dark color ${orbitColor}`, { exact: true })
    .fill("#ff8712");
  await page.getByRole("tab", { name: "Fill animation", exact: true }).click();
  assert.equal(
    await paintDot.evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(255, 135, 18)",
  );
  assert.equal(await paintDot.getAttribute("title"), "#ff8712");
  await page.getByRole("tab", { name: "Colors", exact: true }).click();
  await page
    .getByRole("button", { name: "Light preview", exact: true })
    .click();
  await page.getByRole("button", { name: "Reset icon", exact: true }).click();
  console.log(
    "PASS animation color dots follow edited light and dark artwork palettes",
  );
  await page.getByRole("button", { name: "Ribbon", exact: true }).click();
  await poll(
    () =>
      page
        .locator(".icon-inspector h3")
        .textContent()
        .then((n) => n === "ribbon"),
    "featured artwork choice",
  );
  await page.getByRole("button", { name: "Orbit", exact: true }).click();
  console.log(
    "PASS multicolor featured artwork, enabled flow controls, collapsed library, default variable generation and persisted dark page theme",
  );
  await page.getByRole("radio", { name: "Sprite", exact: true }).check();
  await page
    .getByRole("checkbox", { name: "Include multicolor fills and strokes" })
    .uncheck();
  await page.getByRole("radio", { name: /Use currentColor/ }).check();
  await page.locator(".icon-library summary").click();
  const exportButton = page.getByRole("button", {
    name: "Download bundle",
    exact: true,
  });
  const ready = () =>
    poll(() => exportButton.isEnabled(), "generated artifact");
  await ready();
  assert.equal(await page.locator(".icon-card").count(), samples.length);
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".icon-card use")].every(
      (element) => element.getBBox().width > 0,
    ),
  );
  console.log(
    "PASS actual React component renders every external SVG sample symbol",
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
    /#demo-orbit$/,
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
    async () =>
      (await page.locator(".icon-card").count()) === samples.length + 2,
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
    async () =>
      (await page.locator(".icon-card").count()) === samples.length + 3,
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
  assert.equal(await page.locator(".icon-card").count(), samples.length + 3);
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
    async () =>
      (await page.locator(".icon-card").count()) === samples.length + 4,
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
  await page.getByRole("tab", { name: "React component", exact: true }).click();
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
  // Beginners can change each generated variable and take the same colors away.
  await page
    .locator(".icon-select")
    .filter({ hasText: /^heart$/ })
    .click();
  await page.getByRole("radio", { name: /Generate CSS variables/ }).check();
  await ready();
  const heartPicker = page.getByLabel("Color --heart-stroke-1", {
    exact: true,
  });
  await heartPicker.fill("#13c38b");
  await ready();
  assert.equal(
    await page
      .locator(".selected-preview g[stroke]")
      .first()
      .evaluate((el) => getComputedStyle(el).stroke),
    "rgb(19, 195, 139)",
  );
  await page.getByRole("tab", { name: "CSS variables", exact: true }).click();
  assert.match(
    await page.locator("#code-output").textContent(),
    /--heart-stroke-1: #13c38b/,
  );
  assert.doesNotMatch(
    await page.locator("#code-output").textContent(),
    /sparkle/,
  );
  await page
    .locator(".icon-select")
    .filter({ hasText: /^sparkle$/ })
    .click();
  await ready();
  assert.equal(
    await page
      .getByLabel("Color --sparkle-stroke-1", { exact: true })
      .inputValue(),
    "#245cf3",
  );
  await page
    .locator(".icon-select")
    .filter({ hasText: /^heart$/ })
    .click();
  await ready();
  assert.equal(await heartPicker.inputValue(), "#13c38b");
  const hex = page.getByLabel("Value --heart-stroke-1", { exact: true });
  await hex.fill("#3b82f6");
  await hex.press("Enter");
  await ready();
  assert.equal(await heartPicker.inputValue(), "#3b82f6");
  await page.getByRole("tab", { name: "React usage", exact: true }).click();
  const paletteSnippet = await page.locator("#code-output").textContent();
  assert.match(paletteSnippet, /<span style=\{iconStyle\}/);
  assert.match(paletteSnippet, /"--heart-stroke-1": "#3b82f6"/);
  assert.doesNotMatch(paletteSnippet, /<Icon\s+style=/);
  await page.getByRole("tab", { name: "Tailwind", exact: true }).click();
  assert.match(
    await page.locator("#code-output").textContent(),
    /\[--heart-stroke-1:var\(--color-icon-heart-stroke-1\)\]/,
  );
  await page
    .getByLabel("Dark color --heart-stroke-1", { exact: true })
    .fill("#f97316");
  assert.equal(
    await page
      .locator(".selected-preview g[stroke]")
      .first()
      .evaluate((el) => getComputedStyle(el).stroke),
    "rgb(249, 115, 22)",
  );
  await page
    .locator(".selected-artwork > svg")
    .evaluate((el) => el.setAttribute("data-theme-identity", "same-svg"));
  await page
    .getByRole("button", { name: "Light preview", exact: true })
    .click();
  assert.equal(
    await page
      .locator(".selected-preview g[stroke]")
      .first()
      .evaluate((el) => getComputedStyle(el).stroke),
    "rgb(59, 130, 246)",
  );
  await page.getByRole("button", { name: "Dark preview", exact: true }).click();
  assert.equal(
    await page
      .locator(".selected-artwork > svg")
      .getAttribute("data-theme-identity"),
    "same-svg",
  );
  await page
    .getByRole("tab", { name: "globals.css / @theme", exact: true })
    .click();
  const spriteThemeCss = await page.locator("#code-output").textContent();
  assert.match(spriteThemeCss, /@theme static/);
  assert.match(spriteThemeCss, /--color-icon-heart-stroke-1: #3b82f6/);
  assert.match(spriteThemeCss, /--color-icon-heart-stroke-1: #f97316/);
  assert.match(spriteThemeCss, /@custom-variant dark/);
  await page.getByRole("tab", { name: "Tailwind", exact: true }).click();
  const spriteThemeJsx = await page.locator("#code-output").textContent();
  // Compile the exact globals.css and render the actual published sprite Icon.
  const spriteThemeCompiler = await compileTailwind(spriteThemeCss, {
    base: path.join(repo, "demo"),
    onDependency() {},
  });
  const spriteCandidates = [
    ...spriteThemeJsx.matchAll(/className="([^"]+)"/g),
  ].flatMap((m) => m[1].split(/\s+/));
  const spriteCompiledCss = spriteThemeCompiler.build(spriteCandidates);
  const { Icon: PublishedIcon } = createRequire(
    new URL("../demo/package.json", import.meta.url),
  )("tiny-isprite");
  const heartHref = await page
    .locator(".icon-card")
    .filter({
      has: page.locator(".icon-select > span", { hasText: /^heart$/ }),
    })
    .locator("use")
    .getAttribute("href");
  const [spriteUrl, spriteSymbol] = heartHref.split("#");
  const themeSource = transformSync(spriteThemeJsx, {
    loader: "jsx",
    jsx: "automatic",
    format: "cjs",
  }).code;
  const themeModule = { exports: {} };
  const themeRequire = (specifier) =>
    specifier === "./globals.css"
      ? {}
      : specifier === "tiny-isprite"
        ? { Icon: PublishedIcon }
        : specifier === "./generated/sprite.js"
          ? {
              default: {
                url: spriteUrl,
                prefix: spriteSymbol.slice(0, -"heart".length),
              },
              __esModule: true,
            }
          : createRequire(import.meta.url)(specifier);
  new Function("module", "exports", "require", themeSource)(
    themeModule,
    themeModule.exports,
    themeRequire,
  );
  const themeMarkup = renderToStaticMarkup(
    React.createElement(themeModule.exports.default),
  );
  const themePage = await page.context().newPage();
  await themePage.goto(url);
  await themePage.setContent(
    `<style>${spriteCompiledCss}</style><div id="theme-test">${themeMarkup}</div>`,
  );
  const mappedSvg = themePage.locator("#theme-test svg");
  await themePage.waitForFunction(
    () => document.querySelector("#theme-test use").getBBox().width > 0,
  );
  assert.equal(
    await mappedSvg.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--heart-stroke-1").trim(),
    ),
    "#3b82f6",
  );
  const lightButtonColor = await themePage
    .locator("#theme-test button")
    .evaluate((el) => getComputedStyle(el).color);
  await themePage
    .locator("#theme-test > section")
    .evaluate((el) => el.classList.add("dark"));
  assert.equal(
    await mappedSvg.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--heart-stroke-1").trim(),
    ),
    "#f97316",
  );
  assert.notEqual(
    await themePage
      .locator("#theme-test button")
      .evaluate((el) => getComputedStyle(el).color),
    lightButtonColor,
  );
  await themePage.close();
  const themeCssEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download globals.css/ }).click();
  const themeCssDownload = await themeCssEvent;
  await themeCssDownload.saveAs(path.join(artifacts, "globals.css"));
  assert.equal(
    await readFile(path.join(artifacts, "globals.css"), "utf8"),
    spriteThemeCss,
  );
  await page
    .getByRole("button", { name: "Light preview", exact: true })
    .click();
  console.log(
    "PASS actual Tailwind v4 compilation of @theme globals.css, dark variants, semantic tokens and published sprite Icon variable inheritance",
  );
  const cssEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download CSS variables/ }).click();
  const cssDownload = await cssEvent;
  await cssDownload.saveAs(path.join(artifacts, "edited-variables.css"));
  assert.match(
    await readFile(path.join(artifacts, "edited-variables.css"), "utf8"),
    /--heart-stroke-1: #3b82f6/,
  );
  await page.screenshot({
    path: path.join(artifacts, "palette-editor.png"),
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
    path: path.join(artifacts, "palette-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1080 });
  console.log(
    "PASS per-icon color pickers, HEX editing, live colors, scoped CSS, published Icon-compatible React/Tailwind and CSS download",
  );

  await page.getByRole("radio", { name: "Single icon", exact: true }).check();
  await singleReady();
  const logoInput = process.env.PLAYGROUND_LOGO || null;
  await page.getByLabel("Upload SVG files", { exact: true }).setInputFiles(
    logoInput || {
      name: "wide-logo.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg viewBox="0, 0, 400,120"><path fill="#ff0000" d="M0 0h200v120H0z"/><path fill="#00ff00" d="M200 0h200v120H200z"/></svg>',
      ),
    },
  );
  await poll(
    async () =>
      (await page
        .locator(".icon-card.selected .icon-select > span")
        .textContent()) !== "heart",
    "logo upload selected",
  );
  await singleReady();
  await page.getByRole("checkbox", { name: /Include multicolor/ }).check();
  await singleReady();
  assert.ok((await page.locator(".variable-row").count()) >= 2);
  const logoName = await page
    .locator(".icon-card.selected .icon-select > span")
    .textContent();
  const logoColor = page.locator(".variable-picker input").first();
  await logoColor.fill("#8b5cf6");
  await singleReady();
  await page.getByLabel("Export size in pixels", { exact: true }).fill("512");
  await singleReady();
  await page.getByRole("tab", { name: "Inline SVG", exact: true }).click();
  const logoOutput = await page.locator("#code-output").textContent();
  assert.match(logoOutput, /width="512"/);
  assert.equal(
    await page
      .locator(".icon-card svg")
      .evaluateAll((elements) =>
        elements.every((el) => Number(el.getAttribute("width")) <= 64),
      ),
    true,
  );
  assert.match(logoOutput, /viewBox="0 0 400 (119\.35483870967742|120)"/);
  assert.match(logoOutput, /#8b5cf6/);
  assert.match(logoOutput, /height="15[23]\.\d+"/);
  await page.getByRole("tab", { name: "React component", exact: true }).click();
  const logoComponent = await page.locator("#code-output").textContent();
  const compiledLogo = transformSync(logoComponent, {
    loader: "jsx",
    jsx: "automatic",
    format: "cjs",
  }).code;
  const logoModule = { exports: {} };
  new Function("module", "exports", "require", compiledLogo)(
    logoModule,
    logoModule.exports,
    createRequire(import.meta.url),
  );
  assert.match(
    renderToStaticMarkup(React.createElement(logoModule.exports.ExampleIcon)),
    /#8b5cf6/,
  );
  await page.getByRole("tab", { name: "React usage", exact: true }).click();
  const usage = await page.locator("#code-output").textContent();
  assert.match(usage, /style=\{iconColors\}/);
  assert.match(usage, new RegExp(`from '\\./${logoName}\\.jsx'`));
  // Run the actual copied usage file against the actual downloaded component.
  const changedUsage = usage.replace("#8b5cf6", "#f97316");
  const usageCompiled = transformSync(changedUsage, {
    loader: "jsx",
    jsx: "automatic",
    format: "cjs",
  }).code;
  const usageModule = { exports: {} };
  const requireUsage = (specifier) =>
    specifier === `./${logoName}.jsx`
      ? logoModule.exports
      : createRequire(import.meta.url)(specifier);
  new Function("module", "exports", "require", usageCompiled)(
    usageModule,
    usageModule.exports,
    requireUsage,
  );
  const usageMarkup = renderToStaticMarkup(
    React.createElement(usageModule.exports.default),
  );
  assert.match(usageMarkup, /width="512"/);
  assert.match(usageMarkup, /#f97316/);
  const overrideColor = await page.evaluate((markup) => {
    const host = document.createElement("div");
    host.innerHTML = markup;
    document.body.appendChild(host);
    const painted = [...host.querySelectorAll("*")].find((el) =>
      (el.getAttribute("fill") || "").startsWith("var("),
    );
    const fill = getComputedStyle(painted).fill;
    host.remove();
    return fill;
  }, usageMarkup);
  assert.equal(overrideColor, "rgb(249, 115, 22)");
  const exampleEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download React usage/ }).click();
  const exampleDownload = await exampleEvent;
  assert.equal(exampleDownload.suggestedFilename(), `${logoName}-example.jsx`);
  await exampleDownload.saveAs(path.join(artifacts, "logo-example.jsx"));
  assert.equal(
    await readFile(path.join(artifacts, "logo-example.jsx"), "utf8"),
    usage,
  );
  console.log(
    "PASS copied React usage compiles, imports its component, resizes proportionally and changes the actual rendered color through style overrides",
  );
  await page
    .getByRole("tab", { name: "globals.css / @theme", exact: true })
    .click();
  const singleThemeCss = await page.locator("#code-output").textContent();
  await page.getByRole("tab", { name: "Tailwind", exact: true }).click();
  const singleThemeJsx = await page.locator("#code-output").textContent();
  const singleCompiler = await compileTailwind(singleThemeCss, {
    base: path.join(repo, "demo"),
    onDependency() {},
  });
  const singleCandidates = [
    ...singleThemeJsx.matchAll(/className="([^"]+)"/g),
  ].flatMap((m) => m[1].split(/\s+/));
  const singleCss = singleCompiler.build(singleCandidates);
  const singleThemeModule = { exports: {} };
  const singleThemeCompiled = transformSync(singleThemeJsx, {
    loader: "jsx",
    jsx: "automatic",
    format: "cjs",
  }).code;
  const singleThemeRequire = (specifier) =>
    specifier === "./globals.css"
      ? {}
      : specifier === `./${logoName}.jsx`
        ? logoModule.exports
        : createRequire(import.meta.url)(specifier);
  new Function("module", "exports", "require", singleThemeCompiled)(
    singleThemeModule,
    singleThemeModule.exports,
    singleThemeRequire,
  );
  const singleThemeMarkup = renderToStaticMarkup(
    React.createElement(singleThemeModule.exports.default),
  );
  const singleThemePage = await page.context().newPage();
  await singleThemePage.setContent(
    `<style>${singleCss}</style><div id="theme-test">${singleThemeMarkup}</div>`,
  );
  const singlePaint = singleThemePage
    .locator('#theme-test [fill^="var("]')
    .first();
  assert.equal(
    await singlePaint.evaluate((el) => getComputedStyle(el).fill),
    "rgb(139, 92, 246)",
  );
  await singleThemePage
    .locator("#theme-test > section")
    .evaluate((el) => el.classList.add("dark"));
  assert.notEqual(
    await singlePaint.evaluate((el) => getComputedStyle(el).fill),
    "rgb(139, 92, 246)",
  );
  await singleThemePage.screenshot({
    path: path.join(artifacts, "tailwind-dark-render.png"),
  });
  await singleThemePage.close();
  await page.getByRole("button", { name: "Dark preview", exact: true }).click();
  console.log(
    "PASS generated standalone component changes actual fill through compiled Tailwind theme tokens without replacing SVG markup",
  );
  await page.getByRole("tab", { name: "Fill animation", exact: true }).click();
  // Optional shape-following animation leaves the exported vector untouched.
  const vectorBeforeFlow = await page
    .locator(".selected-artwork path")
    .evaluateAll((elements) => elements.map((el) => el.getAttribute("d")));
  await page
    .getByRole("checkbox", { name: "Enable fill animation", exact: true })
    .check();
  const playFill = page.getByRole("button", { name: "Play fill", exact: true });
  await poll(() => playFill.isEnabled(), "distance field prepared");
  const animationProgress = page.getByRole("slider", {
    name: "Fill animation progress",
    exact: true,
  });
  const targetSvg = page.locator(".selected-artwork > svg");
  await animationProgress.fill("0");
  await poll(
    async () =>
      (await page.locator(".animation-status").textContent()).includes("· 0 /"),
    "empty flow",
  );
  assert.match(
    await targetSvg.evaluate((el) => el.style.maskImage),
    /data:image\/png/,
  );
  await page
    .locator(".icon-inspector")
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  async function assertTimelineAndArtworkVisible() {
    const preview = await page.locator(".selected-preview").boundingBox();
    const timeline = await page.locator(".animation-playback").boundingBox();
    const viewport = page.viewportSize();
    assert.ok(
      preview.y >= 0 && preview.y + preview.height <= viewport.height,
      "entire preview visible with timeline",
    );
    assert.ok(
      timeline.y >= 0 && timeline.y + timeline.height <= viewport.height,
      "timeline visible with preview",
    );
  }
  await assertTimelineAndArtworkVisible();
  assert.ok(
    await page
      .locator(".fill-animation")
      .evaluate(
        (el) =>
          document
            .querySelector(".animation-playback")
            .compareDocumentPosition(el.querySelector(".animation-controls")) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ),
  );
  await page.locator(".inspector-controls").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await assertTimelineAndArtworkVisible();
  await page.locator(".inspector-controls").evaluate((el) => {
    el.scrollTop = 0;
  });
  await animationProgress.fill("50");
  await poll(async () => {
    const text = await page.locator(".animation-status").textContent();
    const m = text.match(/· (\d+) \/ (\d+)/);
    return m && Number(m[1]) > 0 && Number(m[1]) < Number(m[2]);
  }, "partially filled paint");
  assert.deepEqual(
    await page
      .locator(".selected-artwork path")
      .evaluateAll((elements) => elements.map((el) => el.getAttribute("d"))),
    vectorBeforeFlow,
  );
  await page.getByRole("tab", { name: "Colors", exact: true }).click();
  assert.equal(await targetSvg.evaluate((el) => el.style.maskImage), "");
  assert.equal(
    await page
      .getByRole("tabpanel", { name: "Colors", exact: true })
      .isVisible(),
    true,
  );
  await page.getByRole("tab", { name: "Fill animation", exact: true }).click();
  await poll(() => playFill.isEnabled(), "restored animation panel");
  assert.equal(await animationProgress.inputValue(), "50");
  await page.setViewportSize({ width: 390, height: 844 });
  await poll(() => playFill.isEnabled(), "responsive mask prepared");
  await page
    .locator(".icon-inspector")
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  await assertTimelineAndArtworkVisible();
  await animationProgress.fill("60");
  await assertTimelineAndArtworkVisible();
  await page.screenshot({
    path: path.join(artifacts, "animation-tabs-mobile.png"),
  });
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 768, height: 768 },
    { width: 320, height: 667 },
  ]) {
    await page.setViewportSize(viewport);
    await poll(() => playFill.isEnabled(), "resized animation field");
    await page
      .locator(".icon-inspector")
      .evaluate((el) => el.scrollIntoView({ block: "start" }));
    await assertTimelineAndArtworkVisible();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1080 });
  await poll(() => playFill.isEnabled(), "desktop mask restored");
  console.log(
    "PASS Colors/Fill animation tabs preserve state; timeline precedes effects and stays visible with artwork on desktop/mobile",
  );
  const animationGroups = await page
    .locator(".animation-tracks fieldset code")
    .allTextContents();
  await page
    .getByLabel(`Animation start ${animationGroups[1]}`, { exact: true })
    .fill("0.8");
  await page
    .getByLabel(`Animation duration ${animationGroups[1]}`, { exact: true })
    .fill("1.2");
  await page
    .getByLabel(`Animation end ${animationGroups[0]}`, { exact: true })
    .fill("55");
  await animationProgress.fill("100");
  assert.match(
    await targetSvg.evaluate((el) => el.style.maskImage),
    /data:image\/png/,
  );
  await page
    .getByRole("combobox", { name: "Fill effect", exact: true })
    .selectOption("radial");
  await page
    .getByRole("slider", { name: "Fill origin X", exact: true })
    .fill("25");
  await poll(() => playFill.isEnabled(), "new inlet prepared");
  await animationProgress.fill("45");
  await page.getByText("CSS-only radial example", { exact: true }).click();
  const animationCssEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download radial animation CSS", exact: true })
    .click();
  const animationCssDownload = await animationCssEvent;
  await animationCssDownload.saveAs(path.join(artifacts, "fill-reveal.css"));
  assert.match(
    await readFile(path.join(artifacts, "fill-reveal.css"), "utf8"),
    /at 25% 50%/,
  );
  await page
    .getByLabel(`Animation end ${animationGroups[0]}`, { exact: true })
    .fill("100");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await playFill.click();
  assert.equal(await animationProgress.inputValue(), "100");
  await poll(
    async () =>
      (await targetSvg.evaluate((el) => el.style.maskImage)) === "none",
    "reduced motion complete vector",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page
    .getByRole("combobox", { name: "Fill effect", exact: true })
    .selectOption("flow");
  await playFill.click();
  await poll(
    async () =>
      Number(await animationProgress.inputValue()) > 0 &&
      Number(await animationProgress.inputValue()) < 100,
    "live fill playback",
  );
  await page.getByRole("button", { name: "Pause fill", exact: true }).click();
  await page.screenshot({
    path: path.join(artifacts, "fill-animation.png"),
    fullPage: true,
  });
  await page
    .getByRole("checkbox", { name: "Enable fill animation", exact: true })
    .uncheck();
  assert.equal(await targetSvg.evaluate((el) => el.style.maskImage), "");
  console.log(
    "PASS optional shape-flow/radial preview, per-paint overlap and partial ends, CSS download, reduced motion, playback and cleanup",
  );
  if (process.env.PLAYGROUND_FLOW_LOGO) {
    await page
      .getByLabel("Upload SVG files", { exact: true })
      .setInputFiles(process.env.PLAYGROUND_FLOW_LOGO);
    await poll(
      async () =>
        (await page
          .locator(".icon-card.selected .icon-select > span")
          .textContent()) !== logoName,
      "real flow logo selected",
    );
    await singleReady();
    await page
      .getByRole("checkbox", { name: "Enable fill animation", exact: true })
      .check();
    await poll(
      () =>
        page
          .getByRole("button", { name: "Play fill", exact: true })
          .isEnabled(),
      "real text shape field",
    );
    await page
      .getByRole("slider", { name: "Fill animation progress", exact: true })
      .fill("50");
    await poll(async () => {
      const text = await page.locator(".animation-status").textContent();
      const match = text.match(/· (\d+) \/ (\d+)/);
      return (
        match && Number(match[1]) > 0 && Number(match[1]) < Number(match[2])
      );
    }, "real text partial fill");
    await page
      .locator(".selected-preview")
      .screenshot({ path: path.join(artifacts, "gariani-flow.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page
      .locator(".icon-select")
      .filter({ hasText: new RegExp(`^${logoName}$`) })
      .click();
    await singleReady();
    assert.equal(
      await page
        .getByRole("checkbox", { name: "Enable fill animation", exact: true })
        .isChecked(),
      false,
    );
    console.log(
      "PASS actual Gariani lettering: shape-field preparation, partial paint and cleanup on selection",
    );
  }

  await page.getByRole("tab", { name: "Colors", exact: true }).click();
  await page.screenshot({
    path: path.join(artifacts, "logo-editor.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.setViewportSize({ width: 1440, height: 1080 });
  // Single mode accepts larger documents, while the sprite importer retains its cap.
  const largeSvg =
    '<svg viewBox="0 0 400 120">' +
    " ".repeat(160 * 1024) +
    '<rect width="400" height="120" fill="#123456"/></svg>';
  await page.getByLabel("Upload SVG files", { exact: true }).setInputFiles({
    name: "large-logo.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(largeSvg),
  });
  await singleReady();
  await poll(
    async () =>
      (await page
        .locator(".icon-card.selected .icon-select > span")
        .textContent()) === "large-logo",
    "larger single upload",
  );
  if (process.env.PLAYGROUND_ARTWORK) {
    await page
      .getByLabel("Upload SVG files", { exact: true })
      .setInputFiles(process.env.PLAYGROUND_ARTWORK);
    await poll(
      async () =>
        (await page
          .locator(".icon-card.selected .icon-select > span")
          .textContent()) !== "large-logo",
      "large real artwork selected",
    );
    await singleReady();
    assert.equal(await page.locator(".variable-row").count(), 1);
    await page.locator(".variable-picker input").first().fill("#f97316");
    await singleReady();
    assert.equal(
      await page
        .locator(".selected-preview path")
        .first()
        .evaluate((el) => getComputedStyle(el).fill),
      "rgb(249, 115, 22)",
    );
    await page.getByRole("tab", { name: "Inline SVG", exact: true }).click();
    const artwork = await page.locator("#code-output").textContent();
    assert.match(artwork, /viewBox="0 0 2400 1352"/);
    assert.match(artwork, /#f97316/);
    assert.match(artwork, /translate\(0/);
    assert.ok((await page.locator(".selected-preview path").count()) > 10);
    await page.screenshot({
      path: path.join(artifacts, "real-artwork-editor.png"),
      fullPage: true,
    });
    console.log(
      "PASS actual 157KB user artwork: one shared fill variable changes every contour, transforms and viewBox retained",
    );
  }
  await page.getByRole("radio", { name: "Sprite", exact: true }).check();
  await ready();
  assert.equal(
    await page.getByRole("slider", { name: /^Size/ }).inputValue(),
    "64",
  );
  await page.getByLabel("Upload SVG files", { exact: true }).setInputFiles({
    name: "too-large-for-sprite.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(largeSvg),
  });
  await poll(
    async () =>
      (await page.locator(".notice").textContent()).includes("exceeds 128 KB"),
    "sprite cap preserved",
  );
  console.log(
    `PASS multicolor logo ${logoName}, comma-separated viewBox, 512px export with aspect ratio, React compilation and larger single uploads`,
  );
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
  await page.getByRole("radio", { name: "Sprite", exact: true }).check();
  await ready();
  assert.equal(await page.locator(".icon-card").count(), samples.length);
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
