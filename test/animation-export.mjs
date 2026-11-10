import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import http from "node:http";
import { spawn } from "node:child_process";
import { freePort, poll, stop } from "./helpers.mjs";
const require = createRequire(new URL("../demo/package.json", import.meta.url));
const { unzipSync } = require("fflate");
const repo = fileURLToPath(new URL("../", import.meta.url));
const artifacts = path.join(repo, ".release-artifacts/animation-export");
const site = path.join(artifacts, "site");
const temp = await mkdtemp(path.join(tmpdir(), "isprite-motion-"));
await mkdir(artifacts, { recursive: true });
await rm(site, { recursive: true, force: true });
await mkdir(site);
let server, browser, consumer;
try {
  const port = await freePort(),
    url = `http://127.0.0.1:${port}`;
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
  }, "exporter preview");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await poll(
    () =>
      page
        .getByRole("button", { name: "Download bundle", exact: true })
        .isEnabled(),
    "exporter ready",
  );
  await page.getByRole("radio", { name: "Single icon", exact: true }).check();
  const fallback =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="shine"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><path fill="#245cf3" d="M10 10h100v100H10z M35 35v50h50V35z" fill-rule="evenodd"/><circle cx="60" cy="60" r="15" fill="#e85959"/><path fill="url(#shine)" d="M12 4h96v4H12z"/></svg>';
  await page.getByLabel("Upload SVG files", { exact: true }).setInputFiles(
    process.env.PLAYGROUND_EXPORT_SVG || {
      name: "portable-test.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from(fallback),
    },
  );
  await poll(
    async () =>
      !(
        await page
          .locator(".icon-card.selected .icon-select > span")
          .textContent()
      ).includes("sparkle"),
    "export artwork selected",
  );
  await page
    .getByRole("button", { name: "Generate editable variables", exact: true })
    .click();
  await poll(
    () =>
      page
        .locator(".variable-picker input")
        .count()
        .then((c) => c >= 2),
    "separate paints",
  );
  const paints = await page
    .locator(".variable-picker input")
    .evaluateAll((nodes) =>
      nodes
        .map((n) => n.getAttribute("aria-label"))
        .filter((v) => v.startsWith("Color "))
        .map((v) => v.slice(6)),
    );
  await page.getByLabel(`Color ${paints[0]}`, { exact: true }).fill("#3455aa");
  await page
    .getByLabel(`Dark color ${paints[0]}`, { exact: true })
    .fill("#fb923c");
  await page.getByRole("tab", { name: "Fill animation", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Enable fill animation", exact: true })
    .check();
  const ready = () =>
    poll(
      () =>
        page
          .getByRole("button", { name: "Play fill", exact: true })
          .isEnabled(),
      "prepared export maps",
    );
  await ready();
  await page
    .getByLabel(`Animation duration ${paints[0]}`, { exact: true })
    .fill("2.4");
  await page
    .getByLabel(`Animation start ${paints[1]}`, { exact: true })
    .fill("0.4");
  await page
    .getByLabel(`Animation duration ${paints[1]}`, { exact: true })
    .fill("1.1");
  await page
    .getByRole("slider", { name: "Fill origin X", exact: true })
    .fill("35");
  await page
    .getByRole("slider", { name: "Fill origin Y", exact: true })
    .fill("60");
  await ready();
  await page
    .getByRole("slider", { name: "Fill animation progress", exact: true })
    .fill("45");
  const stats = (await page.locator(".animation-status").textContent()).match(
    /· (\d+) \/ (\d+)/,
  );
  assert.ok(stats);
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export animation ZIP", exact: true })
    .click();
  const download = await event;
  const archive = path.join(artifacts, "animation.zip");
  await download.saveAs(archive);
  const files = unzipSync(new Uint8Array(await readFile(archive)));
  for (const [name, bytes] of Object.entries(files)) {
    assert.ok(!name.includes(".."));
    await writeFile(path.join(site, name), bytes);
  }
  const exported = (
    await import(
      "file://" + path.join(site, "animation-data.js") + "?v=" + Date.now()
    )
  ).default;
  assert.equal(exported.initialProgress, 45);
  assert.equal(exported.tracks[0].duration, 2.4);
  assert.equal(exported.tracks[1].start, 0.4);
  assert.equal(exported.palettes.dark[paints[0]], "#fb923c");
  // Serve only extracted ZIP contents on a different origin. The generator is not a dependency.
  consumer = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      const file = path.resolve(
        site,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (!file.startsWith(site + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const body = await readFile(file);
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".svg": "image/svg+xml",
          ".json": "application/json",
        }[path.extname(file)] || "application/octet-stream",
      );
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => consumer.listen(0, "127.0.0.1", resolve));
  const consumerUrl = `http://127.0.0.1:${consumer.address().port}`;
  const consumerContext = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
  });
  const external = [];
  await consumerContext.route("**/*", (route) => {
    const u = route.request().url();
    if (
      !u.startsWith(consumerUrl) &&
      !u.startsWith("data:") &&
      !u.startsWith("blob:")
    ) {
      external.push(u);
      return route.abort();
    }
    return route.continue();
  });
  const consumerPage = await consumerContext.newPage();
  consumerPage.on("pageerror", (e) => errors.push(e.message));
  await consumerPage.goto(consumerUrl);
  await consumerPage.waitForFunction(
    () => window.animationDemo?.players.length === 3,
  );
  const result = await consumerPage.evaluate(() => {
    const { players, animation } = window.animationDemo;
    players.forEach((p) => p.seek(45));
    const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
    return {
      states: players.map((p) => p.getState()),
      ids,
      svgCount: document.querySelectorAll(".motion-host > svg").length,
      theme: animation.defaultTheme,
    };
  });
  await consumerPage.evaluate(() => window.animationDemo.players[0].seek(0));
  const hiddenImage = await consumerPage
    .locator("#hero-art > svg")
    .screenshot();
  await consumerPage.evaluate(() => window.animationDemo.players[0].seek(45));
  const partialImage = await consumerPage
    .locator("#hero-art > svg")
    .screenshot();
  await consumerPage.evaluate(() => window.animationDemo.players[0].seek(100));
  const completeImage = await consumerPage
    .locator("#hero-art > svg")
    .screenshot();
  assert.notEqual(
    Buffer.compare(hiddenImage, partialImage),
    0,
    "prepared mask visibly reveals artwork",
  );
  assert.notEqual(
    Buffer.compare(partialImage, completeImage),
    0,
    "partial image differs from completed vector",
  );
  await consumerPage.evaluate(() => window.animationDemo.players[0].seek(45));
  assert.equal(result.svgCount, 3);
  assert.equal(new Set(result.ids).size, result.ids.length);
  assert.ok(
    Math.abs(result.states[0].revealed - Number(stats[1])) <=
      Math.max(2, Number(stats[2]) * 0.002),
  );
  assert.equal(result.states[0].painted, Number(stats[2]));
  await consumerPage
    .getByRole("button", { name: "Switch theme", exact: true })
    .click();
  assert.notEqual(
    await consumerPage.evaluate(
      () => window.animationDemo.players[0].getState().theme,
    ),
    result.theme,
  );
  await consumerContext.setOffline(true);
  await consumerPage
    .getByRole("button", { name: "Replay animation", exact: true })
    .click();
  await poll(
    () =>
      consumerPage.evaluate(
        () =>
          window.animationDemo.players[0].getState().progress > 0 &&
          window.animationDemo.players[0].getState().playing,
      ),
    "offline playback",
  );
  await consumerPage
    .getByRole("button", { name: "Pause", exact: true })
    .click();
  await consumerPage
    .getByRole("slider", { name: "Exported animation progress", exact: true })
    .fill("55");
  assert.equal(
    await consumerPage.evaluate(
      () => window.animationDemo.players[0].getState().progress,
    ),
    55,
  );
  await consumerPage.screenshot({
    path: path.join(artifacts, "consumer-desktop.png"),
    fullPage: true,
  });
  await consumerPage.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await consumerPage.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await consumerPage.screenshot({
    path: path.join(artifacts, "consumer-mobile.png"),
    fullPage: true,
  });
  await consumerPage.emulateMedia({ reducedMotion: "reduce" });
  await consumerPage
    .getByRole("button", { name: "Replay animation", exact: true })
    .click();
  assert.equal(
    await consumerPage.evaluate(
      () => window.animationDemo.players[0].getState().progress,
    ),
    100,
  );
  assert.equal(
    await consumerPage.evaluate(
      () => window.animationDemo.players[0].getState().playing,
    ),
    false,
  );
  await consumerContext.setOffline(false);
  const cleanup = await consumerPage.evaluate(async () => {
    const { createAnimation } = await import("/player.js");
    const data = structuredClone(window.animationDemo.animation);
    data.tracks[0].end = 55;
    const host = document.createElement("div");
    host.textContent = "original placeholder";
    document.body.appendChild(host);
    const player = createAnimation(host, data, { initialProgress: 100 });
    const partialEnd = player.getState().revealed < player.getState().painted;
    player.setColors({ [data.tracks[0].name]: "#22c55e" });
    const override = host
      .querySelector("svg")
      .style.getPropertyValue(data.tracks[0].name);
    player.setColors();
    const restored = host
      .querySelector("svg")
      .style.getPropertyValue(data.tracks[0].name);
    player.destroy();
    player.destroy();
    const placeholder = host.textContent;
    const remounted = createAnimation(host, data);
    remounted.destroy();
    host.remove();
    return { partialEnd, override, restored, placeholder };
  });
  assert.equal(cleanup.partialEnd, true);
  assert.equal(cleanup.override, "#22c55e");
  assert.notEqual(cleanup.restored, "#22c55e");
  assert.equal(cleanup.placeholder, "original placeholder");
  // Build a separate React consumer from only the exported files + React itself.
  const reactEntry = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{AnimatedIcon}from'./AnimatedIcon.jsx';window.reactPlayers={};function App(){const[p,setP]=useState(100),[theme,setTheme]=useState('light'),[mounted,setMounted]=useState(true);return <><button onClick={()=>setP(45)}>Seek React</button><button onClick={()=>setTheme(t=>t==='light'?'dark':'light')}>Theme React</button><button onClick={()=>setMounted(false)}>Unmount React</button>{mounted&&['a','b','c'].map(id=><AnimatedIcon key={id} width={180} progress={p} theme={theme} onReady={player=>{window.reactPlayers[id]=player}} label={id}/>)}</>}createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);`;
  await writeFile(path.join(site, "react-consumer-entry.jsx"), reactEntry);
  await build({
    entryPoints: [path.join(site, "react-consumer-entry.jsx")],
    bundle: true,
    format: "esm",
    platform: "browser",
    outfile: path.join(site, "react-consumer.js"),
    nodePaths: [path.join(repo, "node_modules")],
    jsx: "automatic",
    logLevel: "silent",
  });
  await writeFile(
    path.join(site, "react.html"),
    '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>React export consumer</title><div id="root"></div><script type="module" src="./react-consumer.js"></script></html>',
  );
  const reactPage = await consumerContext.newPage();
  reactPage.on("pageerror", (e) => errors.push(e.message));
  await reactPage.goto(consumerUrl + "/react.html");
  await reactPage.waitForFunction(
    () =>
      Object.keys(window.reactPlayers || {}).length === 3 &&
      [...document.querySelectorAll("svg")].length === 3,
  );
  await reactPage
    .getByRole("button", { name: "Seek React", exact: true })
    .click();
  await reactPage.waitForFunction(() =>
    Object.values(window.reactPlayers).every(
      (p) => p.getState().progress === 45,
    ),
  );
  await reactPage
    .getByRole("button", { name: "Theme React", exact: true })
    .click();
  await reactPage.waitForFunction(() =>
    Object.values(window.reactPlayers).every(
      (p) => p.getState().theme === "dark",
    ),
  );
  const reactIds = await reactPage
    .locator("[id]")
    .evaluateAll((nodes) => nodes.map((n) => n.id));
  assert.equal(new Set(reactIds).size, reactIds.length);
  await reactPage
    .getByRole("button", { name: "Unmount React", exact: true })
    .click();
  await reactPage.waitForFunction(() =>
    Object.values(window.reactPlayers).every((p) => p.getState().destroyed),
  );
  assert.equal(await reactPage.locator("svg").count(), 0);
  await build({
    entryPoints: [path.join(site, "react-consumer-entry.jsx")],
    bundle: true,
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    format: "esm",
    platform: "browser",
    outfile: path.join(site, "react-consumer-production.js"),
    nodePaths: [path.join(repo, "node_modules")],
    jsx: "automatic",
    logLevel: "silent",
  });
  const productionHtml =
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>React production animation consumer</title><style>body{font:16px/1.6 system-ui;background:#f5f5f0;color:#1b2330;margin:28px}main{max-width:1100px;margin:auto}button{font:inherit;padding:10px 14px;margin:6px;border:1px solid #cbd5df;border-radius:7px;background:white}#root{display:flex;flex-wrap:wrap;align-items:center;gap:16px}</style><main><a href="./">JavaScript consumer</a><h1>React production consumer</h1><p>Three exported components, bundled with React in production mode. The generator is not loaded.</p><div id="root"></div></main><script type="module" src="./react-consumer-production.js"></script></html>';
  await writeFile(path.join(site, "react.html"), productionHtml);
  const productionPage = await consumerContext.newPage();
  productionPage.on("pageerror", (error) => errors.push(error.message));
  await productionPage.goto(consumerUrl + "/react.html");
  await productionPage.waitForFunction(
    () =>
      Object.keys(window.reactPlayers || {}).length === 3 &&
      document.querySelectorAll("svg").length === 3,
  );
  await productionPage
    .getByRole("button", { name: "Seek React", exact: true })
    .click();
  await productionPage.waitForFunction(() =>
    Object.values(window.reactPlayers).every(
      (player) => player.getState().progress === 45,
    ),
  );
  await productionPage.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await productionPage.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await productionPage.screenshot({
    path: path.join(artifacts, "react-production.png"),
    fullPage: true,
  });
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS exported ZIP on an independent origin: preview parity, three unique instances, offline JS playback, theme, responsive layout, reduced motion, React StrictMode/props/unmount; no generator or CDN requests",
  );
  console.log("Consumer files:", site);
} finally {
  await browser?.close();
  await stop(server);
  if (consumer) await new Promise((resolve) => consumer.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
