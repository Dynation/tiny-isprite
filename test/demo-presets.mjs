import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { freePort, poll, stop } from "./helpers.mjs";
import { demoAnimations } from "../demo/src/lib/demo-animations.js";
import { featuredSamples } from "../demo/src/samples.js";
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
    }, "presets server");
  }
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  const zip = page.getByRole("button", {
    name: "Export animation ZIP",
    exact: true,
  });
  const ready = () => poll(() => zip.isEnabled(), "demo animation ready");
  await ready();
  await poll(
    () =>
      page.getByRole("button", { name: "Pause fill", exact: true }).isVisible(),
    "first-visit animation starts automatically",
  );
  for (const preset of demoAnimations) {
    await page
      .getByRole("button", {
        name: featuredSamples.find((s) => s.name === preset.name).label,
        exact: true,
      })
      .click();
    await poll(
      async () =>
        (await page.locator(".icon-inspector h3").textContent()) ===
        preset.name,
      "selected demo",
    );
    await ready();
    assert.equal(
      await page
        .getByRole("checkbox", { name: "Enable fill animation", exact: true })
        .isChecked(),
      true,
    );
    const wait = page.waitForEvent("download");
    await zip.click();
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
    assert.equal(data.mode, preset.mode, preset.name);
    assert.deepEqual(data.origin, preset.origin, preset.name);
    if (preset.regions) {
      assert.equal(
        data.regions.length,
        preset.regions.length,
        `${preset.name} region topology`,
      );
      for (const original of preset.regions) {
        const actual = data.regions[original.id];
        assert.ok(
          Math.abs(actual.x - original.x) < 1e-6,
          `${preset.name} region ${original.id} x`,
        );
        assert.ok(
          Math.abs(actual.y - original.y) < 1e-6,
          `${preset.name} region ${original.id} y`,
        );
        assert.deepEqual(
          data.tracks[actual.track],
          preset.tracks[original.track],
          `${preset.name} region ${original.id} timing`,
        );
      }
    } else assert.deepEqual(data.tracks, preset.tracks);
    for (const theme of ["light", "dark"])
      for (const [name, color] of Object.entries(preset.palettes[theme]))
        assert.equal(
          data.palettes[theme][name],
          color,
          `${preset.name} ${theme} ${name}`,
        );
  }
  // A saved visitor's changes take precedence; loading samples explicitly restores presets.
  await page.getByRole("button", { name: "Ribbon", exact: true }).click();
  await ready();
  const first = page
    .getByRole("spinbutton", { name: /^Animation start / })
    .first();
  await first.fill("0.23");
  await page.getByRole("button", { name: "Orbit", exact: true }).click();
  await ready();
  await page.getByRole("button", { name: "Ribbon", exact: true }).click();
  await ready();
  assert.equal(await first.inputValue(), "0.23");
  await page.waitForTimeout(400);
  await page.reload();
  await ready();
  assert.equal(await first.inputValue(), "0.23");
  await page.getByRole("button", { name: "Load samples", exact: true }).click();
  await ready();
  await page.getByRole("button", { name: "Ribbon", exact: true }).click();
  await ready();
  assert.equal(await first.inputValue(), "1.7");
  const reduced = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  await reduced.goto(url);
  await poll(
    () =>
      reduced
        .getByRole("button", { name: "Export animation ZIP", exact: true })
        .isEnabled(),
    "reduced-motion preset",
  );
  assert.equal(
    await reduced
      .getByRole("button", { name: "Pause fill", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await reduced
      .getByLabel("Fill animation progress", { exact: true })
      .inputValue(),
    "100",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS all six authored presets retain exact regional origins, timings and palettes through editor/ZIP, first-visit playback, saved edits, explicit reset and reduced motion",
  );
} finally {
  await browser?.close();
  if (server) await stop(server);
}
