import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdir } from "node:fs/promises";
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
    }, "layout preview");
  }
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  const zip = page.getByRole("button", {
    name: "Export animation ZIP",
    exact: true,
  });
  await poll(() => zip.isEnabled(), "animation ready");
  assert.equal(await zip.count(), 1);
  assert.equal(
    await page
      .locator(".export-panel")
      .getByRole("button", { name: "Export animation ZIP", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page.locator(".animation-integration").getAttribute("open"),
    null,
  );
  await page.getByRole("tab", { name: "Fill animation", exact: true }).click();
  const start = page
    .getByRole("spinbutton", { name: /^Animation start / })
    .first();
  await start.fill("1.7");
  const left = page.getByRole("separator", {
    name: "Resize package settings panel",
  });
  const right = page.getByRole("separator", {
    name: "Resize color and animation panel",
  });
  await left.scrollIntoViewIfNeeded();
  const width = () => left.getAttribute("aria-valuenow").then(Number);
  const before = await width();
  const box = await left.boundingBox();
  await page.mouse.move(box.x + box.width / 2, Math.max(100, box.y + 80));
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, Math.max(100, box.y + 80), {
    steps: 8,
  });
  await page.mouse.up();
  await poll(
    async () => (await width()) === before + 60,
    "dragged package width",
  );
  await left.press("ArrowLeft");
  assert.equal(await width(), before + 44);
  // A second pointer gesture must keep updating live, even if the first
  // pointer-up cancelled a pending animation frame.
  const second = await left.boundingBox();
  await page.mouse.move(second.x + 4, Math.max(100, second.y + 80));
  await page.mouse.down();
  await page.mouse.move(second.x + 24, Math.max(100, second.y + 80));
  await poll(async () => (await width()) === before + 64, "second live resize");
  await page.mouse.up();
  await left.dblclick({ position: { x: 4, y: 80 } });
  assert.equal(await width(), 220);
  const restoredBox = await left.boundingBox();
  await page.mouse.move(restoredBox.x + 4, Math.max(100, restoredBox.y + 80));
  await page.mouse.down();
  await page.mouse.move(restoredBox.x + 48, Math.max(100, restoredBox.y + 80), {
    steps: 4,
  });
  await page.mouse.up();
  await right.focus();
  const oldRight = Number(await right.getAttribute("aria-valuenow"));
  await right.press("ArrowLeft");
  assert.equal(
    Number(await right.getAttribute("aria-valuenow")),
    oldRight + 16,
  );
  assert.equal(await start.inputValue(), "1.7");
  await page.waitForTimeout(200);
  await page.reload();
  await poll(() => zip.isEnabled(), "restored editor");
  assert.equal(await width(), before + 44);
  assert.equal(
    Number(await right.getAttribute("aria-valuenow")),
    oldRight + 16,
  );
  const canvas = () => page.locator(".selected-preview").boundingBox();
  const full = await canvas();
  await page
    .getByRole("button", { name: "Package settings", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Icon controls", exact: true })
    .click();
  assert.ok(
    (await canvas()).width > full.width + 350,
    "collapsing panels expands canvas",
  );
  await page
    .getByRole("button", { name: "Expand editor", exact: true })
    .click();
  assert.equal(
    await page
      .locator(".workspace")
      .evaluate((el) => getComputedStyle(el).position),
    "fixed",
  );
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "Expand editor", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  await page
    .getByRole("button", { name: "Expand editor", exact: true })
    .click();
  await page.getByRole("button", { name: "Downloads", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Expand editor", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  await page.getByRole("button", { name: "Reset layout", exact: true }).click();
  assert.equal(await width(), 220);
  assert.equal(await start.inputValue(), "1.7");
  await page.getByRole("tab", { name: "Colors", exact: true }).click();
  await poll(() => zip.isEnabled(), "ZIP available from Colors");
  const downloaded = page.waitForEvent("download");
  await zip.click();
  const file = await downloaded;
  assert.match(file.suggestedFilename(), /\.zip$/);
  assert.equal(await file.failure(), null);
  await mkdir(path.join(repo, ".release-artifacts/editor-layout"), {
    recursive: true,
  });
  await page.getByRole("tab", { name: "Fill animation", exact: true }).click();
  await page
    .locator(".workspace")
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.screenshot({
    path: path.join(repo, ".release-artifacts/editor-layout/desktop.png"),
  });
  for (const w of [390, 320]) {
    await page.setViewportSize({ width: w, height: 844 });
    assert.equal(await page.locator(".settings").isVisible(), false);
    await page
      .getByRole("button", { name: "Animation controls", exact: true })
      .click();
    assert.equal(await page.locator(".inspector-controls").isVisible(), true);
    await poll(async () => {
      const preview = await canvas();
      const timeline = await page.locator(".animation-playback").boundingBox();
      const sheet = await page.locator(".inspector-controls").boundingBox();
      return preview.y >= 0 && timeline.y + timeline.height <= sheet.y;
    }, "mobile canvas positioned above controls");
    const preview = await canvas();
    const timeline = await page.locator(".animation-playback").boundingBox();
    const sheet = await page.locator(".inspector-controls").boundingBox();
    assert.ok(
      preview.y >= 0 && preview.y + preview.height <= sheet.y,
      JSON.stringify({ w, preview, sheet }),
    );
    assert.ok(timeline.y + timeline.height <= sheet.y, "timeline above sheet");
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "no horizontal overflow",
    );
    if (w === 390)
      await page.screenshot({
        path: path.join(repo, ".release-artifacts/editor-layout/mobile.png"),
      });
    await page
      .getByRole("button", { name: "Close icon controls", exact: true })
      .click();
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    await page
      .getByRole("button", { name: "Package controls", exact: true })
      .click();
    assert.equal(await page.locator(".settings").isVisible(), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".settings").isVisible(), false);
  }
  await page
    .getByRole("button", { name: "Animation controls", exact: true })
    .click();
  await page.setViewportSize({ width: 1024, height: 1000 });
  // matchMedia dispatch and the React effect cleanup follow the resize event.
  await poll(async () => await page.evaluate(() =>
    document.body.style.overflow === "" &&
    document.querySelector(".app-shell").dataset.mobilePanel === "none"
  ), "desktop resize closes the mobile sheet and restores scrolling");
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  assert.equal(
    await page.locator(".app-shell").getAttribute("data-mobile-panel"),
    "none",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "1024px desktop layout fits",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS unified ZIP download from Colors, resize/keyboard/persist/reset/collapse, focus recovery and mobile sheets with visible artwork/timeline",
  );
} finally {
  await browser?.close();
  if (server) await stop(server);
}
