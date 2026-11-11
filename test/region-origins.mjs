import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freePort, poll, stop } from "./helpers.mjs";
import { decodeAnimation } from "../demo/src/lib/animation-player.js";
const repo = fileURLToPath(new URL("../", import.meta.url));
const { unzipSync, strFromU8 } = createRequire(
  new URL("../demo/package.json", import.meta.url),
)("fflate");
const artifacts = path.join(repo, ".release-artifacts/region-origins");
await mkdir(artifacts, { recursive: true });
let server, browser;
try {
  const port = await freePort(),
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
  }, "region test server");
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  const ready = () =>
    poll(
      () =>
        page
          .getByRole("button", { name: "Export animation ZIP", exact: true })
          .isEnabled(),
      "region maps",
    );
  await page.getByLabel("Upload SVG files", { exact: true }).setInputFiles({
    name: "two-islands.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><path fill="#ef4444" d="M10 10h60v70H10zM120 10h60v70h-60z"/></svg>',
    ),
  });
  await poll(
    () =>
      page
        .locator(".icon-inspector h3")
        .textContent()
        .then((v) => v === "two-islands"),
    "uploaded regions",
  );
  await page
    .getByRole("checkbox", { name: "Enable fill animation", exact: true })
    .check();
  await ready();
  await page
    .getByRole("checkbox", { name: "Separate region origins", exact: true })
    .check();
  await ready();
  assert.equal(
    await page
      .getByLabel("Selected region", { exact: true })
      .locator("option")
      .count(),
    2,
  );
  const overlay = page.getByLabel("Region selection overlay", { exact: true });
  async function clickAt(x, y) {
    await page.locator(".selected-preview").scrollIntoViewIfNeeded();
    const point = await overlay.evaluate(
      (el, { x, y }) => {
        const v = el.viewBox.baseVal;
        const p = new DOMPoint(x * v.width, y * v.height).matrixTransform(
          el.getScreenCTM(),
        );
        return { x: p.x, y: p.y };
      },
      { x, y },
    );
    await page.mouse.click(point.x, point.y);
  }
  await clickAt(0.2, 0.4);
  assert.equal(
    await page.getByLabel("Selected region", { exact: true }).inputValue(),
    "0",
  );
  await page
    .getByRole("button", { name: "Place origin on artwork", exact: true })
    .click();
  await clickAt(0.06, 0.12);
  assert.ok(
    Math.abs(
      Number(
        await page.getByLabel("Region origin X", { exact: true }).inputValue(),
      ) - 6,
    ) < 0.5,
  );
  await clickAt(0.75, 0.4);
  assert.equal(
    await page.getByLabel("Selected region", { exact: true }).inputValue(),
    "1",
  );
  await page
    .getByRole("button", { name: "Place origin on artwork", exact: true })
    .click();
  await clickAt(0.89, 0.77);
  assert.ok(
    Math.abs(
      Number(
        await page.getByLabel("Region origin X", { exact: true }).inputValue(),
      ) - 89,
    ) < 0.5,
  );
  await page.getByLabel("Selected region", { exact: true }).selectOption("0");
  assert.ok(
    Math.abs(
      Number(
        await page.getByLabel("Region origin X", { exact: true }).inputValue(),
      ) - 6,
    ) < 0.5,
  );
  await page.getByLabel("Selected region", { exact: true }).selectOption("1");
  for (const width of [390, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await ready();
    assert.ok(
      Math.abs(
        Number(
          await page
            .getByLabel("Region origin X", { exact: true })
            .inputValue(),
        ) - 89,
      ) < 0.5,
    );
    const boxes = await page.evaluate(() => {
      const a = document
          .querySelector(".selected-artwork > svg")
          .getBoundingClientRect(),
        b = document
          .querySelector(".region-origin-overlay")
          .getBoundingClientRect();
      return [
        a.left - b.left,
        a.top - b.top,
        a.width - b.width,
        a.height - b.height,
      ];
    });
    assert.ok(boxes.every((v) => Math.abs(v) < 1));
    await clickAt(0.2, 0.4);
    assert.equal(
      await page.getByLabel("Selected region", { exact: true }).inputValue(),
      "0",
    );
    await clickAt(0.75, 0.4);
    assert.equal(
      await page.getByLabel("Selected region", { exact: true }).inputValue(),
      "1",
    );
  }
  await page.getByRole("tab", { name: "Colors", exact: true }).click();
  await page
    .getByLabel("Color --all-two-islands-fill-1", { exact: true })
    .fill("#13c38b");
  await page.getByRole("tab", { name: "Fill animation", exact: true }).click();
  await ready();
  assert.ok(
    Math.abs(
      Number(
        await page.getByLabel("Region origin X", { exact: true }).inputValue(),
      ) - 89,
    ) < 0.5,
  );
  await page.getByLabel("Export size in pixels", { exact: true }).fill("512");
  await poll(
    () =>
      page
        .locator(".selected-artwork > svg")
        .getAttribute("width")
        .then((value) => value === "512"),
    "resized vector export",
  );
  await ready();
  assert.ok(
    Math.abs(
      Number(
        await page.getByLabel("Region origin X", { exact: true }).inputValue(),
      ) - 89,
    ) < 0.5,
  );
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export animation ZIP", exact: true })
    .click();
  const download = await event;
  const zipPath = path.join(artifacts, "two-islands.zip");
  await download.saveAs(zipPath);
  const files = unzipSync(new Uint8Array(await readFile(zipPath)));
  const data = JSON.parse(
    strFromU8(files["animation-data.js"]).match(/export default ([\s\S]*);/)[1],
  );
  assert.equal(data.regions.length, 2);
  assert.ok(Math.abs(data.regions[0].x - 6) < 0.5);
  assert.ok(Math.abs(data.regions[1].x - 89) < 0.5);
  const decoded = decodeAnimation(data);
  assert.equal(data.tracks.length, 1);
  // Same paint, opposite inlets: the left region begins at its left edge,
  // while the right region begins at its right edge.
  const at = (x, y) =>
    decoded.arrivals[
      Math.floor(y * decoded.height) * decoded.width +
        Math.floor(x * decoded.width)
    ];
  assert.ok(at(0.06, 0.12) < at(0.34, 0.12));
  assert.ok(at(0.89, 0.77) < at(0.61, 0.77));
  assert.doesNotMatch(strFromU8(files["artwork.svg"]), /region-origin|overlay/);
  await page.screenshot({ path: path.join(artifacts, "desktop.png") });
  await page.getByRole("tab", { name: "Colors", exact: true }).click();
  await page.getByRole("slider", { name: "Rotation", exact: true }).fill("15");
  await page.getByRole("tab", { name: "Fill animation", exact: true }).click();
  await poll(
    () =>
      page
        .locator(".selected-artwork")
        .innerHTML()
        .then((v) => v.includes("rotate(15")),
    "rotated geometry",
  );
  await ready();
  assert.equal(
    await page.getByLabel("Region origin X", { exact: true }).inputValue(),
    "50",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS independent same-paint region origins: click overlay, selection, point placement, letterboxing/resizing, palette persistence, geometry reset and opposite-direction portable export",
  );
} finally {
  await browser?.close();
  await stop(server);
}
