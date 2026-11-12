import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
    }, "draft preview");
  }
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByLabel("Upload SVG files", { exact: true }).setInputFiles({
    name: "draft-strokes.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><g fill="none" stroke="rgba(239,68,68,0.8)" stroke-width="4"><path d="M20 20H80V80H20Z M120 20H180V80H120Z"/></g></svg>',
    ),
  });
  await poll(
    () =>
      page
        .locator(".icon-inspector h3")
        .textContent()
        .then((v) => v === "draft-strokes"),
    "draft artwork",
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
      "draft animation",
    );
  await ready();
  await page
    .getByRole("checkbox", { name: "Separate region origins", exact: true })
    .check();
  await ready();
  const variable = "--all-draft-strokes-stroke-1";
  await page
    .getByLabel(`Animation start ${variable}`, { exact: true })
    .fill("0.13");
  await page
    .getByLabel(`Animation duration ${variable}`, { exact: true })
    .fill("2.67");
  const paintStart = page.getByLabel(`Animation start ${variable}`, {
    exact: true,
  });
  assert.equal(await paintStart.getAttribute("step"), "0.01");
  await paintStart.press("ArrowUp");
  assert.equal(await paintStart.inputValue(), "0.14");
  await paintStart.press("ArrowDown");
  async function edit(id) {
    if (await page.getByRole("dialog").isVisible())
      await page.keyboard.press("Escape");
    await page
      .getByLabel("Selected region", { exact: true })
      .selectOption(String(id));
    await page
      .getByRole("button", { name: "Edit region settings", exact: true })
      .click();
  }
  await edit(0);
  await page.getByLabel("Region start", { exact: true }).fill("0.43");
  await page.getByLabel("Region duration", { exact: true }).fill("0.02");
  const regionDuration = page.getByLabel("Region duration", { exact: true });
  assert.equal(await regionDuration.getAttribute("step"), "0.01");
  await regionDuration.press("ArrowUp");
  assert.equal(await regionDuration.inputValue(), "0.03");
  await regionDuration.press("ArrowDown");
  assert.equal(await regionDuration.evaluate((el) => el.validity.valid), true);
  await page.getByLabel("Region origin X", { exact: true }).fill("10");
  await edit(1);
  await page.getByLabel("Region start", { exact: true }).fill("1.37");
  await page.getByLabel("Region duration", { exact: true }).fill("3.24");
  await page.getByLabel("Region end fill", { exact: true }).fill("65");
  await page.getByLabel("Region origin X", { exact: true }).fill("90");
  await page.keyboard.press("Escape");
  await page.getByLabel("Fill animation progress", { exact: true }).fill("42");
  async function verify() {
    await ready();
    await edit(1);
    assert.equal(
      await page.getByLabel("Region start", { exact: true }).inputValue(),
      "1.37",
    );
    assert.equal(
      await page.getByLabel("Region duration", { exact: true }).inputValue(),
      "3.24",
    );
    assert.equal(
      await page.getByLabel("Region end fill", { exact: true }).inputValue(),
      "65",
    );
    assert.equal(
      await page.getByLabel("Region origin X", { exact: true }).inputValue(),
      "90",
    );
    await edit(0);
    assert.equal(
      await page.getByLabel("Region start", { exact: true }).inputValue(),
      "0.43",
    );
    assert.equal(
      await page.getByLabel("Region duration", { exact: true }).inputValue(),
      "0.02",
    );
    await page.keyboard.press("Escape");
    assert.equal(
      await page
        .getByLabel(`Animation start ${variable}`, { exact: true })
        .inputValue(),
      "0.13",
    );
    assert.equal(
      await page
        .getByLabel("Fill animation progress", { exact: true })
        .inputValue(),
      "42",
    );
  }
  await page.getByRole("tab", { name: "Colors", exact: true }).click();
  await page.getByRole("tab", { name: "Fill animation", exact: true }).click();
  await verify();
  await page.getByRole("tab", { name: "Colors", exact: true }).click();
  await page.getByLabel(`Color ${variable}`, { exact: true }).fill("#13c38b");
  await page.getByLabel("Line thickness", { exact: true }).fill("2");
  await page.getByRole("tab", { name: "Fill animation", exact: true }).click();
  await verify();
  await page.getByRole("button", { name: "Ribbon", exact: true }).click();
  await poll(
    () =>
      page
        .locator(".icon-inspector h3")
        .textContent()
        .then((v) => v === "ribbon"),
    "another icon",
  );
  await page.locator(".icon-library summary").click();
  await page
    .locator(".icon-select")
    .filter({ hasText: /^draft-strokes$/ })
    .click();
  await verify();
  await page.getByRole("tab", { name: "Colors", exact: true }).click();
  await poll(
    () =>
      page
        .locator("[data-draft-status]")
        .getAttribute("data-draft-status")
        .then((v) => v === "saved"),
    "draft committed",
  );
  await page.reload();
  await poll(
    () =>
      page
        .locator(".icon-inspector h3")
        .textContent()
        .then((v) => v === "draft-strokes"),
    "uploaded artwork restored",
  );
  assert.equal(
    await page.getByLabel("Line thickness", { exact: true }).inputValue(),
    "2",
  );
  assert.equal(
    await page.getByLabel(`Color ${variable}`, { exact: true }).inputValue(),
    "#13c38b",
  );
  await page.getByRole("tab", { name: "Fill animation", exact: true }).click();
  await verify();
  assert.deepEqual(errors, []);
  const blocked = await browser.newContext();
  await blocked.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    }),
  );
  const p = await blocked.newPage();
  await p.goto(url);
  await p
    .getByRole("button", { name: "Download React component", exact: true })
    .waitFor();
  assert.equal(
    await p.locator("[data-draft-status]").getAttribute("data-draft-status"),
    "unavailable",
  );
  await blocked.close();
  const corrupt = await browser.newContext();
  const c = await corrupt.newPage();
  await c.goto(url);
  await poll(
    () =>
      c
        .locator("[data-draft-status]")
        .getAttribute("data-draft-status")
        .then((v) => v === "saved"),
    "initial draft saved",
  );
  await c.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("tiny-isprite-local-draft", 1);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("workspace", "readwrite");
          tx.objectStore("workspace").put({ version: 99 }, "latest");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = reject;
        };
        r.onerror = reject;
      }),
  );
  await c.reload();
  await c
    .getByRole("button", { name: "Download React component", exact: true })
    .waitFor();
  assert.equal(
    await c.locator("[data-draft-status]").getAttribute("data-draft-status"),
    "unavailable",
  );
  await c.waitForTimeout(350);
  const version = await c.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("tiny-isprite-local-draft", 1);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("workspace", "readonly"),
            get = tx.objectStore("workspace").get("latest");
          tx.oncomplete = () => {
            db.close();
            resolve(get.result.version);
          };
        };
      }),
  );
  assert.equal(
    version,
    99,
    "unsupported drafts are not overwritten by defaults",
  );
  await corrupt.close();
  console.log(
    "PASS animation draft survives Colors/animation tabs, color and stroke-width edits, icon switches and page reload; uploads and palettes restore; blocked browser storage remains usable",
  );
} finally {
  await browser?.close();
  await stop(server);
}
