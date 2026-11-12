import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { freePort, poll, stop } from "./helpers.mjs";
const { unzipSync, strFromU8 } = createRequire(
  new URL("../demo/package.json", import.meta.url),
)("fflate");
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
    }, "tour server");
  }
  browser = await chromium.launch();
  await mkdir(path.join(repo, ".release-artifacts/animation-tour"), {
    recursive: true,
  });
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 320 ? 700 : 1000 },
      acceptDownloads: true,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await page.getByLabel("Upload SVG files", { exact: true }).setInputFiles({
      name: "tour.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><path fill="#ef4444" d="M10 10h60v70H10z M120 10h60v70h-60z"/></svg>',
      ),
    });
    await poll(
      async () =>
        (await page.locator(".icon-inspector h3").textContent()) === "tour",
      "tour artwork",
    );
    if (width < 1001)
      await page
        .getByRole("button", { name: "Animation controls", exact: true })
        .click();
    const tour = page.locator(".animation-tour-popover");
    const next = () =>
      tour.getByRole("button", { name: "Next", exact: true }).click();
    async function at(number, total = 6) {
      await poll(async () => {
        const count = await tour
          .locator("header span")
          .textContent()
          .catch(() => null);
        const box = await tour.boundingBox();
        return (
          count === `Step ${number} of ${total}` &&
          box &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= width &&
          box.y + box.height <= page.viewportSize().height
        );
      }, `step ${number} visible at ${width}px`);
      await page.locator(".animation-tour-highlight").waitFor();
    }
    await page
      .getByRole("button", { name: "Show me how", exact: true })
      .click();
    await at(1);
    assert.equal(
      await tour.getByRole("button", { name: "Next", exact: true }).isEnabled(),
      false,
    );
    await page
      .getByRole("checkbox", { name: "Enable fill animation", exact: true })
      .check();
    await next();
    await at(2);
    await poll(
      () => tour.getByRole("button", { name: "Next", exact: true }).isEnabled(),
      "prepared simple controls",
    );
    await next();
    await at(3);
    await next();
    await at(4);
    await next();
    await at(5);
    assert.ok((await tour.textContent()).includes("under 10 analysis samples"));
    await page.screenshot({
      path: path.join(
        repo,
        `.release-artifacts/animation-tour/${width}-perfectionism.png`,
      ),
    });
    await next();
    await at(6);
    assert.equal(await page.locator(".region-editor-popover").count(), 0);
    assert.equal(
      await page.locator(".region-mode-toggle input").isChecked(),
      false,
    );
    // Back to the fork and take the optional advanced path.
    await tour.getByRole("button", { name: "Back", exact: true }).click();
    await at(5);
    await tour.getByRole("button", { name: /^Perfectionism mode/ }).click();
    await at(6, 11);
    assert.equal(
      await tour.getByRole("button", { name: "Next", exact: true }).isEnabled(),
      false,
    );
    await page
      .getByRole("checkbox", { name: "Separate region origins", exact: true })
      .check();
    await poll(
      () => tour.getByRole("button", { name: "Next", exact: true }).isEnabled(),
      "regions ready",
    );
    await next();
    await at(7, 11);
    await page.getByLabel("Selected region", { exact: true }).selectOption("1");
    await next();
    await at(8, 11);
    await page.getByLabel("Region origin X", { exact: true }).fill("72.3");
    await page.getByLabel("Region origin Y", { exact: true }).fill("42.5");
    await next();
    await at(9, 11);
    await page.getByLabel("Region start", { exact: true }).fill("0.13");
    await page.getByLabel("Region duration", { exact: true }).fill("0.27");
    await page.getByLabel("Region end fill", { exact: true }).fill("65");
    await tour.getByRole("button", { name: "Back", exact: true }).click();
    await at(8, 11);
    assert.equal(
      await page.getByLabel("Region origin X", { exact: true }).inputValue(),
      "72.3",
    );
    await next();
    await at(9, 11);
    assert.equal(
      await page.getByLabel("Region start", { exact: true }).inputValue(),
      "0.13",
    );
    await page.screenshot({
      path: path.join(
        repo,
        `.release-artifacts/animation-tour/${width}-timing.png`,
      ),
    });
    await next();
    await at(10, 11);
    assert.equal(
      await tour.getByRole("button", { name: "Next", exact: true }).isEnabled(),
      false,
    );
    const overlay = page.getByLabel("Region selection overlay", {
      exact: true,
    });
    const p = await overlay.evaluate((el) => {
      const v = el.viewBox.baseVal,
        p = new DOMPoint(v.width * 0.75, v.height * 0.4).matrixTransform(
          el.getScreenCTM(),
        );
      return { x: p.x, y: p.y };
    });
    await page.mouse.click(p.x, p.y);
    await poll(
      () => tour.getByRole("button", { name: "Next", exact: true }).isEnabled(),
      "origin placed",
      5000,
    ).catch(async (error) => {
      await page.screenshot({
        path: path.join(
          repo,
          `.release-artifacts/animation-tour/${width}-point-failure.png`,
        ),
      });
      throw error;
    });
    await next();
    await at(11, 11);
    const wait = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export animation ZIP", exact: true })
      .click();
    const files = unzipSync(
      new Uint8Array(await readFile(await (await wait).path())),
    );
    const source = strFromU8(files["animation-data.js"]);
    const data = JSON.parse(
      source
        .slice(source.indexOf("export default ") + 15)
        .trim()
        .replace(/;$/, ""),
    );
    const edited = data.tracks[data.regions[1].track];
    assert.equal(edited.start, 0.13);
    assert.equal(edited.duration, 0.27);
    assert.equal(edited.end, 65);
    assert.ok(Math.abs(data.regions[1].x - 75) < 0.5);
    await tour.getByRole("button", { name: "Done", exact: true }).click();
    assert.equal(await tour.count(), 0);
    if (width < 1001)
      await page
        .getByRole("button", { name: "Animation controls", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Show me how", exact: true })
      .click();
    await at(1);
    await tour.getByRole("button", { name: "Skip tour", exact: true }).click();
    assert.equal(await tour.count(), 0);
    await page
      .getByRole("button", { name: "Show me how", exact: true })
      .click();
    await at(1);
    await next();
    await at(2);
    await next();
    await at(3);
    await next();
    await at(4);
    await next();
    await at(5);
    await tour.getByRole("button", { name: /^Perfectionism mode/ }).click();
    await at(6, 11);
    await tour.getByRole("button", { name: "Back", exact: true }).click();
    await at(5, 11);
    // Next at the fork still means the short route after returning from advanced.
    await next();
    await at(6);
    await tour.getByRole("button", { name: "Back", exact: true }).click();
    await at(5);
    await tour.getByRole("button", { name: /^Perfectionism mode/ }).click();
    await at(6, 11);
    await next();
    await at(7, 11);
    await next();
    await at(8, 11);
    await page.keyboard.press("Escape");
    await poll(
      async () =>
        (await tour.count()) === 0 &&
        (await page.locator(".region-editor-popover").count()) === 0,
      "Escape closes walkthrough and region popup",
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "PASS desktop/phone quick route skips regional edits; optional fifth-step perfectionist route edits and exports; branch Back/Next and Done/Skip/Escape preserve settings",
  );
} finally {
  await browser?.close();
  if (server) await stop(server);
}
