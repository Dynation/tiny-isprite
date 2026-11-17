// Compare trusted source artwork against same-origin external SVG use pixels.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { chromium, firefox, webkit } from "@playwright/test";
import { PNG } from "pngjs";
import { parseSvg, serialize } from "../core/svg-document.js";
import { build } from "esbuild";
import { buildSpriteContent } from "../core/sprite-content.js";

const artifacts = new URL(
  "../.release-artifacts/svg-preservation/",
  import.meta.url,
);
await mkdir(artifacts, { recursive: true });
const cases = [];
for (const name of ["login", "omg-logo", "stihl", "gradient-a", "gradient-b"])
  cases.push({
    name,
    content: await readFile(
      new URL(`./fixtures/svg/${name}.svg`, import.meta.url),
      "utf8",
    ),
  });
cases.push(
  {
    name: "root-stroke",
    content:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M6 18 18 6"/></svg>',
  },
  {
    name: "root-style",
    content:
      '<svg viewBox="0 0 24 24" style="fill:#e11d48;stroke:#2563eb;stroke-width:2;opacity:.7"><circle cx="12" cy="12" r="8"/></svg>',
  },
  {
    name: "root-transform",
    content:
      '<svg viewBox="0 0 24 24" transform="translate(2 1)" fill="#16a34a"><circle cx="10" cy="10" r="7"/></svg>',
  },
  {
    name: "css-selector-a",
    content:
      '<svg id="art" viewBox="0 0 24 24"><style>svg > path{fill:#2563eb} :root{color:#16a34a} #p\\:1,[id="p:1"]{stroke:currentColor;stroke-width:2} .mark{opacity:.7}</style><path id="p:1" class="mark" d="M3 3h18v18H3z"/></svg>',
  },
  {
    name: "css-selector-b",
    content:
      '<svg id="art" viewBox="0 0 24 24"><style>svg > path{fill:#e11d48} :root{color:#facc15} #p\\:1{stroke:currentColor;stroke-width:3}</style><path id="p:1" d="M3 3h18v18H3z"/></svg>',
  },
  {
    name: "mask-use",
    content:
      '<svg xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24"><defs><mask id="mask"><rect width="24" height="24" fill="white"/><circle cx="12" cy="12" r="5" fill="black"/></mask><path id="shape" d="M1 1h22v22H1z"/></defs><g mask="url(#mask)"><use xlink:href="#shape" fill="#2563eb"/></g></svg>',
  },
  {
    name: "css-vars",
    content:
      '<svg viewBox="0 0 24 24" fill="var(--tone, #2563eb)"><circle cx="12" cy="12" r="9"/></svg>',
  },
  {
    name: "pattern",
    content:
      '<svg viewBox="0 0 24 24"><defs><pattern id="tile" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="3" height="6" fill="#e11d48"/><rect x="3" width="3" height="6" fill="#ffffff"/></pattern></defs><rect x="2" y="2" width="20" height="20" fill="url(#tile)"/></svg>',
  },
  {
    name: "filter",
    content:
      '<svg viewBox="0 0 24 24"><defs><filter id="blur"><feGaussianBlur stdDeviation=".6"/></filter></defs><circle cx="12" cy="12" r="7" fill="#2563eb" filter="url(#blur)"/></svg>',
  },
  {
    name: "aspect-none",
    content:
      '<svg viewBox="0 0 48 24" preserveAspectRatio="none" fill="#e11d48"><rect x="3" y="3" width="42" height="18"/></svg>',
  },
  {
    name: "text-space",
    content:
      '<svg viewBox="0 0 96 96" fill="#2563eb"><text x="4" y="50" xml:space="preserve">A  B</text></svg>',
  },
);
const icons = cases.map((c) => ({ name: `${c.name}.svg`, content: c.content }));
const options = { icons, preserveColored: true, minify: true, prefix: "inline-" };
const inlineResult = await buildSpriteContent(options);
const inlineOnly = new Set([
  "gradient-a",
  "gradient-b",
  "mask-use",
  "pattern",
  "filter",
]);
const externalOptions = {
  ...options,
  target: "external",
  prefix: "external-",
  icons: icons.filter(
    (icon) => !inlineOnly.has(icon.name.replace(/\.svg$/, "")),
  ),
};
const result = await buildSpriteContent(externalOptions);
const spriteFile =
  "/sprite." +
  createHash("sha256").update(result.sprite).digest("hex").slice(0, 20) +
  ".svg";
const bundle = await build({
  stdin: {
    contents: 'export {buildSpriteContent} from "tiny-isprite/browser"',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "browser",
  format: "esm",
  write: false,
});
const markup = `<!doctype html><style>body{margin:16px;background:white;color:#7c3aed;font:14px Arial}.row{display:grid;grid-template-columns:160px 96px 96px 96px;gap:16px;margin:12px 0;align-items:center}.icon,iframe{width:96px;height:96px;border:0;background:white}svg{display:block;font:16px Arial}h1{font-size:24px}</style><h1>Original SVG / inline sprite / external sprite</h1>${inlineResult.sprite}<div id="cases"></div><script type="module">
const cases=${JSON.stringify(cases).replace(/</g, "\\u003c")};
const inlineOnly=${JSON.stringify(["gradient-a", "gradient-b", "mask-use", "pattern", "filter"])};
for(const item of cases){
 const row=document.createElement('div');row.className='row';
 const label=document.createElement('span');label.textContent=item.name;row.append(label);
 const frame=document.createElement('iframe');frame.dataset.original=item.name;
 frame.src='/original/'+item.name+'.svg';row.append(frame);
 for(const mode of ['inline','external']){
  if(mode==='external' && inlineOnly.includes(item.name)){const label=document.createElement('span');label.textContent='Inline only';row.append(label);continue;}
  const host=document.createElement('div');host.className='icon';host.dataset[mode]=item.name;host.style.setProperty('--tone','#2563eb');if(item.name==='stihl')host.style.background='#111827';host.innerHTML='<svg width="96" height="96" aria-hidden="true"><use href="'+(mode==='external'?'${spriteFile}':'')+'#'+(mode==='external'?'external-':'inline-')+item.name+'"></use></svg>';row.append(host);
 }
 document.querySelector('#cases').append(row);
}
import {buildSpriteContent} from '/engine.js';
const generated=await buildSpriteContent(${JSON.stringify(externalOptions).replace(/</g, "\\u003c")});
window.engineResult=generated;
window.engineInline=await buildSpriteContent(${JSON.stringify(options).replace(/</g, "\\u003c")});
</script>`;
const server = createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname.startsWith("/original/")) {
    const item = cases.find(
      (item) => pathname === "/original/" + item.name + ".svg",
    );
    if (!item) {
      res.writeHead(404);
      res.end();
      return;
    }
    const root = parseSvg(item.content);
    root.setAttribute("width", "96");
    root.setAttribute("height", "96");
    if (!root.hasAttribute("color")) root.setAttribute("color", "#7c3aed");
    if (!root.hasAttribute("font-family"))
      root.setAttribute("font-family", "Arial");
    if (!root.hasAttribute("font-size")) root.setAttribute("font-size", "16");
    root.setAttribute(
      "style",
      (item.name === "stihl" ? "background:#111827;" : "") + "--tone:#2563eb;" + (root.getAttribute("style") || ""),
    );
    res.setHeader("Content-Type", "image/svg+xml");
    res.end(serialize(root));
  } else if (pathname === spriteFile) {
    res.setHeader("Content-Type", "image/svg+xml");
    res.end(result.sprite);
  } else if (pathname === "/engine.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(bundle.outputFiles[0].text);
  } else if (pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
  } else {
    res.setHeader("Content-Type", "text/html");
    res.end(markup);
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const url = `http://127.0.0.1:${server.address().port}`;
const results = [];
try {
  for (const [name, engine, executablePath] of [
    ["chromium", chromium, process.env.SVG_CHROMIUM_EXECUTABLE],
    ["firefox", firefox, process.env.SVG_FIREFOX_EXECUTABLE],
    ["webkit", webkit, process.env.SVG_WEBKIT_EXECUTABLE],
  ]) {
    let browser;
    const summary = { name, errors: [], comparisons: [] };
    try {
      browser = await engine.launch({ headless: true, executablePath });
      summary.version = browser.version();
      const page = await browser.newPage({
        viewport: { width: 1100, height: 2200 },
        deviceScaleFactor: 1,
      });
      page.on("pageerror", (e) => summary.errors.push(e.message));
      page.on("console", (e) => {
        if (e.type() === "error") summary.errors.push(e.text());
      });
      await page.goto(url + "/?page-query=kept", { waitUntil: "networkidle" });
      await page.waitForFunction(() => window.engineResult);
      assert.deepEqual(
        await page.evaluate(() => window.engineResult),
        result,
        "browser generator bytes must match Node",
      );
      assert.deepEqual(
        await page.evaluate(() => window.engineInline),
        inlineResult,
      );
      for (const item of cases.filter((item) => inlineOnly.has(item.name)))
        await assert.rejects(
          buildSpriteContent({
            ...options,
            target: "external",
            icons: [{ name: item.name + ".svg", content: item.content }],
          }),
          /inline sprite/,
        );
      for (const item of cases)
        for (const mode of ["inline", "external"]) {
          if (mode === "external" && inlineOnly.has(item.name)) continue;
          const original = PNG.sync.read(
            await page.locator(`[data-original="${item.name}"]`).screenshot(),
          );
          const sprite = PNG.sync.read(
            await page.locator(`[data-${mode}="${item.name}"]`).screenshot(),
          );
          let different = 0,
            maxDelta = 0;
          const edge = (image, index) => {
            const x = index % 96,
              y = Math.floor(index / 96);
            let range = 0;
            for (let c = 0; c < 3; c++) {
              let min = 255,
                max = 0;
              for (let yy = Math.max(0, y - 1); yy <= Math.min(95, y + 1); yy++)
                for (
                  let xx = Math.max(0, x - 1);
                  xx <= Math.min(95, x + 1);
                  xx++
                ) {
                  const v = image.data[(yy * 96 + xx) * 4 + c];
                  min = Math.min(min, v);
                  max = Math.max(max, v);
                }
              range = Math.max(range, max - min);
            }
            return range > 32;
          };
          for (let i = 0; i < original.data.length; i += 4) {
            let delta = 0;
            for (let c = 0; c < 3; c++)
              delta = Math.max(
                delta,
                Math.abs(original.data[i + c] - sprite.data[i + c]),
              );
            const tolerance =
              edge(original, i / 4) || edge(sprite, i / 4) ? 64 : 1;
            if (delta > tolerance) different++;
            maxDelta = Math.max(delta, maxDelta);
          }
          summary.comparisons.push({
            fixture: item.name,
            mode,
            differentPixels: different,
            maxDelta,
          });
          if (different > 0) {
            await writeFile(
              new URL(`${name}-${mode}-${item.name}-original.png`, artifacts),
              PNG.sync.write(original),
            );
            await writeFile(
              new URL(`${name}-${mode}-${item.name}-sprite.png`, artifacts),
              PNG.sync.write(sprite),
            );
          }
        }
      const badge = page.locator('[data-external="css-vars"]');
      const before = PNG.sync.read(await badge.screenshot());
      await badge.evaluate((el) => el.style.setProperty("--tone", "#ef4444"));
      const after = PNG.sync.read(await badge.screenshot());
      const pixel = (image) =>
        Array.from(
          image.data.subarray((48 * 96 + 48) * 4, (48 * 96 + 48) * 4 + 3),
        );
      assert.deepEqual(pixel(before), [37, 99, 235]);
      assert.deepEqual(pixel(after), [239, 68, 68]);
      await page.screenshot({
        path: new URL(`${name}.png`, artifacts).pathname,
        fullPage: true,
      });
      // A full-page repaint must not change the resolved CSS appearance.
      const center = async selector => {
        const image=PNG.sync.read(await page.locator(selector).screenshot());
        return Array.from(image.data.subarray((48*96+48)*4,(48*96+48)*4+3));
      };
      const originalCenter=await center('[data-original="css-selector-a"]');
      for(const mode of ['inline','external'])assert.deepEqual(await center(`[data-${mode}="css-selector-a"]`),originalCenter);
      assert.deepEqual(summary.errors, []);
      assert.ok(
        summary.comparisons.every((c) => c.differentPixels === 0),
        JSON.stringify(summary.comparisons.filter((c) => c.differentPixels)),
      );
      summary.status = "passed";
    } catch (error) {
      summary.status = "failed";
      summary.failure = String(error);
      process.exitCode = 1;
    } finally {
      await browser?.close();
      results.push(summary);
      await writeFile(
        new URL("results.json", artifacts),
        JSON.stringify(
          { browserBundleBytes: bundle.outputFiles[0].text.length, results },
          null,
          2,
        ),
      );
      console.log(name, summary.status, summary.failure || "");
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
