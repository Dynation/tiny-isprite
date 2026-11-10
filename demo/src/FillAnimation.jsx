import React, { useEffect, useRef, useState } from "react";
import {
  prepareFillField,
  drawFillMask,
  radialCss,
} from "./lib/fill-animation.js";
import { download } from "./lib/project.js";
import {
  encodeAnimation,
  createAnimationBundle,
} from "./lib/animation-export.js";
import playerSource from "./lib/animation-player.js?raw";
import reactSource from "./lib/animation-react.jsx?raw";
import exampleHtml from "./lib/animation-example.html?raw";
import license from "./lib/animation-license.txt?raw";

export function FillAnimation({
  svg,
  variables,
  targetRef,
  aspectRatio,
  active = true,
  name = "icon",
  palettes = { light: {}, dark: {} },
  defaultTheme = "light",
}) {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState("flow");
  const [x, setX] = useState(50),
    [y, setY] = useState(50);
  const [settings, setSettings] = useState({});
  const [progress, setProgress] = useState(100);
  const [prepared, setPrepared] = useState(null);
  const [viewportRatio, setViewportRatio] = useState(aspectRatio);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState("");
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [stats, setStats] = useState({ revealed: 0, painted: 0 });
  const frame = useRef(0),
    lastFrame = useRef(0);
  const groups = variables.length
    ? variables
    : [{ name: "all-paint", property: "All visible paint" }];
  const tracks = groups.map((group, index) => ({
    name: group.name,
    start: 0,
    duration: 1.8,
    end: 100,
    ...settings[group.name],
    index,
  }));
  const total = Math.max(
    ...tracks.map((track) => track.start + track.duration),
  );
  const signature = JSON.stringify(tracks);
  function stop() {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    setPlaying(false);
  }
  function clearMask() {
    const target = targetRef.current?.querySelector("svg");
    if (target) {
      target.style.removeProperty("mask-image");
      target.style.removeProperty("-webkit-mask-image");
      target.style.removeProperty("mask-size");
      target.style.removeProperty("mask-repeat");
      target.style.removeProperty("cursor");
    }
  }
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduced(media.matches);
      if (media.matches) {
        stop();
        setProgress(100);
      }
    };
    media.addEventListener("change", update);
    return () => {
      media.removeEventListener("change", update);
      cancelAnimationFrame(frame.current);
      clearMask();
    };
  }, []);
  // Match the raster mask to the actual SVG viewport, including letterboxing.
  useEffect(() => {
    const target = targetRef.current?.querySelector("svg");
    if (!target || !active) return;
    const measure = () => {
      const rect = target.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0)
        setViewportRatio(rect.height / rect.width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, [svg, active]);
  useEffect(() => {
    stop();
    setPrepared(null);
    setError("");
    clearMask();
    if (!enabled || !svg || !active) return;
    let disposed = false;
    prepareFillField(svg, variables, x, y, viewportRatio)
      .then((value) => {
        if (!disposed) setPrepared(value);
      })
      .catch((error) => {
        if (!disposed) setError(error.message || "Could not prepare this SVG.");
      });
    return () => {
      disposed = true;
      clearMask();
    };
  }, [enabled, svg, x, y, active, viewportRatio]);
  useEffect(() => {
    stop();
  }, [mode, signature]);
  useEffect(() => {
    const target = targetRef.current?.querySelector("svg");
    if (!enabled || !prepared || !target || !active) return;
    const result = drawFillMask(
      prepared,
      tracks,
      (progress * total) / 100,
      mode,
      x,
      y,
    );
    target.style.maskImage = result.complete ? "none" : `url("${result.url}")`;
    target.style.webkitMaskImage = result.complete
      ? "none"
      : `url("${result.url}")`;
    target.style.maskSize = "100% 100%";
    target.style.maskRepeat = "no-repeat";
    target.style.cursor = "crosshair";
    setStats({ revealed: result.revealed, painted: result.painted });
  }, [enabled, prepared, progress, mode, signature, active]);
  useEffect(() => {
    const target = targetRef.current?.querySelector("svg");
    if (!enabled || !target || !active) return;
    function selectPoint(event) {
      const bounds = target.getBoundingClientRect();
      stop();
      setX(
        Math.round(
          Math.max(
            0,
            Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100),
          ),
        ),
      );
      setY(
        Math.round(
          Math.max(
            0,
            Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100),
          ),
        ),
      );
    }
    target.addEventListener("click", selectPoint);
    return () => target.removeEventListener("click", selectPoint);
  }, [enabled, svg, active]);
  function play() {
    if (playing) {
      stop();
      return;
    }
    if (reduced) {
      setProgress(100);
      return;
    }
    const start = performance.now();
    lastFrame.current = 0;
    setProgress(0);
    setPlaying(true);
    function tick(now) {
      const value = Math.min(100, (now - start) / (total * 10));
      if (now - lastFrame.current >= 33 || value === 100) {
        setProgress(value);
        lastFrame.current = now;
      }
      if (value < 100) frame.current = requestAnimationFrame(tick);
      else {
        frame.current = 0;
        setPlaying(false);
      }
    }
    frame.current = requestAnimationFrame(tick);
  }
  function update(name, key, value) {
    stop();
    setSettings((previous) => ({
      ...previous,
      [name]: { ...previous[name], [key]: value },
    }));
  }
  async function exportAnimation() {
    if (!prepared || exporting) return;
    stop();
    setExporting(true);
    setExportNotice("");
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const data = encodeAnimation({
        svg,
        prepared,
        tracks,
        mode,
        originX: x,
        originY: y,
        palettes,
        defaultTheme,
        name,
        initialProgress: progress,
      });
      const bundle = createAnimationBundle(data, {
        playerSource,
        reactSource,
        exampleHtml,
        license,
      });
      download(bundle, `${name}-animation.zip`, "application/zip");
      setExportNotice(
        "Export saved. Extract the ZIP and serve its index.html, or copy the React files into your app.",
      );
    } catch (error) {
      setExportNotice(`Export failed: ${error.message}`);
    } finally {
      setExporting(false);
    }
  }
  const css = radialCss(x, y, tracks[0].duration);
  return (
    <section className="fill-animation" aria-label="Optional fill animation">
      <label className="animation-enable">
        <input
          id="enable-fill-animation"
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            stop();
            setEnabled(event.target.checked);
            setProgress(100);
          }}
        />
        Enable fill animation
      </label>
      {enabled && (
        <>
          <div className="animation-playback">
            <button
              type="button"
              className="button secondary"
              disabled={!prepared || !!error}
              onClick={play}
            >
              {playing ? "Pause fill" : "Play fill"}
            </button>
            <label>
              Timeline {Math.round(progress)}% ·{" "}
              {((progress * total) / 100).toFixed(2)} / {total.toFixed(2)} s
              <input
                aria-label="Fill animation progress"
                type="range"
                min="0"
                max="100"
                step="1"
                value={progress}
                disabled={!prepared}
                onChange={(event) => {
                  stop();
                  setProgress(Number(event.target.value));
                }}
              />
            </label>
            <button
              type="button"
              className="button primary animation-export-action"
              disabled={!prepared || !!error || exporting}
              onClick={exportAnimation}
            >
              {exporting ? "Preparing animation ZIP…" : "Export animation ZIP"}
            </button>
          </div>
          <div className="animation-status" role="status">
            {error ||
              (!prepared
                ? "Preparing fill paths…"
                : `${prepared.components.length} connected regions · ${stats.revealed} / ${stats.painted} painted samples visible`)}
          </div>
          <p>
            Flow follows painted shapes around holes on a 320px analysis grid.
            Disconnected islands get their own inlet nearest your selected
            point. Original vector paths stay intact. This is a visual
            approximation, not a fluid simulation.
          </p>
          <div className="animation-controls">
            <label>
              Fill effect
              <select
                aria-label="Fill effect"
                value={mode}
                onChange={(event) => setMode(event.target.value)}
              >
                <option value="flow">Flow inside shape</option>
                <option value="radial">Radial from point</option>
              </select>
            </label>
            <label>
              Origin X (%)
              <input
                aria-label="Fill origin X"
                type="range"
                min="0"
                max="100"
                value={x}
                onChange={(event) => setX(Number(event.target.value))}
              />
              <output>{x}%</output>
            </label>
            <label>
              Origin Y (%)
              <input
                aria-label="Fill origin Y"
                type="range"
                min="0"
                max="100"
                value={y}
                onChange={(event) => setY(Number(event.target.value))}
              />
              <output>{y}%</output>
            </label>
          </div>
          <p>
            Click the artwork to choose the inlet, or use the X/Y sliders. Each
            paint can start before another finishes.
          </p>
          <div className="animation-tracks">
            {tracks.map((track, index) => (
              <fieldset key={track.name}>
                <legend>
                  {groups[index].property || `Paint ${index + 1}`}
                </legend>
                <code>{track.name}</code>
                <div className="animation-controls">
                  <label>
                    Start (s)
                    <input
                      aria-label={`Animation start ${track.name}`}
                      type="number"
                      min="0"
                      max="30"
                      step="0.1"
                      value={track.start}
                      onChange={(event) =>
                        update(
                          track.name,
                          "start",
                          Math.max(
                            0,
                            Math.min(30, Number(event.target.value) || 0),
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Duration (s)
                    <input
                      aria-label={`Animation duration ${track.name}`}
                      type="number"
                      min="0.1"
                      max="30"
                      step="0.1"
                      value={track.duration}
                      onChange={(event) =>
                        update(
                          track.name,
                          "duration",
                          Math.max(
                            0.1,
                            Math.min(30, Number(event.target.value) || 0.1),
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    End fill (%)
                    <input
                      aria-label={`Animation end ${track.name}`}
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      value={track.end}
                      onChange={(event) =>
                        update(
                          track.name,
                          "end",
                          Math.max(
                            0,
                            Math.min(100, Number(event.target.value) || 0),
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              </fieldset>
            ))}
          </div>
          {!variables.length && (
            <p>
              Generate CSS variables for separate fill/stroke timing. Without
              them this controls all visible paint together.
            </p>
          )}
          {reduced && (
            <p>
              Reduced motion is enabled: Play shows the completed state. The
              timeline remains available for manual inspection.
            </p>
          )}
          <p>
            Export this animation with its prepared fill maps, exact timing and
            light/dark palettes. The ZIP includes a standalone JavaScript
            player, React component, instructions and an independent example
            website. No playground or animation server is needed. Regular
            SVG/React downloads remain static.
          </p>
          {exportNotice && (
            <p role="status" className="animation-export-notice">
              {exportNotice}
            </p>
          )}
          <details>
            <summary>CSS-only radial example</summary>
            <p>
              Apply this class to the standalone component or a wrapper around
              Icon. It reveals the whole icon radially. Shape-following flow and
              independent paint timelines need the JavaScript distance field and
              are not represented by this CSS shortcut.
            </p>
            <pre>
              <code>{css}</code>
            </pre>
            <button
              type="button"
              className="palette-copy"
              onClick={() => download(css, "fill-reveal.css", "text/css")}
            >
              Download radial animation CSS
            </button>
          </details>
        </>
      )}
    </section>
  );
}
