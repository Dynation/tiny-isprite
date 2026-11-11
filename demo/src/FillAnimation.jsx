import { animationAiPrompt } from "./lib/animation-guide.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  buildDistanceField,
  prepareFillField,
  drawFillMask,
  radialCss,
} from "./lib/fill-animation.js";
import { RegionOverlay } from "./RegionOrigins.jsx";
import { download } from "./lib/project.js";
import {
  encodeAnimation,
  createAnimationBundle,
} from "./lib/animation-export.js";
import playerSource from "./lib/animation-player.js?raw";
import reactSource from "./lib/animation-react.jsx?raw";
import exampleHtml from "./lib/animation-example.html?raw";
import license from "./lib/animation-license.txt?raw";

const emptyRegions = { origins: {}, selected: 0, placing: false };

export function FillAnimation({
  svg,
  variables,
  targetRef,
  aspectRatio,
  active = true,
  initiallyEnabled = false,
  name = "icon",
  palettes = { light: {}, dark: {} },
  defaultTheme = "light",
}) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [mode, setMode] = useState("flow");
  const [x, setX] = useState(50),
    [y, setY] = useState(50);
  const [settings, setSettings] = useState({});
  const [progress, setProgress] = useState(100);
  const [analysis, setPrepared] = useState(null);
  const [regionMode, setRegionMode] = useState(false);
  const [regionConfig, setRegionConfig] = useState(emptyRegions);
  const geometryKey = useMemo(() => {
    if (!svg) return "";
    const root = new DOMParser().parseFromString(
      svg,
      "image/svg+xml",
    ).documentElement;
    root.removeAttribute("width");
    root.removeAttribute("height");
    root.removeAttribute("color");
    return new XMLSerializer()
      .serializeToString(root)
      .replace(/var\((--[\w-]+),[^)]+\)/g, "var($1)");
  }, [svg]);
  const regions =
    regionConfig.key === geometryKey ? regionConfig : emptyRegions;
  function changeRegions(patch) {
    stop();
    setRegionConfig((previous) => ({
      ...(previous.key === geometryKey ? previous : emptyRegions),
      key: geometryKey,
      ...patch,
    }));
  }
  function placeRegion(px, py) {
    changeRegions({
      origins: {
        ...regions.origins,
        [regions.selected]: { x: px / 100, y: py / 100 },
      },
      placing: false,
    });
  }
  const prepared = useMemo(
    () =>
      regionMode && analysis
        ? {
            ...analysis,
            ...buildDistanceField(
              analysis.labels,
              analysis.width,
              analysis.height,
              x / 100,
              y / 100,
              regions.origins,
            ),
          }
        : analysis,
    [analysis, regionMode, regions.origins, x, y],
  );
  const selectedRegion = prepared?.components[regions.selected];
  const regionOrigin = regions.origins[regions.selected] || {
    x: x / 100,
    y: y / 100,
  };
  const analysisX = regionMode ? 50 : x,
    analysisY = regionMode ? 50 : y;
  const [viewportRatio, setViewportRatio] = useState(aspectRatio);
  const analysisRatio = regionMode ? aspectRatio : viewportRatio;
  const [error, setError] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState("");
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [stats, setStats] = useState({ revealed: 0, painted: 0 });
  const frame = useRef(0),
    lastFrame = useRef(0);
  const activePalette = palettes[defaultTheme] || palettes.light || {};
  const groups = variables.length
    ? variables.map((variable) => {
        const value = activePalette[variable.name] || variable.value;
        return {
          ...variable,
          color: value === "currentColor" ? activePalette.color : value,
        };
      })
    : [{ name: "all-paint", property: "All visible paint" }];
  const tracks = groups.map((group, index) => ({
    name: group.name,
    start: initiallyEnabled ? Number((index * 0.18).toFixed(2)) : 0,
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
      target.style.removeProperty("mask-position");
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
    prepareFillField(svg, variables, analysisX, analysisY, analysisRatio)
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
  }, [enabled, svg, analysisX, analysisY, active, analysisRatio, regionMode]);
  useEffect(() => {
    stop();
  }, [mode, signature, x, y, regionMode]);
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
    const preserve =
      target.getAttribute("preserveAspectRatio") || "xMidYMid meet";
    const align =
      preserve.split(/\s+/).find((value) => /^x(Min|Mid|Max)Y/.test(value)) ||
      "xMidYMid";
    target.style.maskSize =
      regionMode && !preserve.includes("none")
        ? preserve.includes("slice")
          ? "cover"
          : "contain"
        : "100% 100%";
    target.style.maskPosition = `${align.startsWith("xMin") ? "left" : align.startsWith("xMax") ? "right" : "center"} ${align.endsWith("YMin") ? "top" : align.endsWith("YMax") ? "bottom" : "center"}`;
    target.style.maskRepeat = "no-repeat";
    target.style.cursor = "crosshair";
    setStats({ revealed: result.revealed, painted: result.painted });
  }, [enabled, prepared, progress, mode, signature, active, regionMode]);
  useEffect(() => {
    const target = targetRef.current?.querySelector("svg");
    if (!enabled || !target || !active || regionMode) return;
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
  }, [enabled, svg, active, regionMode]);
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
  async function copyAiPrompt() {
    try {
      await navigator.clipboard.writeText(animationAiPrompt);
      setCopyNotice(
        "Prompt copied. Attach the ZIP to your chat, or give your coding agent the extracted folder path.",
      );
    } catch {
      setShowGuide(true);
      setCopyNotice(
        "Clipboard unavailable. Select and copy the prompt below manually.",
      );
    }
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
          <div className="animation-integration">
            <button
              type="button"
              className="button secondary"
              onClick={copyAiPrompt}
            >
              Copy AI prompt
            </button>
            <p>
              Copies text only. Download the animation ZIP and attach it to your
              chat, or give your coding agent the path to the extracted folder.
              Files are not sent automatically.
            </p>
            {copyNotice && <p role="status">{copyNotice}</p>}
            <details
              open={showGuide}
              onToggle={(event) => setShowGuide(event.currentTarget.open)}
            >
              <summary>How to use your animation ZIP</summary>
              <ol>
                <li>
                  Export and extract the animation ZIP. Open README.md for the
                  full guide.
                </li>
                <li>
                  Try the demo: in the extracted folder, run{" "}
                  <code>python3 -m http.server 8080</code> if Python is
                  installed, then open http://localhost:8080 and click Replay.
                  Use HTTP, not a double-click on index.html.
                </li>
                <li>
                  HTML: copy <code>player.js</code> and{" "}
                  <code>animation-data.js</code>, then use the complete HTML
                  example in README.md.
                </li>
                <li>
                  React: also copy <code>AnimatedIcon.jsx</code> beside those
                  files and render it with <code>autoPlay</code> to start. It
                  defaults to false. See <code>react-example.jsx</code> for
                  manual controls.
                </li>
              </ol>
              <p>
                No tiny-isprite install is needed. Regular SVG/React downloads
                and artwork.svg are static. Reduced motion is respected.
              </p>
              <label>
                AI integration prompt
                <textarea
                  readOnly
                  rows={10}
                  value={animationAiPrompt}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
            </details>
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
          <label className="region-mode-toggle">
            <input
              type="checkbox"
              checked={regionMode}
              onChange={(event) => {
                stop();
                setRegionMode(event.target.checked);
              }}
            />
            Separate region origins
          </label>
          {regionMode && prepared && (
            <section
              className="region-origin-controls"
              aria-label="Region origin editor"
            >
              <label>
                Selected region
                <select
                  aria-label="Selected region"
                  value={regions.selected}
                  onChange={(event) =>
                    changeRegions({
                      selected: Number(event.target.value),
                      placing: false,
                    })
                  }
                >
                  {prepared.components.map((region) => (
                    <option key={region.id} value={region.id}>
                      Region {region.id + 1} ·{" "}
                      {groups[region.group]?.property || "Paint"} ·{" "}
                      {region.pixels} samples
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Click a painted area to select it. The blue overlay highlights
                that region; the pin shows its actual inlet. Small regions are
                selectable from the list.
              </p>
              {selectedRegion && (
                <>
                  <div className="animation-paint-label">
                    {groups[selectedRegion.group]?.color && (
                      <span
                        className="animation-color-dot"
                        style={{
                          backgroundColor: groups[selectedRegion.group].color,
                        }}
                        role="img"
                        aria-label={`Selected region color: ${groups[selectedRegion.group].color}`}
                      />
                    )}
                    <code>{groups[selectedRegion.group]?.name}</code>
                  </div>
                  <div className="animation-controls">
                    <label>
                      Region X (%)
                      <input
                        type="number"
                        aria-label="Region origin X"
                        min="0"
                        max="100"
                        step="0.1"
                        value={Number((regionOrigin.x * 100).toFixed(1))}
                        onChange={(event) =>
                          placeRegion(
                            Math.max(
                              0,
                              Math.min(100, Number(event.target.value)),
                            ),
                            regionOrigin.y * 100,
                          )
                        }
                      />
                    </label>
                    <label>
                      Region Y (%)
                      <input
                        type="number"
                        aria-label="Region origin Y"
                        min="0"
                        max="100"
                        step="0.1"
                        value={Number((regionOrigin.y * 100).toFixed(1))}
                        onChange={(event) =>
                          placeRegion(
                            regionOrigin.x * 100,
                            Math.max(
                              0,
                              Math.min(100, Number(event.target.value)),
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="button secondary"
                    aria-pressed={regions.placing}
                    onClick={() => changeRegions({ placing: !regions.placing })}
                  >
                    {regions.placing
                      ? "Cancel point placement"
                      : "Place origin on artwork"}
                  </button>
                  <button
                    type="button"
                    className="palette-copy"
                    disabled={!regions.origins[regions.selected]}
                    onClick={() => {
                      const origins = { ...regions.origins };
                      delete origins[regions.selected];
                      changeRegions({ origins, placing: false });
                    }}
                  >
                    Use shared origin for this region
                  </button>
                  <p role="status">
                    {regions.placing
                      ? `Click anywhere on the artwork to place Region ${regions.selected + 1}’s origin.`
                      : regions.origins[regions.selected]
                        ? "Custom origin. Other regions keep their own settings."
                        : "Using the shared origin above. Change X/Y or place a point to override it."}
                  </p>
                </>
              )}
            </section>
          )}
          {regionMode && enabled && active && prepared && (
            <RegionOverlay
              prepared={prepared}
              targetRef={targetRef}
              selected={regions.selected}
              placing={regions.placing}
              onSelect={(selected) =>
                changeRegions({ selected, placing: false })
              }
              onPlace={placeRegion}
            />
          )}
          <p>
            {regionMode
              ? "Region coordinates are relative to the artwork, so they survive resizing. Geometry or paint-group changes reset region overrides; color edits keep them."
              : "Click the artwork to choose the shared inlet, or use the X/Y sliders."}{" "}
            Each paint can start before another finishes.
          </p>
          <div className="animation-tracks">
            {tracks.map((track, index) => (
              <fieldset key={track.name}>
                <legend>
                  {groups[index].property || `Paint ${index + 1}`}
                </legend>
                <div className="animation-paint-label">
                  {groups[index].color && (
                    <span
                      className="animation-color-dot"
                      style={{ backgroundColor: groups[index].color }}
                      role="img"
                      aria-label={`Current color ${track.name}: ${groups[index].color}`}
                      title={groups[index].color}
                    />
                  )}
                  <code>{track.name}</code>
                </div>
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
