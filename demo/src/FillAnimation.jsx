import { captureTopology, resolveRegions } from "./lib/animation-state.js";
import { animationAiPrompt } from "./lib/animation-guide.js";
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildDistanceField,
  buildRegionTiming,
  prepareFillField,
  drawFillMask,
  radialCss,
} from "./lib/fill-animation.js";
import { createPortal } from "react-dom";
import { AnimationTour } from "./AnimationTour.jsx";
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

const emptyRegions = {
  origins: {},
  timings: {},
  selected: 0,
  placing: false,
  editing: false,
};

export function FillAnimation({
  svg,
  variables,
  targetRef,
  aspectRatio,
  active = true,
  initiallyEnabled = false,
  initialState,
  onStateChange,
  sourceReady = true,
  onConfigure,
  onShowDownloads,
  name = "icon",
  palettes = { light: {}, dark: {} },
  defaultTheme = "light",
}) {
  const saved = initialState || {};
  const [tourStep, setTourStep] = useState(-1);
  const [tourAdvanced, setTourAdvanced] = useState(false);
  const tourTrigger = useRef(null);
  const [enabled, setEnabled] = useState(saved.enabled ?? initiallyEnabled);
  const [mode, setMode] = useState(saved.mode || "flow");
  const [x, setX] = useState(saved.x ?? 50),
    [y, setY] = useState(saved.y ?? 50);
  const [settings, setSettings] = useState(saved.settings || {});
  const [progress, setProgress] = useState(saved.progress ?? 100);
  const [analysis, setPrepared] = useState(null);
  const [regionMode, setRegionMode] = useState(saved.regionMode || false);
  const [regionConfig, setRegionConfig] = useState(
    saved.regionConfig || emptyRegions,
  );
  const geometryKey = useMemo(() => {
    if (!svg) return "";
    const root = new DOMParser().parseFromString(
      svg,
      "image/svg+xml",
    ).documentElement;
    root.removeAttribute("width");
    root.removeAttribute("height");
    root.removeAttribute("color");
    for (const element of [root, ...root.querySelectorAll("*")]) {
      element.removeAttribute("stroke-width");
      for (const attribute of [...element.attributes]) {
        const variable = attribute.value
          .trim()
          .match(/^var\(\s*(--[\w-]+)(?:\s*,[\s\S]*)?\)$/);
        if (variable) attribute.value = `var(${variable[1]})`;
      }
    }
    // The line-width editor introduces presentation-only group wrappers.
    for (const group of [...root.querySelectorAll("g")].reverse())
      if (!group.attributes.length) group.replaceWith(...group.childNodes);
    return new XMLSerializer().serializeToString(root);
  }, [svg]);
  // Bind imported topology only once the correct generated artwork is ready.
  // Later geometry edits use the normal retained-region reconciliation rules.
  useLayoutEffect(() => {
    if (sourceReady && geometryKey && regionConfig.needsGeometryKey)
      setRegionConfig((previous) => ({
        ...previous,
        key: geometryKey,
        needsGeometryKey: false,
      }));
  }, [sourceReady, geometryKey, regionConfig.needsGeometryKey]);
  const paintNames = variables.length
    ? variables.map((variable) => variable.name)
    : ["all-paint"];
  const paintSignature = JSON.stringify(paintNames);
  const regions = useMemo(
    () => resolveRegions(regionConfig, analysis, paintNames, geometryKey),
    [regionConfig, analysis, geometryKey, paintSignature],
  );
  function changeRegions(patch) {
    stop();
    setRegionConfig({
      ...regions,
      key: geometryKey,
      ...(analysis ? { topology: captureTopology(analysis, paintNames) } : {}),
      ...patch,
    });
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
  const [exportHost, setExportHost] = useState(null),
    [timelineHost, setTimelineHost] = useState(null);
  useEffect(() => {
    setExportHost(document.getElementById("animation-export-slot"));
    setTimelineHost(document.getElementById("animation-timeline-slot"));
  }, []);
  const [copyNotice, setCopyNotice] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState("");
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [stats, setStats] = useState({ revealed: 0, painted: 0 });
  const snapshot = useMemo(
    () => ({
      enabled,
      mode,
      x,
      y,
      settings,
      progress,
      regionMode,
      regionConfig: { ...regionConfig, placing: false, editing: false },
    }),
    [enabled, mode, x, y, settings, progress, regionMode, regionConfig],
  );
  useEffect(() => {
    if (!playing) onStateChange?.(name, snapshot);
  }, [name, snapshot, playing, onStateChange]);
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
  const signature = JSON.stringify(tracks);
  const timing = useMemo(
    () =>
      regionMode && prepared
        ? buildRegionTiming(prepared, tracks, regions.timings)
        : { tracks, labels: prepared?.labels },
    [prepared, regionMode, regions.timings, signature],
  );
  const playback = useMemo(
    () =>
      prepared
        ? {
            ...prepared,
            playbackLabels: timing.labels,
            regionTracks: timing.regionTracks,
          }
        : null,
    [prepared, timing],
  );
  const total = Math.max(
    ...timing.tracks.map((track) => track.start + track.duration),
  );
  const selectedTiming = {
    ...tracks[selectedRegion?.group || 0],
    ...regions.timings[regions.selected],
  };
  function updateRegionTiming(key, value) {
    changeRegions({
      timings: {
        ...regions.timings,
        [regions.selected]: {
          ...regions.timings[regions.selected],
          [key]: value,
        },
      },
    });
  }
  function resetRegionTiming() {
    const timings = { ...regions.timings };
    delete timings[regions.selected];
    changeRegions({ timings });
  }
  function resetRegionOrigin() {
    const origins = { ...regions.origins };
    delete origins[regions.selected];
    changeRegions({ origins, placing: false });
  }
  function openRegionEditor(selected) {
    targetRef.current?.parentElement?.scrollIntoView({
      block: "nearest",
      behavior: "instant",
    });
    changeRegions({ selected, editing: true, placing: false });
  }
  function closeRegionEditor(restoreFocus = true) {
    changeRegions({ editing: false });
    if (restoreFocus !== false)
      requestAnimationFrame(() =>
        document
          .getElementById("edit-region-settings")
          ?.focus({ preventScroll: true }),
      );
  }
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
    if (!enabled || !svg) return;
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
  }, [enabled, svg, analysisX, analysisY, analysisRatio, regionMode]);
  useEffect(() => {
    if (!active) {
      stop();
      clearMask();
    }
  }, [active]);
  useEffect(() => {
    stop();
  }, [mode, signature, x, y, regionMode]);
  useEffect(() => {
    const target = targetRef.current?.querySelector("svg");
    if (!enabled || !prepared || !target || !active) return;
    const result = drawFillMask(
      playback,
      timing.tracks,
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
  }, [enabled, playback, progress, mode, signature, active, regionMode, total]);
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
  const autoPlayPending = useRef(saved.autoPlay === true);
  useEffect(() => {
    if (
      !autoPlayPending.current ||
      !sourceReady ||
      !prepared ||
      regionConfig.needsGeometryKey ||
      !enabled ||
      !active
    )
      return;
    autoPlayPending.current = false;
    if (reduced) setProgress(100);
    else play();
  }, [
    sourceReady,
    prepared,
    regionConfig.needsGeometryKey,
    enabled,
    active,
    reduced,
  ]);
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
    if (!enabled || !sourceReady || !prepared || exporting) return;
    stop();
    setExporting(true);
    setExportNotice("");
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const data = encodeAnimation({
        svg,
        prepared: playback,
        tracks: timing.tracks,
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
  function closeTour() {
    setTourStep(-1);
    if (regions.placing || regions.editing)
      changeRegions({ placing: false, editing: false });
    if (tourStep < 10)
      requestAnimationFrame(() =>
        tourTrigger.current?.focus({ preventScroll: true }),
      );
  }
  function tourTo(step) {
    if (tourStep === 10 && step !== 10) onConfigure?.();
    if (step === 7 || step === 8) openRegionEditor(regions.selected);
    else if (step === 9) changeRegions({ editing: false, placing: true });
    else if (regions.editing || regions.placing)
      changeRegions({ editing: false, placing: false });
    if (step === 10) onShowDownloads?.();
    setTourStep(step);
  }
  useEffect(() => {
    if (!active && tourStep >= 0) closeTour();
    else if (tourStep > 0 && !enabled) setTourStep(0);
    else if (tourStep > 5 && tourStep < 10 && !regionMode) setTourStep(5);
  }, [active, enabled, regionMode, tourStep]);
  const tourSteps = [
    {
      selector: ".animation-enable",
      title: "Enable fill animation",
      body: "Open Fill animation, then turn on Enable fill animation. Ready-made examples already have it on. Flow inside shape follows the artwork; Radial from point spreads outward.",
      canNext: enabled,
      hint: !enabled ? "Turn on the checkbox to continue." : undefined,
    },
    {
      selector: ".fill-animation > .animation-controls",
      title: "Choose the fill effect",
      body: "Flow inside shape follows the painted artwork. Radial from point spreads outward. Origin X and Y choose the shared starting point; regions with a custom origin keep their own point.",
      canNext: !!prepared,
    },
    {
      selector: ".animation-tracks > fieldset",
      title: "Start with color timing",
      body: "Use Start, Duration and End fill for each color. Start is measured from timeline zero; Duration is the fill time. Both use 0.01-second steps. Regions with custom timing keep their overrides. You do not need to tune every tiny region.",
      canNext: !!prepared,
    },
    {
      selector: ".animation-playback",
      title: "Sequence with the timeline",
      body: "Play or scrub to find where the next color or region should begin. Read the current seconds and use that time as its Start. For the atom, begin the next orbit as the previous one finishes—or earlier for overlap. Start is always measured from timeline zero.",
    },
    {
      selector: ".region-mode-toggle",
      title: "Perfectionism?",
      body: "Regions under 10 analysis samples often make little visible difference. At 1–2 samples there is barely room for a fill to spread. These can be SVG leftovers or rasterization specks. Leave them alone until you see a reason to tune them! Samples are analysis points, not SVG pixels. Next goes to export; the perfectionist detour lets you edit every region.",
      action: {
        label: "Perfectionism mode",
        onClick: () => {
          setTourAdvanced(true);
          tourTo(5);
        },
      },
    },
    {
      selector: ".region-mode-toggle",
      title: "Edit each region separately",
      body: "Turn on Separate region origins. Disconnected areas can have their own starting point and timing, even when they share a color.",
      canNext: regionMode && !!prepared,
      hint: !regionMode
        ? "Turn on Separate region origins to continue."
        : !prepared
          ? "Preparing the regions…"
          : undefined,
    },
    {
      selector: ".region-origin-controls > label",
      title: "Choose a region",
      body: "Click a painted area on the artwork, or choose it in Selected region. The blue highlight identifies it. For thin lines, zoom with + or Ctrl + wheel; turn the paw-shaped Pan tool off before selecting.",
      canNext: !!selectedRegion,
    },
    {
      selector: ".region-editor-coordinates",
      title: "Open the editing popover",
      body: "Edit region settings opens this popover; double-clicking a region or its pin does too. On phones it appears at the bottom. X and Y move this region’s starting point.",
      canNext: regions.editing,
      hint: !regions.editing
        ? "Reopen Edit region settings to continue."
        : undefined,
    },
    {
      selector: ".region-editor-timing",
      title: "Set start, duration and fill",
      body: "Start is the delay from timeline zero. Duration is how long the fill takes; both use 0.01-second steps. End fill sets how much remains painted. A second region can start before the first finishes.",
      canNext: regions.editing,
    },
    {
      selector: ".preview-viewport",
      title: "Place the starting point visually",
      body: "Click anywhere on the artwork to place the selected region’s origin. Normally, use Place origin on artwork first; a regular click only selects a region. The Pan tool must be off.",
      canNext: !regions.placing,
      hint: regions.placing
        ? "Click the artwork to place the point, then continue."
        : "Point placed. You can continue.",
    },
    {
      selector: ".animation-export-action",
      title: "Take the animation with you",
      body: "Downloads brings you here. Export animation ZIP includes the prepared animation, HTML example and React integration. Regular SVG and React downloads are static. Open How to use your animation ZIP for setup help.",
    },
  ];
  const tourRoute = tourAdvanced
    ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    : [0, 1, 2, 3, 4, 10];
  const tourIndex = tourRoute.indexOf(tourStep);
  function navigateTour(index) {
    // Next at the fork always offers the short path, including after Back.
    if (tourStep === 4 && index > tourIndex) {
      setTourAdvanced(false);
      tourTo(10);
    } else tourTo(tourRoute[index]);
  }
  const css = radialCss(x, y, tracks[0].duration);
  return (
    <section className="fill-animation" aria-label="Optional fill animation">
      {timelineHost &&
        enabled &&
        active &&
        createPortal(
          <div className="animation-playback">
            <button
              type="button"
              className="button secondary"
              disabled={!prepared || !!error || !!timing.error}
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
          </div>,
          timelineHost,
        )}
      {exportHost &&
        createPortal(
          <div className="animation-export-tools">
            <button
              type="button"
              className="button primary animation-export-action"
              disabled={
                !enabled ||
                !sourceReady ||
                !prepared ||
                !!error ||
                !!timing.error ||
                exporting
              }
              onClick={exportAnimation}
            >
              {exporting ? "Preparing animation ZIP…" : "Export animation ZIP"}
            </button>
            {!enabled && (
              <p>
                Enable Fill animation to prepare an animated export.{" "}
                <button
                  type="button"
                  className="palette-copy"
                  onClick={onConfigure}
                >
                  Set up animation
                </button>
              </p>
            )}
            <details
              className="animation-integration"
              open={showGuide}
              onToggle={(event) => setShowGuide(event.currentTarget.open)}
            >
              <summary>How to use your animation ZIP</summary>
              <button
                type="button"
                className="button secondary"
                onClick={copyAiPrompt}
              >
                Copy AI prompt
              </button>
              <p>
                Copies text only. Download the animation ZIP and attach it to
                your chat, or give your coding agent the path to the extracted
                folder. Files are not sent automatically.
              </p>
              {copyNotice && <p role="status">{copyNotice}</p>}
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
            {exportNotice && (
              <p role="status" className="animation-export-notice">
                {exportNotice}
              </p>
            )}
          </div>,
          exportHost,
        )}
      <div className="animation-help-entry">
        <span>New to animation?</span>
        <button
          ref={tourTrigger}
          type="button"
          className="palette-copy"
          onClick={() => {
            autoPlayPending.current = false;
            stop();
            setProgress(100);
            document
              .querySelector(
                '.canvas-tools button[aria-label="Pan preview"][aria-pressed="true"]',
              )
              ?.click();
            setTourAdvanced(false);
            setTourStep(0);
          }}
        >
          Show me how
        </button>
      </div>
      <AnimationTour
        index={tourIndex}
        steps={tourRoute.map((step) => tourSteps[step])}
        onStep={navigateTour}
        onClose={closeTour}
      />
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
          <div className="animation-status" role="status">
            {error ||
              timing.error ||
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
                      editing: false,
                    })
                  }
                >
                  {prepared.components.map((region) => (
                    <option key={region.id} value={region.id}>
                      Region {region.id + 1} ·{" "}
                      {groups[region.group]?.property || "Paint"} ·{" "}
                      {region.pixels}{" "}
                      {region.pixels === 1 ? "sample" : "samples"}
                      {region.pixels < 10 ? " · tiny detail" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Click a painted area to select it. The blue overlay highlights
                that region; the pin shows its actual inlet. Small regions are
                selectable from the list.
              </p>
              <p className="region-size-note">
                Perfectionist corner: regions under 10 analysis samples are
                often tiny details. Start with the larger shapes; fine-tune the
                specks only if you can see a difference.
              </p>
              {!!regions.retained?.length && (
                <p role="status">
                  Settings for {regions.retained.length} changed or hidden
                  regions are kept in your draft. They will apply again when
                  those regions can be matched.
                </p>
              )}
              {selectedRegion && (
                <>
                  <div className="region-quick-actions">
                    <button
                      type="button"
                      id="edit-region-settings"
                      className="button secondary"
                      onClick={() => openRegionEditor(regions.selected)}
                    >
                      Edit region settings
                    </button>
                    <button
                      type="button"
                      className="palette-copy"
                      aria-pressed={regions.placing}
                      onClick={() =>
                        changeRegions({
                          placing: !regions.placing,
                          editing: false,
                        })
                      }
                    >
                      {regions.placing
                        ? "Cancel point placement"
                        : "Place origin on artwork"}
                    </button>
                  </div>
                  <p role="status">
                    {regions.placing
                      ? `Click anywhere on the artwork to place Region ${regions.selected + 1}’s origin.`
                      : "Double-click the region or its pin to edit coordinates and timing."}
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
                changeRegions({ selected, placing: false, editing: false })
              }
              onPlace={placeRegion}
              onEdit={openRegionEditor}
              editor={
                regions.editing
                  ? {
                      origin: regionOrigin,
                      timing: selectedTiming,
                      customOrigin: !!regions.origins[regions.selected],
                      customTiming: !!Object.keys(
                        regions.timings[regions.selected] || {},
                      ).length,
                      paint: groups[selectedRegion?.group || 0],
                      onOrigin: placeRegion,
                      onTiming: updateRegionTiming,
                      onResetTiming: resetRegionTiming,
                      onResetOrigin: resetRegionOrigin,
                      onPlace: () =>
                        changeRegions({ editing: false, placing: true }),
                      onClose: closeRegionEditor,
                    }
                  : null
              }
            />
          )}
          <p>
            {regionMode
              ? "Region coordinates are relative to the artwork. Palette and line edits keep your settings; unmatched regions are retained in your local draft."
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
                      step="0.01"
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
                      min="0.01"
                      max="30"
                      step="0.01"
                      value={track.duration}
                      onChange={(event) =>
                        update(
                          track.name,
                          "duration",
                          Math.max(
                            0.01,
                            Math.min(30, Number(event.target.value) || 0.01),
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
