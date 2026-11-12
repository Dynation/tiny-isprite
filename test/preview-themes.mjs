import assert from "node:assert/strict";
import { chromium, firefox } from "@playwright/test";
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
    }, "zoom server");
  }
  for (const engine of [chromium, firefox]) {
    browser = await engine.launch();
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    await page.goto(url);
    await page.locator(".selected-artwork > svg").waitFor();
    await page.getByRole("tab", { name: "Colors", exact: true }).click();
    const themeToggle = page.getByRole("button", {
      name: "Dark page theme",
      exact: true,
    });
    const luminance = (rgb) => {
      const channels = rgb
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
        .map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const contrast = (a, b) => {
      const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    for (const pageTheme of ["light", "dark"]) {
      if (
        (await themeToggle.getAttribute("aria-pressed")) !==
        String(pageTheme === "dark")
      )
        await themeToggle.click();
      for (const previewTheme of ["light", "dark"]) {
        await page
          .getByRole("button", {
            name: `${previewTheme === "light" ? "Light" : "Dark"} preview`,
            exact: true,
          })
          .click();
        // Artwork foreground must not leak into editor controls, even at an extreme value.
        await page
          .locator(".selected-preview")
          .evaluate((el) => (el.style.color = "#ffffff"));
        const styles = await page
          .locator(".selected-preview")
          .evaluate((el) => {
            const css = (selector) =>
              getComputedStyle(el.querySelector(selector));
            return {
              background: getComputedStyle(el).backgroundColor,
              zoom: css("output").color,
              help: css(".canvas-zoom-help").color,
              caption: css("small").color,
              button: css('[aria-label="Zoom in preview"]').color,
              buttonBackground: css('[aria-label="Zoom in preview"]')
                .backgroundColor,
            };
          });
        assert.equal(
          styles.background,
          previewTheme === "light" ? "rgb(255, 255, 255)" : "rgb(15, 23, 42)",
        );
        for (const label of ["zoom", "help", "caption"])
          assert.ok(
            contrast(styles[label], styles.background) >= 4.5,
            `${engine.name()} ${pageTheme}/${previewTheme} ${label} contrast`,
          );
        assert.ok(contrast(styles.button, styles.buttonBackground) >= 4.5);
        await page
          .getByRole("button", { name: "Zoom in preview", exact: true })
          .click();
        assert.equal(
          await page.getByLabel("Preview zoom", { exact: true }).textContent(),
          "150%",
        );
        await page.getByRole("button", { name: "Fit", exact: true }).click();
        await mkdir(path.join(repo, ".release-artifacts/preview-themes"), {
          recursive: true,
        });
        await page.locator(".selected-preview").screenshot({
          path: path.join(
            repo,
            `.release-artifacts/preview-themes/${engine.name()}-${pageTheme}-${previewTheme}.png`,
          ),
        });
      }
    }
    await browser.close();
    browser = null;
  }
  console.log(
    "PASS Chromium/Firefox: four page/preview theme combinations, independent canvas surface, readable zoom/buttons/help and functional zoom",
  );
} finally {
  await browser?.close();
  if (server) await stop(server);
}
