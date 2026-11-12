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
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByLabel("Upload SVG files", { exact: true }).setInputFiles({
    name: "thin-regions.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path fill="#ef4444" d="M60 20h1v216h-1z M190 20h2v216h-2z"/></svg>',
    ),
  });
  await poll(
    async () =>
      (await page.locator(".icon-inspector h3").textContent()) ===
      "thin-regions",
    "upload",
  );
  await page
    .getByRole("checkbox", { name: "Enable fill animation", exact: true })
    .check();
  const ready = () =>
    poll(
      () =>
        page
          .getByRole("button", { name: "Export animation ZIP", exact: true })
          .isEnabled(),
      "prepared",
    );
  await ready();
  await page
    .getByRole("checkbox", { name: "Separate region origins", exact: true })
    .check();
  await ready();
  const overlay = page.getByLabel("Region selection overlay", { exact: true });
  await overlay.waitFor();
  const selected = page.getByLabel("Selected region", { exact: true });
  assert.equal(
    await selected.locator("option").count(),
    2,
    "both 1–2px-wide regions remain selectable",
  );
  async function svgDownload() {
    const wait = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download standalone SVG/ }).click();
    return readFile(await (await wait).path(), "utf8");
  }
  const original = await svgDownload();
  const svg = page.locator(".selected-artwork > svg");
  const initial = (await svg.boundingBox()).width;
  const zoom = page.getByLabel("Preview zoom", { exact: true });
  for (let i = 0; i < 5; i++)
    await page
      .getByRole("button", { name: "Zoom in preview", exact: true })
      .click();
  await ready();
  assert.ok(Number((await zoom.textContent()).replace("%", "")) > 700);
  assert.ok((await svg.boundingBox()).width > initial * 7);
  // Scroll a chosen SVG point into the viewport, using the real SVG screen CTM.
  async function aim(x, y) {
    await page
      .locator(".preview-column")
      .evaluate((el) => el.scrollIntoView({ block: "start" }));
    await overlay.evaluate(
      (el, { x, y }) => {
        const rect = el.closest(".preview-viewport").getBoundingClientRect();
        const point = new DOMPoint(x, y).matrixTransform(
          document.querySelector(".selected-artwork > svg").getScreenCTM(),
        );
        const node = el.closest(".preview-viewport");
        node.scrollLeft += point.x - rect.left - rect.width / 2;
        node.scrollTop += point.y - rect.top - rect.height / 2;
      },
      { x, y },
    );
    return svg.evaluate(
      (el, { x, y }) => {
        const p = new DOMPoint(x, y).matrixTransform(el.getScreenCTM());
        return { x: p.x, y: p.y };
      },
      { x, y },
    );
  }
  let p = await aim(60.5, 128);
  await page.mouse.click(p.x, p.y);
  assert.equal(await selected.inputValue(), "0");
  await page
    .getByRole("button", { name: "Place origin on artwork", exact: true })
    .click();
  p = await aim(60.5, 80);
  await page.mouse.click(p.x, p.y);
  await page
    .getByRole("button", { name: "Edit region settings", exact: true })
    .click();
  const originX = page.getByLabel("Region origin X", { exact: true }),
    originY = page.getByLabel("Region origin Y", { exact: true });
  assert.ok(
    Math.abs(Number(await originX.inputValue()) - (60.5 / 256) * 100) < 0.6,
  );
  assert.ok(
    Math.abs(Number(await originY.inputValue()) - (80 / 256) * 100) < 0.6,
  );
  await page.keyboard.press("Escape");
  p = await aim(191, 128);
  await page.mouse.click(p.x, p.y);
  assert.equal(await selected.inputValue(), "1");
  const viewport = page.getByRole("region", {
    name: "Zoomable artwork preview",
    exact: true,
  });
  const scroll = () =>
    viewport.evaluate((el) => ({ x: el.scrollLeft, y: el.scrollTop }));
  await page.getByRole("button", { name: "Pan preview", exact: true }).click();
  p = await aim(191, 128);
  const beforePan = await scroll();
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x - 60, p.y - 35, { steps: 5 });
  await page.mouse.up();
  assert.ok(
    (await scroll()).x > beforePan.x + 50,
    "hand pans on top of the portal overlay",
  );
  assert.equal(
    await selected.inputValue(),
    "1",
    "panning does not change selected region",
  );
  await page.getByRole("button", { name: "Pan preview", exact: true }).click();
  await viewport.focus();
  await page.keyboard.down("Space");
  const bounds = await viewport.boundingBox(),
    start = await scroll();
  await page.mouse.move(bounds.x + 100, bounds.y + 80);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 60, bounds.y + 60, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  assert.ok(
    (await scroll()).x > start.x + 30,
    "Space drag pans without selecting",
  );
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await ready();
  assert.equal(await zoom.textContent(), "100%");
  assert.equal((await scroll()).x, 0);
  assert.equal(
    await svgDownload(),
    original,
    "view zoom/pan never changes exported SVG",
  );
  await page
    .getByRole("button", { name: "Edit region settings", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await selected.selectOption("0");
  await page
    .getByRole("button", { name: "Edit region settings", exact: true })
    .click();
  assert.ok(
    Math.abs(Number(await originY.inputValue()) - (80 / 256) * 100) < 0.6,
    "origin survives Fit",
  );
  await page.keyboard.press("Escape");
  const viewBefore = await page.evaluate(() => innerWidth);
  const rect = await viewport.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -70);
  await page.keyboard.up("Control");
  await poll(
    async () => (await zoom.textContent()) !== "100%",
    "canvas wheel zoom",
  );
  assert.equal(
    await page.evaluate(() => innerWidth),
    viewBefore,
    "browser page is not zoomed",
  );
  await mkdir(path.join(repo, ".release-artifacts/preview-zoom"), {
    recursive: true,
  });
  await page.screenshot({
    path: path.join(repo, ".release-artifacts/preview-zoom/desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Animation controls", exact: true })
    .click();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page
    .getByRole("button", { name: "Zoom in preview", exact: true })
    .click();
  assert.equal(await zoom.textContent(), "150%");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS 1–2px regions at zoom, origin coordinates after scrolling, portal-overlay hand/Space pan, canvas-only wheel zoom, Fit, mobile and identical exported SVG",
  );
} finally {
  await browser?.close();
  if (server) await stop(server);
}
