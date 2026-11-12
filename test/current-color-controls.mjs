import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile, mkdir } from "node:fs/promises";
import { freePort, poll, stop } from "./helpers.mjs";
const repo = fileURLToPath(new URL("../", import.meta.url));
let server, browser;
try {
  let url = process.env.PLAYGROUND_URL;
  if (!url) {
    const port = await freePort();
    url = `http://127.0.0.1:${port}${process.env.VITE_BASE_PATH || "/"}`;
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
      { cwd: path.join(repo, "demo"), stdio: "ignore" },
    );
    await poll(async () => {
      try {
        return (await fetch(url)).ok;
      } catch {
        return false;
      }
    }, "zoom server");
  }
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
  await page.goto(url);
  await page.getByRole("tab", { name: "Colors", exact: true }).click();
  const light = page.getByLabel("Light currentColor", { exact: true });
  const dark = page.getByLabel("Dark currentColor", { exact: true });
  const ready = async () => {
    await poll(
      () =>
        page
          .getByRole("button", { name: /Download standalone SVG/, exact: true })
          .isEnabled(),
      "current-color artifact",
    );
  };
  const upload = async (name, paint) => {
    await page.getByLabel("Upload SVG files", { exact: true }).setInputFiles({
      name: `${name}.svg`,
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${paint}" d="M2 2h20v20H2z"/></svg>`,
      ),
    });
    await poll(
      async () =>
        (await page.locator(".icon-inspector h3").textContent()) === name,
      "selected uploaded icon",
    );
    await ready();
  };
  assert.equal(
    await light.count(),
    0,
    "variable-based default does not expose unused currentColor",
  );
  assert.equal(await dark.count(), 0);
  assert.equal(
    await page.getByLabel("Preview color", { exact: true }).count(),
    0,
    "no duplicate footer picker",
  );
  await page.getByRole("radio", { name: /Keep original colors/ }).check();
  await upload("fixed", "#aa3344");
  assert.equal(
    await light.count(),
    0,
    "original fixed colors have no currentColor controls",
  );
  await upload("inherited", "currentColor");
  await light.waitFor();
  await light.fill("#123456");
  await ready();
  assert.equal(
    await page.locator(".selected-preview").getAttribute("data-preview-theme"),
    "light",
  );
  await dark.fill("#fedcba");
  assert.equal(
    await page.locator(".selected-preview").getAttribute("data-preview-theme"),
    "dark",
  );
  assert.equal(
    await page
      .locator(".selected-artwork path")
      .evaluate((el) => getComputedStyle(el).fill),
    "rgb(254, 220, 186)",
  );
  await page
    .getByRole("button", { name: "Light preview", exact: true })
    .click();
  assert.equal(
    await page
      .locator(".selected-artwork path")
      .evaluate((el) => getComputedStyle(el).fill),
    "rgb(18, 52, 86)",
  );
  await page
    .getByRole("tab", { name: "globals.css / @theme", exact: true })
    .click();
  const css = await page.locator("#code-output").textContent();
  assert.match(css, /#123456/);
  assert.match(css, /#fedcba/);
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: /Download standalone SVG/, exact: true })
    .click();
  const svg = await readFile(await (await downloaded).path(), "utf8");
  assert.match(svg, /fill="currentColor"/);
  assert.match(svg, /color="#123456"/);
  await page.getByRole("radio", { name: /Generate CSS variables/ }).check();
  await ready();
  assert.equal(await light.count(), 0);
  await page.getByRole("radio", { name: /Keep original colors/ }).check();
  await ready();
  assert.equal(await light.inputValue(), "#123456");
  assert.equal(await dark.inputValue(), "#fedcba");
  await page.getByRole("radio", { name: /Use currentColor/ }).check();
  await ready();
  await poll(
    async () =>
      (await page
        .locator("[data-draft-status]")
        .getAttribute("data-draft-status")) === "saved",
    "draft committed",
  );
  await page.reload();
  await page.getByRole("tab", { name: "Colors", exact: true }).click();
  await ready();
  assert.equal(await light.inputValue(), "#123456");
  assert.equal(await dark.inputValue(), "#fedcba");
  await mkdir(path.join(repo, ".release-artifacts/current-color"), {
    recursive: true,
  });
  await page
    .locator(".current-color-controls")
    .screenshot({
      path: path.join(repo, ".release-artifacts/current-color/desktop.png"),
    });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Color controls", exact: true })
    .click();
  await dark.fill("#abcdef");
  assert.equal(
    await page.locator(".selected-preview").getAttribute("data-preview-theme"),
    "dark",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page
    .locator(".current-color-controls")
    .screenshot({
      path: path.join(repo, ".release-artifacts/current-color/mobile.png"),
    });
  console.log(
    "PASS currentColor controls follow actual generated paints across original/variables/currentColor modes; light/dark preview, native SVG export, theme tokens, retained edits, reload and mobile",
  );
} finally {
  await browser?.close();
  if (server) await stop(server);
}
