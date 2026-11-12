import assert from "node:assert/strict";
import { chromium, firefox } from "@playwright/test";
import http from "node:http";
import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeAnimation } from "../demo/src/lib/animation-export.js";
import { freePort, poll, stop } from "./helpers.mjs";
const repo = fileURLToPath(new URL("../", import.meta.url));
const artifacts = path.join(repo, ".release-artifacts/firefox-animation");
await mkdir(artifacts, { recursive: true });
const width = 320,
  height = 320;
const labels = new Int32Array(width * height),
  field = Float32Array.from(labels, (_, p) => (p % width) / (width - 1));
const data = encodeAnimation({
  svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="#ff0000" d="M0 0h100v100H0z"/></svg>',
  prepared: { width, height, labels, field },
  tracks: [{ name: "red", start: 0, duration: 30, end: 100 }],
  mode: "flow",
  originX: 0,
  originY: 0,
  name: "flicker-regression",
  initialProgress: 25,
});
const files = Object.fromEntries(
  await Promise.all(
    ["animation-player.js", "fill-animation.js", "preview-mask.js"].map(
      async (name) => [
        "/" + name,
        await readFile(path.join(repo, "demo/src/lib", name), "utf8"),
      ],
    ),
  ),
);
const html = `<style>body{margin:0;background:white;display:flex;gap:10px}.host{width:160px;height:160px}</style><div class="host" id="preview"><svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 100 100"><path fill="#ff0000" d="M0 0h100v100H0z"/></svg></div><div class="host" id="export"></div><script type="module">import{createAnimation}from'/animation-player.js';import{drawFillMask}from'/fill-animation.js';import{createPreviewMask}from'/preview-mask.js';window.player=createAnimation(document.querySelector('#export'),${JSON.stringify(data)});const canvas=document.createElement('canvas');canvas.width=canvas.height=320;const context=canvas.getContext('2d');const p={width:320,height:320,canvas,context,pixels:context.createImageData(320,320),labels:new Int32Array(102400),field:Float32Array.from({length:102400},(_,i)=>(i%320)/319)};const target=document.querySelector('#preview svg'),mask=createPreviewMask(target,320,320,false);window.updates=0;let last=0;function frame(now){if(now-last>=33&&updates<400){updates++;const progress=25+updates/10;const result=drawFillMask(p,[{start:0,duration:30,end:100}],progress/100*30,'flow',0,0);mask.update(result.url,result.complete);player.seek(progress);last=now;}requestAnimationFrame(frame);}requestAnimationFrame(frame);</script>`;
let fixture, server, browser;
try {
  fixture = http.createServer((q, r) => {
    r.setHeader("Content-Type", files[q.url] ? "text/javascript" : "text/html");
    r.end(files[q.url] || html);
  });
  await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const port = await freePort();
  const base = process.env.VITE_BASE_PATH || "/";
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
  const app = `http://127.0.0.1:${port}${base}`;
  await poll(async () => {
    try {
      return (await fetch(app)).ok;
    } catch {
      return false;
    }
  }, "Firefox app");
  for (const [name, engine] of [
    ["firefox", firefox],
    ["chromium", chromium],
  ]) {
    browser = await engine.launch();
    const page = await browser.newPage({
      viewport: { width: 350, height: 180 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${fixture.address().port}`);
    await page.waitForFunction(() => window.updates > 2);
    const stableMask = await page
      .locator("#preview [data-preview-content]")
      .getAttribute("mask");
    const counts = [];
    let updates = 0;
    while (updates < 240 && counts.length < 400) {
      const png = await page.screenshot({
        clip: { x: 0, y: 0, width: 330, height: 160 },
      });
      const result = await page.evaluate(async (s) => {
        const image = new Image();
        image.src = "data:image/png;base64," + s;
        await image.decode();
        const c = document.createElement("canvas");
        c.width = 330;
        c.height = 160;
        const ctx = c.getContext("2d");
        ctx.drawImage(image, 0, 0);
        const p = ctx.getImageData(0, 0, 330, 160).data,
          counts = [0, 0];
        for (let i = 0; i < p.length; i += 4)
          if (p[i] > 180 && p[i + 1] < 90 && p[i + 2] < 90) {
            const x = (i / 4) % 330;
            if (x < 160) counts[0]++;
            else if (x >= 170) counts[1]++;
          }
        return { counts, updates: window.updates };
      }, png.toString("base64"));
      const previous = counts.at(-1);
      if (previous)
        for (let i = 0; i < 2; i++)
          assert.ok(
            result.counts[i] >= previous[i] - 160,
            `${name}: visible fill moved backwards at ${result.updates}`,
          );
      counts.push(result.counts);
      updates = result.updates;
      if (result.counts.some((n) => n === 0))
        await writeFile(path.join(artifacts, `${name}-blank.png`), png);
      assert.ok(
        result.counts[0] > 1000,
        `${name}: preview blank after ${updates} updates`,
      );
      assert.ok(
        result.counts[1] > 1000,
        `${name}: portable player blank after ${updates} updates`,
      );
      await page.waitForTimeout(25);
    }
    assert.ok(updates >= 240, "stress more than 200 distinct mask updates");
    assert.equal(
      await page
        .locator("#preview [data-preview-content]")
        .getAttribute("mask"),
      stableMask,
    );
    assert.equal(
      await page.locator("#preview > svg").evaluate((el) => el.style.maskImage),
      "",
    );
    assert.deepEqual(errors, []);
    await writeFile(
      path.join(artifacts, `${name}-frames.json`),
      JSON.stringify({ version: browser.version(), updates, counts }),
    );
    // The actual editor must use the same stable native mask and clean it up.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(app);
    await page.getByLabel("Upload SVG files", { exact: true }).setInputFiles({
      name: "firefox-mask.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(data.svg),
    });
    await poll(
      async () =>
        (await page.locator(".icon-inspector h3").textContent()) ===
        "firefox-mask",
      "uploaded Firefox artwork",
    );
    await page
      .getByRole("checkbox", { name: "Enable fill animation", exact: true })
      .check();
    const slider = page.getByLabel("Fill animation progress", { exact: true });
    await poll(() => slider.isEnabled(), "mask ready");
    await slider.fill("35");
    await page
      .locator(".selected-artwork [data-preview-content][mask]")
      .waitFor();
    const id = await page
      .locator(".selected-artwork [data-preview-content]")
      .getAttribute("mask");
    await slider.fill("65");
    assert.equal(
      await page
        .locator(".selected-artwork [data-preview-content]")
        .getAttribute("mask"),
      id,
    );
    await page.getByRole("tab", { name: "Colors", exact: true }).click();
    assert.equal(
      await page.locator(".selected-artwork [data-preview-mask]").count(),
      0,
    );
    assert.equal(await page.locator(".selected-artwork path").count(), 1);
    await page
      .getByRole("tab", { name: "Fill animation", exact: true })
      .click();
    await page
      .locator(".selected-artwork [data-preview-content][mask]")
      .waitFor();
    await page
      .getByRole("checkbox", { name: "Enable fill animation", exact: true })
      .uncheck();
    assert.equal(
      await page.locator(".selected-artwork [data-preview-content]").count(),
      0,
    );
    assert.equal(await page.locator(".selected-artwork path").count(), 1);
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${name}: ${updates} mask updates, ${counts.length} captured frames without blanking; stable preview reference, editor lifecycle and unchanged portable player`,
    );
    await browser.close();
    browser = null;
  }
} finally {
  await browser?.close();
  if (server) await stop(server);
  if (fixture) await new Promise((resolve) => fixture.close(resolve));
}
