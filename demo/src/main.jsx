import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { Icon } from "tiny-isprite";
import { samples, featuredSamples } from "./samples.js";
import {
  demoAnimationStates,
  demoDarkPalettes,
} from "./lib/demo-animations.js";
import {
  buildProject,
  cleanSvg,
  defaultOptions,
  download,
  exportBundle,
  iconName,
  MAX_FILE_SIZE,
  SINGLE_FILE_SIZE,
  MAX_ICONS,
  reactSnippet,
  validateOptions,
} from "./lib/project.js";
import { buildSingleIcon } from "./lib/single-icon.js";
import { iconVariables, variableCss, colorHex } from "./lib/palette.js";
import { singleUsageSnippet } from "./lib/usage.js";
import { buildThemeExample, darkColor } from "./lib/theme.js";
import {
  PanelSeparator,
  useEditorLayout,
  usePanelWidth,
} from "./EditorLayout.jsx";
import { PreviewCanvas } from "./PreviewCanvas.jsx";
import { FillAnimation } from "./FillAnimation.jsx";
import { loadDraft, saveDraft } from "./lib/local-draft.js";
import "./style.css";

const github = "https://github.com/Dynation/tiny-isprite";
const symbols = {
  upload: "M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5",
  download: "M12 3v13m-5-5 5 5 5-5M4 18v3h16v-3",
  arrow: "M5 19 19 5M5 5h14v14",
  search: "m16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  copy: "M9 9h12v12H9zM15 5V2H2v13h3",
  check: "m5 12 4 4L20 5",
  grid: "M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z",
  close: "m6 6 12 12M6 18 18 6",
  refresh: "M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6",
  file: "M5 3h9l5 5v13H5zM14 3v6h5",
};
function Glyph({ name, size = 18, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={symbols[name] || symbols.file} />
    </svg>
  );
}
function BrandMark({ small = false }) {
  return (
    <svg
      className={`brand-mark${small ? " small" : ""}`}
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <path
        d="M36 10H22C9 10 9 24 22 24h4c13 0 13 14 0 14H12"
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinecap="square"
      />
      <path d="M33 5h9l-5 10h-4z" fill="#bfd1ff" />
      <path d="M7 33h10l-5 10H7z" fill="#426fe6" />
    </svg>
  );
}
function App({ initialDraft, storageError = "" }) {
  const start = initialDraft || {};
  const [layout, updateLayout, resetLayout] = useEditorLayout();
  const [focusMode, setFocusMode] = useState(false),
    [mobilePanel, setMobilePanel] = useState(null);
  const [bodyNode, setBodyNode] = useState(null),
    [inspectorNode, setInspectorNode] = useState(null);
  const bodyWidth = usePanelWidth(bodyNode),
    inspectorWidth = usePanelWidth(inspectorNode);
  const packageMax = Math.min(380, Math.max(180, bodyWidth - 620));
  const controlsMax = Math.min(520, Math.max(260, inspectorWidth - 280));
  const packageWidth = Math.max(180, Math.min(packageMax, layout.packageWidth));
  const controlsWidth = Math.max(
    260,
    Math.min(controlsMax, layout.inspectorWidth),
  );
  useEffect(() => {
    if (!focusMode && !mobilePanel) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [focusMode, mobilePanel]);
  useEffect(() => {
    const escape = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (mobilePanel) setMobilePanel(null);
      else setFocusMode(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [mobilePanel]);
  useEffect(() => {
    const wide = matchMedia("(min-width: 1001px)");
    const close = () => {
      if (wide.matches) setMobilePanel(null);
    };
    wide.addEventListener("change", close);
    return () => wide.removeEventListener("change", close);
  }, []);
  function openMobilePanel(panel, tab) {
    if (tab) selectInspectorTab(tab);
    setMobilePanel(panel);
    requestAnimationFrame(() =>
      document
        .querySelector(".preview-column")
        ?.scrollIntoView({ block: "start", behavior: "instant" }),
    );
  }
  function openDownloads() {
    setFocusMode(false);
    setMobilePanel(null);
    requestAnimationFrame(() =>
      document
        .querySelector(".export-panel")
        ?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
  }
  const [animationStates, setAnimationStates] = useState(
    () => start.animationStates || demoAnimationStates(),
  );
  const [sampleRevision, setSampleRevision] = useState(0);
  const rememberAnimation = useCallback(
    (name, state) =>
      setAnimationStates((previous) => ({ ...previous, [name]: state })),
    [],
  );
  const [draftStatus, setDraftStatus] = useState(
    storageError ? "unavailable" : "saved",
  );
  const [pageTheme, setPageTheme] = useState(() => {
    try {
      return localStorage.getItem("isprite-page-theme") === "light"
        ? "light"
        : "dark";
    } catch {
      return "dark";
    }
  });
  useEffect(() => {
    document.documentElement.dataset.pageTheme = pageTheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", pageTheme === "dark" ? "#11151d" : "#f6f6f3");
    try {
      localStorage.setItem("isprite-page-theme", pageTheme);
    } catch {}
  }, [pageTheme]);
  const [icons, setIcons] = useState(() =>
    (start.icons || samples).map((icon) => ({ ...icon })),
  );
  const [target, setTarget] = useState(start.target || "single");
  const single = target === "single";
  const [options, setOptions] = useState({
    ...defaultOptions,
    mode: "variables",
    allColors: true,
    editablePalette: true,
    palette: {},
    strokeWidths: {},
    ...start.options,
  });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(start.selected || "orbit");
  const [color, setColor] = useState(start.color || "#245cf3");
  const [previewTheme, setPreviewTheme] = useState(
    start.previewTheme || "light",
  );
  const [darkPalettes, setDarkPalettes] = useState(
    () => start.darkPalettes || demoDarkPalettes(),
  );
  const [darkForegrounds, setDarkForegrounds] = useState(
    start.darkForegrounds || {},
  );
  const [size, setSize] = useState(start.size || 256);

  const [tab, setTab] = useState(start.tab || "usage");
  const [inspectorTab, setInspectorTab] = useState(
    start.inspectorTab || "animation",
  );
  const draft = useMemo(
    () => ({
      version: 1,
      icons,
      target,
      options,
      selected,
      color,
      previewTheme,
      darkPalettes,
      darkForegrounds,
      size,
      tab,
      inspectorTab,
      animationStates,
    }),
    [
      icons,
      target,
      options,
      selected,
      color,
      previewTheme,
      darkPalettes,
      darkForegrounds,
      size,
      tab,
      inspectorTab,
      animationStates,
    ],
  );
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  useEffect(() => {
    if (storageError) return;
    let disposed = false;
    setDraftStatus("saving");
    const timer = setTimeout(() => {
      saveDraft(draft).then(
        () => {
          if (!disposed) setDraftStatus("saved");
        },
        () => {
          if (!disposed) setDraftStatus("unavailable");
        },
      );
    }, 250);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [draft]);
  useEffect(() => {
    const flush = () => {
      if (!storageError) saveDraft(latestDraft.current).catch(() => {});
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  const inspectorControls = useRef(null);
  function selectInspectorTab(value) {
    setInspectorTab(value);
    if (inspectorControls.current) inspectorControls.current.scrollTop = 0;
  }
  const [notice, setNotice] = useState("");
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState("");
  const [build, setBuild] = useState({
    busy: true,
    artifact: null,
    url: "",
    error: "",
  });
  const input = useRef(null);
  const artworkRef = useRef(null);
  const copyTimer = useRef(null);
  const current = icons.find((icon) => icon.name === selected) || icons[0];
  const rotation = options.rotations?.[current?.name] || 0;
  const setRotation = (value) =>
    setOptions((previous) => ({
      ...previous,
      rotations: { ...previous.rotations, [current?.name]: value },
    }));
  const signature = useMemo(
    () =>
      JSON.stringify({
        icons,
        options,
        target,
        selected: current?.name,
        color: single ? color : null,
        rotation,
        size,
      }),
    [icons, options, target, selected, size, color, rotation],
  );
  useEffect(() => {
    let disposed = false;
    let url = "";
    const error = single ? "" : validateOptions(options);
    setBuild((previous) => ({ ...previous, busy: true, error }));
    const timer = setTimeout(async () => {
      try {
        if (error) throw new Error(error);
        const artifact = await buildProject(
          icons,
          single ? { ...options, prefix: "icon-", publicPath: "/" } : options,
        );
        if (current) {
          artifact.selected = await buildSingleIcon(
            current,
            { ...options, exportColor: single ? color : undefined, rotation },
            size,
          );
          if (single) artifact.single = artifact.selected;
        }
        if (disposed) return;
        url = URL.createObjectURL(
          new Blob([artifact.sprite], { type: "image/svg+xml" }),
        );
        setBuild({ busy: false, artifact, url, signature, error: "" });
      } catch (error) {
        if (!disposed)
          setBuild({
            busy: false,
            artifact: null,
            url: "",
            error: error.message,
          });
      }
    }, 100);
    return () => {
      disposed = true;
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
    };
  }, [signature]);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const matches = icons.filter((icon) =>
    icon.name.includes(query.toLowerCase()),
  );
  const artifact = build.artifact;
  const ready =
    artifact &&
    !build.busy &&
    !build.error &&
    build.signature === signature &&
    icons.length > 0;
  const snippet =
    artifact && current
      ? single
        ? artifact.single?.component || ""
        : reactSnippet(artifact, current.name, size, { color, rotation })
      : "// Add an SVG to get started.";
  const variables = iconVariables(
    artifact?.css,
    current?.name,
    options.allColors,
  ).map((variable) => ({
    ...variable,
    value: options.palette[current?.name]?.[variable.name] || variable.value,
  }));
  const paletteCode = variableCss(variables);
  const usageCode =
    single && artifact?.single && current
      ? singleUsageSnippet(
          artifact.single,
          current.name,
          variables,
          color,
          size,
        )
      : snippet;
  const themeExample = buildThemeExample({
    name: current?.name || "icon",
    variables: variables.map((v) => ({ ...v, value: colorHex(v.value) })),
    color,
    darkPalette: darkPalettes[current?.name],
    foregroundDark: darkForegrounds[current?.name] || "#e2e8f0",
    single,
    size,
    aspectRatio: artifact?.selected?.aspectRatio || 1,
    rotation,
  });
  const tailwindCode = themeExample.jsx;
  const activePalette = Object.fromEntries(
    themeExample.paints.map((v) => [
      v.name,
      previewTheme === "dark" ? v.dark : v.value,
    ]),
  );
  function setDarkVariable(name, value) {
    if (!/^#[\da-f]{6}$/i.test(value) || !current) return;
    setDarkPalettes((previous) => ({
      ...previous,
      [current.name]: { ...previous[current.name], [name]: value },
    }));
    setPreviewTheme("dark");
  }
  const code =
    tab === "usage"
      ? usageCode
      : tab === "theme"
        ? themeExample.css
        : tab === "css"
          ? paletteCode
          : tab === "tailwind"
            ? tailwindCode
            : tab === "react"
              ? snippet
              : tab === "sprite"
                ? (single ? artifact?.single?.svg : artifact?.sprite) || ""
                : artifact?.module || "";
  const tabs = single
    ? [
        ["usage", "React usage"],
        ["react", "React component"],
        ["tailwind", "Tailwind"],
        ["theme", "globals.css / @theme"],
        ["css", "CSS variables"],
        ["sprite", "Inline SVG"],
      ]
    : [
        ["react", "React usage"],
        ["tailwind", "Tailwind"],
        ["theme", "globals.css / @theme"],
        ["css", "CSS variables"],
        ["sprite", "SVG sprite"],
        ["manifest", "Manifest"],
      ];
  const update = (key, value) =>
    setOptions((previous) => ({ ...previous, [key]: value }));
  function setVariable(name, value) {
    if (!current || !/^#[\da-f]{6}$/i.test(value)) return;
    setPreviewTheme("light");
    setOptions((previous) => ({
      ...previous,
      palette: {
        ...previous.palette,
        [current.name]: { ...previous.palette[current.name], [name]: value },
      },
    }));
  }
  function resetPalette() {
    setOptions((previous) => {
      const palette = { ...previous.palette };
      const strokeWidths = { ...previous.strokeWidths };
      delete palette[current.name];
      delete strokeWidths[current.name];
      return { ...previous, palette, strokeWidths };
    });
    setRotation(0);
    setDarkPalettes((previous) => {
      const next = { ...previous };
      delete next[current.name];
      return next;
    });
    setDarkForegrounds((previous) => {
      const next = { ...previous };
      delete next[current.name];
      return next;
    });
    setPreviewTheme("light");
  }
  const fileLimit = single ? SINGLE_FILE_SIZE : MAX_FILE_SIZE;
  async function addFiles(files) {
    if (reading) return;
    setReading(true);
    const additions = [];
    const failures = [];
    const names = new Set(icons.map((icon) => icon.name));
    for (const file of [...files]) {
      if (icons.length + additions.length >= MAX_ICONS) {
        failures.push(`Limit: ${MAX_ICONS} icons.`);
        break;
      }
      try {
        if (!/\.svg$/i.test(file.name))
          throw new Error("Only .svg files are supported.");
        if (file.size > fileLimit)
          throw new Error(`SVG exceeds ${single ? "2 MB" : "128 KB"}.`);
        const base = iconName(file.name);
        let name = base;
        let count = 2;
        while (names.has(name)) name = `${base}-${count++}`;
        const content = cleanSvg(await file.text(), name, fileLimit);
        additions.push({ name, content, original: file.name });
        names.add(name);
      } catch (error) {
        failures.push(`${file.name}: ${error.message}`);
      }
    }
    if (additions.length) {
      setIcons((previous) => [...previous, ...additions]);
      setSelected(additions[0].name);
      setQuery("");
    }
    setNotice(
      [
        additions.length
          ? `Added ${additions.length} ${additions.length === 1 ? "icon" : "icons"}. SVGs cleaned for preview and export.`
          : "",
        ...failures,
      ]
        .filter(Boolean)
        .join(" "),
    );
    setReading(false);
    if (input.current) input.current.value = "";
  }
  async function copy(value, key) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(""), 1800);
    } catch {
      setNotice(
        "Clipboard is unavailable. Select and copy the code from the panel instead.",
      );
    }
  }
  function remove(name) {
    setIcons((previous) => previous.filter((icon) => icon.name !== name));
    setAnimationStates((previous) => {
      const next = { ...previous };
      delete next[name];
      return next;
    });
  }
  function saveBundle() {
    if (ready)
      download(
        exportBundle(artifact, icons, options, {
          name: current.name,
          size,
          color,
          rotation,
          theme: themeExample,
        }),
        "tiny-isprite-bundle.zip",
        "application/zip",
      );
  }
  function openAnimationExport() {
    selectInspectorTab("animation");
    updateLayout({ inspectorCollapsed: false });
    if (matchMedia("(max-width: 1000px)").matches) setMobilePanel("controls");
    requestAnimationFrame(() => {
      document
        .querySelector(".icon-inspector")
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
      document
        .getElementById("enable-fill-animation")
        ?.focus({ preventScroll: true });
    });
  }
  const inspector = current && (
    <section
      className={`icon-inspector ${single ? "single-inspector" : ""}`}
      aria-label="Selected icon editor"
    >
      <div className="inspector-heading">
        <div>
          <span className="section-label">SELECTED ICON</span>
          <h3>{current.name}</h3>
        </div>
        <button className="inspector-reset" onClick={resetPalette}>
          Reset icon
        </button>
      </div>
      <div className="inspector-body" ref={setInspectorNode}>
        <div className="preview-column">
          <div
            className={`selected-preview theme-preview ${previewTheme === "dark" ? "dark" : ""}`}
            data-preview-theme={previewTheme}
            style={{
              ...activePalette,
              color:
                previewTheme === "dark" ? themeExample.foregroundDark : color,
            }}
            aria-label={`Live preview of ${current.name}`}
          >
            <PreviewCanvas key={current.name}>
              {artifact?.selected && (
                <div
                  ref={artworkRef}
                  className="selected-artwork"
                  dangerouslySetInnerHTML={{ __html: artifact.selected.svg }}
                />
              )}
            </PreviewCanvas>
            <small>
              {size} × {artifact?.selected?.height || size} px export · zoom
              affects preview only
            </small>
          </div>
          <div id="animation-timeline-slot" />
        </div>
        <PanelSeparator
          label="Resize color and animation panel"
          value={controlsWidth}
          min={260}
          max={controlsMax}
          direction={-1}
          onChange={(inspectorWidth) => updateLayout({ inspectorWidth })}
          reset={() => updateLayout({ inspectorWidth: 340 })}
        />
        <div className="inspector-controls" ref={inspectorControls}>
          <div className="mobile-sheet-heading">
            <strong>Icon controls</strong>
            <button
              type="button"
              aria-label="Close icon controls"
              onClick={() => setMobilePanel(null)}
            >
              ×
            </button>
          </div>
          <div
            className="inspector-tabs"
            role="tablist"
            aria-label="Icon controls"
          >
            {[
              ["colors", "Colors"],
              ["animation", "Fill animation"],
            ].map(([value, label], index) => (
              <button
                type="button"
                key={value}
                role="tab"
                id={`inspector-tab-${value}`}
                aria-controls={`inspector-${value}`}
                aria-selected={inspectorTab === value}
                tabIndex={inspectorTab === value ? 0 : -1}
                onClick={() => selectInspectorTab(value)}
                onKeyDown={(event) => {
                  const keys = ["colors", "animation"];
                  const next =
                    event.key === "ArrowRight" || event.key === "ArrowLeft"
                      ? 1 - index
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? 1
                          : null;
                  if (next !== null) {
                    event.preventDefault();
                    selectInspectorTab(keys[next]);
                    event.currentTarget.parentElement.children[next].focus();
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            className="palette-editor inspector-panel"
            id="inspector-colors"
            role="tabpanel"
            aria-labelledby="inspector-tab-colors"
            hidden={inspectorTab !== "colors"}
          >
            <h4>Colors you can change</h4>
            <div
              className="theme-toggle"
              role="group"
              aria-label="Preview theme"
            >
              {["light", "dark"].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={previewTheme === value}
                  onClick={() => setPreviewTheme(value)}
                >
                  {value === "light" ? "Light preview" : "Dark preview"}
                </button>
              ))}
            </div>
            <p>
              Light and dark palettes belong to this icon. Switching themes
              keeps the same SVG.
            </p>
            {options.mode !== "variables" ? (
              <>
                <p>
                  Create named CSS variables for this icon, then try each color.
                </p>
                <button
                  className="button secondary"
                  onClick={() =>
                    setOptions((previous) => ({
                      ...previous,
                      mode: "variables",
                      allColors: true,
                    }))
                  }
                >
                  Generate editable variables
                </button>
              </>
            ) : variables.length ? (
              <>
                <p>Pick a color. Preview and downloads update together.</p>
                {variables.map((variable) => (
                  <div className="variable-row" key={variable.name}>
                    <label className="variable-picker">
                      <input
                        type="color"
                        aria-label={`Color ${variable.name}`}
                        value={colorHex(variable.value)}
                        onChange={(event) =>
                          setVariable(variable.name, event.target.value)
                        }
                      />
                      <span>
                        <b>{variable.property} · Light</b>
                        <code>{variable.name}</code>
                      </span>
                    </label>
                    <input
                      className="variable-value"
                      aria-label={`Value ${variable.name}`}
                      key={`${variable.name}-${variable.value}`}
                      defaultValue={colorHex(variable.value)}
                      maxLength={7}
                      pattern="#[0-9a-fA-F]{6}"
                      onBlur={(event) => {
                        const value = event.target.value;
                        if (/^#[\da-f]{6}$/i.test(value))
                          setVariable(variable.name, value);
                        else event.target.value = colorHex(variable.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                      }}
                      onFocus={(event) => event.target.select()}
                    />
                    <div className="dark-variable-row">
                      <label className="variable-picker">
                        <input
                          type="color"
                          aria-label={`Dark color ${variable.name}`}
                          value={
                            darkPalettes[current.name]?.[variable.name] ||
                            darkColor(colorHex(variable.value))
                          }
                          onChange={(event) =>
                            setDarkVariable(variable.name, event.target.value)
                          }
                        />
                        <span>
                          <b>{variable.property} · Dark</b>
                          <code>{variable.name}</code>
                        </span>
                      </label>
                      <input
                        className="variable-value"
                        aria-label={`Dark value ${variable.name}`}
                        key={`dark-${variable.name}-${darkPalettes[current.name]?.[variable.name] || variable.value}`}
                        defaultValue={
                          darkPalettes[current.name]?.[variable.name] ||
                          darkColor(colorHex(variable.value))
                        }
                        maxLength={7}
                        onBlur={(event) => {
                          if (/^#[\da-f]{6}$/i.test(event.target.value))
                            setDarkVariable(variable.name, event.target.value);
                          else
                            event.target.value =
                              darkPalettes[current.name]?.[variable.name] ||
                              darkColor(colorHex(variable.value));
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        }}
                        onFocus={(event) => event.currentTarget.select()}
                      />
                    </div>
                  </div>
                ))}
                <button
                  className="palette-copy"
                  disabled={!ready}
                  onClick={() => copy(paletteCode, "palette")}
                >
                  {copied === "palette"
                    ? "Copied CSS"
                    : "Copy this icon’s CSS variables"}
                </button>
              </>
            ) : (
              <>
                <p>
                  No fill/stroke variables were generated. Gradient stops and
                  embedded paint servers keep their source colors.
                </p>
                {!options.allColors && (
                  <button
                    className="button secondary"
                    onClick={() => update("allColors", true)}
                  >
                    Generate multicolor palette
                  </button>
                )}
              </>
            )}
            <label className="theme-foreground">
              Dark currentColor{" "}
              <input
                type="color"
                aria-label="Dark currentColor"
                value={themeExample.foregroundDark}
                onChange={(event) => {
                  setDarkForegrounds((previous) => ({
                    ...previous,
                    [current.name]: event.target.value,
                  }));
                  setPreviewTheme("dark");
                }}
              />
            </label>
            <p className="theme-help">
              Use <b>globals.css / @theme</b> for light/dark design tokens, then{" "}
              <b>Tailwind</b> for the component and toggle. SVG/React downloads
              keep light defaults; theme examples contain both palettes.
            </p>
            <label className="inspector-control">
              Line thickness{" "}
              <input
                aria-label="Line thickness"
                type="range"
                min="0"
                max="8"
                step="0.1"
                value={options.strokeWidths[current.name] ?? 1.7}
                onChange={(event) =>
                  setOptions((previous) => ({
                    ...previous,
                    strokeWidths: {
                      ...previous.strokeWidths,
                      [current.name]: Number(event.target.value),
                    },
                  }))
                }
              />
              <output>
                {options.strokeWidths[current.name] ?? "Original"}
              </output>
            </label>
            <label className="inspector-control">
              Rotation{" "}
              <input
                aria-label="Rotation"
                type="range"
                min="-180"
                max="180"
                step="15"
                value={rotation}
                onChange={(event) => setRotation(Number(event.target.value))}
              />
              <output>{rotation}°</output>
            </label>
            <p className="field-note">
              Line thickness affects SVG strokes. Filled silhouettes do not have
              an outline to thicken. Copy ready-to-use React, CSS or Tailwind
              examples below.
            </p>
          </div>
          <div
            className="inspector-panel"
            id="inspector-animation"
            role="tabpanel"
            aria-labelledby="inspector-tab-animation"
            hidden={inspectorTab !== "animation"}
          >
            <FillAnimation
              key={`${current.name}:${sampleRevision}`}
              initialState={animationStates[current.name]}
              onStateChange={rememberAnimation}
              sourceReady={!!ready}
              onConfigure={openAnimationExport}
              onShowDownloads={openDownloads}
              active={inspectorTab === "animation"}
              initiallyEnabled={!!current.featured}
              name={current.name}
              defaultTheme={previewTheme}
              palettes={{
                light: {
                  color,
                  ...Object.fromEntries(
                    variables.map((v) => [v.name, v.value]),
                  ),
                },
                dark: {
                  color: themeExample.foregroundDark,
                  ...Object.fromEntries(
                    themeExample.paints.map((v) => [v.name, v.dark]),
                  ),
                },
              }}
              svg={artifact?.selected?.svg || ""}
              variables={variables}
              targetRef={artworkRef}
              aspectRatio={artifact?.selected?.aspectRatio || 1}
            />
          </div>
        </div>
      </div>
    </section>
  );
  return (
    <div
      className={`app-shell ${focusMode ? "editor-focus" : ""}`}
      style={{
        "--package-width": `${packageWidth}px`,
        "--inspector-width": `${controlsWidth}px`,
      }}
      data-package-collapsed={layout.packageCollapsed}
      data-inspector-collapsed={layout.inspectorCollapsed}
      data-mobile-panel={mobilePanel || "none"}
    >
      <header className="header">
        <a
          className="brand"
          href={import.meta.env.BASE_URL}
          aria-label="tiny-isprite home"
        >
          <BrandMark />
          <strong>
            tiny-isprite<span className="brand-dot">.</span>
          </strong>
        </a>
        <span className="header-label">SVG COLOR & MOTION LAB</span>
        <nav aria-label="Main">
          <button
            className="page-theme-toggle"
            type="button"
            aria-label="Dark page theme"
            aria-pressed={pageTheme === "dark"}
            onClick={() =>
              setPageTheme(pageTheme === "dark" ? "light" : "dark")
            }
          >
            {pageTheme === "dark" ? "☾ Dark" : "☀ Light"}
          </button>
          <a href={`${github}#quick-start`} target="_blank" rel="noreferrer">
            Documentation <Glyph name="arrow" size={14} />
          </a>
          <a href={github} target="_blank" rel="noreferrer">
            GitHub <Glyph name="arrow" size={14} />
          </a>
          <span className="version">v2.1.0</span>
        </nav>
      </header>
      <main>
        <section className="intro">
          <div>
            <p className="eyebrow">
              <span className="live-dot" /> SMALL PACKAGE. BIG ICON ENERGY.
            </p>
            <h1>
              Give your SVG
              <br />a little life<span>.</span>
            </h1>
            <p className="intro-copy">
              Recolor it. Make it flow. Take it with you.
              <br />
              Try the artwork below or bring your own SVG.
            </p>
          </div>
          <div className="intro-aside intro-promise">
            <span className="mini-label">
              OPEN THE PLAYGROUND. START PLAYING.
            </span>
            <p>
              Free to try. No account.
              <br />
              Your SVGs stay in your browser.
            </p>
            <a className="button secondary" href="#playground">
              Try colors & motion ↓
            </a>
          </div>
        </section>
        <p
          className="draft-status"
          role="status"
          data-draft-status={draftStatus}
        >
          {draftStatus === "saved"
            ? "Draft saved in this browser. Your files are not uploaded."
            : draftStatus === "saving"
              ? "Saving local draft…"
              : "Local draft storage is unavailable. Your edits still work in this tab; export a ZIP to keep them."}
        </p>
        <section
          id="playground"
          className="workspace"
          aria-label="SVG sprite builder"
        >
          <div className="workspace-top">
            <div className="workspace-title">
              <Glyph name="grid" />
              <h2>Icon builder</h2>
              <span className="small-badge">LIVE PLAYGROUND</span>
            </div>
            <div className="workspace-actions">
              <button
                className="text-button"
                disabled={reading}
                onClick={() => {
                  setIcons(samples.map((icon) => ({ ...icon })));
                  setSelected("orbit");
                  setAnimationStates((previous) => ({
                    ...previous,
                    ...demoAnimationStates(),
                  }));
                  setSampleRevision((value) => value + 1);
                  setDarkPalettes(demoDarkPalettes());
                  setTarget("single");
                  setOptions({
                    ...defaultOptions,
                    mode: "variables",
                    allColors: true,
                    editablePalette: true,
                    palette: {},
                    strokeWidths: {},
                  });
                  setColor("#245cf3");
                  setPreviewTheme("light");
                  setQuery("");
                  setNotice("Sample set loaded.");
                }}
              >
                <Glyph name="refresh" size={15} />
                Load samples
              </button>
              <button
                className="button primary compact"
                onClick={() => input.current.click()}
                disabled={reading}
              >
                <Glyph name="upload" size={16} />
                {reading ? "Reading…" : "Add SVGs"}
              </button>
            </div>
          </div>
          <div className="editor-viewbar" aria-label="Editor view">
            <div className="desktop-panel-buttons">
              <button
                type="button"
                aria-expanded={!layout.packageCollapsed}
                onClick={() =>
                  updateLayout({ packageCollapsed: !layout.packageCollapsed })
                }
              >
                Package settings
              </button>
              <button
                type="button"
                aria-expanded={!layout.inspectorCollapsed}
                onClick={() =>
                  updateLayout({
                    inspectorCollapsed: !layout.inspectorCollapsed,
                  })
                }
              >
                Icon controls
              </button>
            </div>
            <div className="mobile-panel-buttons">
              <button
                type="button"
                aria-label="Package controls"
                aria-expanded={mobilePanel === "package"}
                onClick={() => openMobilePanel("package")}
              >
                Package
              </button>
              <button
                type="button"
                aria-label="Color controls"
                aria-expanded={
                  mobilePanel === "controls" && inspectorTab === "colors"
                }
                onClick={() => openMobilePanel("controls", "colors")}
              >
                Colors
              </button>
              <button
                type="button"
                aria-label="Animation controls"
                aria-expanded={
                  mobilePanel === "controls" && inspectorTab === "animation"
                }
                onClick={() => openMobilePanel("controls", "animation")}
              >
                Animation
              </button>
            </div>
            <button type="button" onClick={openDownloads}>
              Downloads
            </button>
            <button
              type="button"
              className="editor-focus-toggle"
              aria-pressed={focusMode}
              onClick={() => setFocusMode(!focusMode)}
            >
              {focusMode ? "Exit editor view" : "Expand editor"}
            </button>
            <button
              type="button"
              className="reset-editor-layout"
              onClick={() => {
                resetLayout();
                setMobilePanel(null);
              }}
            >
              Reset layout
            </button>
          </div>
          <input
            ref={input}
            id="svg-input"
            className="visually-hidden"
            type="file"
            accept=".svg,image/svg+xml"
            multiple
            tabIndex={-1}
            aria-label="Upload SVG files"
            disabled={reading}
            onChange={(event) => addFiles(event.target.files)}
          />
          <div className="workspace-body" ref={setBodyNode}>
            <aside className="settings">
              <div className="settings-heading">
                <h3>Make it yours</h3>
                <span>01 — CONFIGURE</span>
                <button
                  type="button"
                  className="mobile-sheet-close"
                  aria-label="Close package settings"
                  onClick={() => setMobilePanel(null)}
                >
                  ×
                </button>
              </div>
              <fieldset className="color-mode output-mode">
                <legend className="field-label">Output</legend>
                {[
                  ["sprite", "Sprite"],
                  ["single", "Single icon"],
                ].map(([value, label]) => (
                  <label
                    className={`mode-option ${target === value ? "chosen" : ""}`}
                    key={value}
                  >
                    <input
                      type="radio"
                      name="target"
                      checked={target === value}
                      onChange={() => {
                        setTarget(value);
                        if (value === "sprite")
                          setSize((previous) => Math.min(previous, 64));
                        setTab(value === "single" ? "usage" : "react");
                      }}
                    />
                    <b>{label}</b>
                  </label>
                ))}
              </fieldset>
              {single && (
                <p className="field-note">
                  Choose artwork or upload your own SVG. Export a standalone SVG
                  or React component. No package installation needed.
                </p>
              )}
              <div hidden={single}>
                <label className="field-label" htmlFor="prefix">
                  Symbol prefix
                </label>
                <div className="input-wrapper">
                  <span>#</span>
                  <input
                    id="prefix"
                    value={options.prefix}
                    onChange={(event) => update("prefix", event.target.value)}
                    maxLength={32}
                    spellCheck="false"
                  />
                </div>
                <p className="field-note">
                  Names become {options.prefix || ""}sparkle
                </p>
                <label className="field-label" htmlFor="asset-path">
                  Asset path
                </label>
                <input
                  id="asset-path"
                  value={options.publicPath}
                  onChange={(event) => update("publicPath", event.target.value)}
                  maxLength={120}
                  spellCheck="false"
                />
                <p className="field-note">
                  Your public URL folder, e.g. /assets/
                </p>
              </div>
              <fieldset className="color-mode">
                <legend className="field-label">Color handling</legend>
                {[
                  [
                    "currentColor",
                    "Use currentColor",
                    "Convert monochrome fills.",
                  ],
                  [
                    "original",
                    "Keep original colors",
                    "Keep the colors in your SVGs.",
                  ],
                  [
                    "variables",
                    "Generate CSS variables",
                    "Export an editable color palette.",
                  ],
                ].map(([mode, label, hint]) => (
                  <label
                    className={`mode-option ${options.mode === mode ? "chosen" : ""}`}
                    key={mode}
                  >
                    <input
                      type="radio"
                      name="mode"
                      value={mode}
                      checked={options.mode === mode}
                      onChange={() => update("mode", mode)}
                    />
                    <span>
                      <b>{label}</b>
                      <small>{hint}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              {options.mode === "variables" && (
                <label className="palette-all">
                  <input
                    type="checkbox"
                    checked={!!options.allColors}
                    onChange={(event) =>
                      update("allColors", event.target.checked)
                    }
                  />
                  Include multicolor fills and strokes
                </label>
              )}
              <label className="toggle-row">
                <span>
                  <b>Minify output</b>
                  <small>A little less whitespace.</small>
                </span>
                <input
                  type="checkbox"
                  checked={options.minify}
                  onChange={(event) => update("minify", event.target.checked)}
                />
                <span className="toggle-track" />
              </label>
              <div className="safe-note">
                <span>↗</span>
                <p>
                  {single
                    ? "Standalone. Ready to paste."
                    : "Content-hashed filenames."}
                  <br />
                  {single
                    ? "React 18+ for icons with local IDs."
                    : "Fresh icons after every rebuild."}
                </p>
              </div>
            </aside>
            <PanelSeparator
              label="Resize package settings panel"
              value={packageWidth}
              min={180}
              max={packageMax}
              onChange={(packageWidth) => updateLayout({ packageWidth })}
              reset={() => updateLayout({ packageWidth: 220 })}
            />
            <div className="stage">
              <div
                className="featured-samples"
                aria-label="Featured demo artwork"
              >
                <span className="section-label">TRY AN EXAMPLE</span>
                {featuredSamples.map((sample) => (
                  <button
                    key={sample.name}
                    className="sample-choice"
                    aria-pressed={current?.name === sample.name}
                    disabled={!icons.some((icon) => icon.name === sample.name)}
                    onClick={() => setSelected(sample.name)}
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
              {inspector}
              <details className="icon-library">
                <summary>
                  More icons & sprite collection · {icons.length}
                </summary>
                <div className="stage-toolbar">
                  <div className="section-label">
                    YOUR ICONS{" "}
                    <span>{icons.length.toString().padStart(2, "0")}</span>
                  </div>
                  <label className="search">
                    <Glyph name="search" size={15} />
                    <input
                      aria-label="Search icons"
                      placeholder="Find an icon…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                </div>
                <div
                  className={`icon-canvas ${single ? "single-gallery" : ""} ${dragging ? "dragging" : ""}`}
                  style={{ "--preview-color": color }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget))
                      setDragging(false);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    addFiles(event.dataTransfer.files);
                  }}
                >
                  {dragging && (
                    <div className="drop-overlay">
                      <Glyph name="upload" size={30} />
                      Drop your SVGs here
                    </div>
                  )}
                  <div className="icon-grid">
                    {matches.map((icon) => (
                      <div
                        className={`icon-card ${current?.name === icon.name ? "selected" : ""}`}
                        key={icon.name}
                      >
                        <button
                          className="icon-select"
                          aria-pressed={current?.name === icon.name}
                          onClick={() => setSelected(icon.name)}
                          title={icon.original}
                        >
                          {artifact && (
                            <Icon
                              name={icon.name}
                              spriteUrl={build.url}
                              prefix={artifact.manifest.prefix}
                              size={single ? Math.min(size, 48) : size}
                            />
                          )}
                          <span>{icon.name}</span>
                        </button>
                        <button
                          className="remove-icon"
                          aria-label={`Remove ${icon.name}`}
                          onClick={() => remove(icon.name)}
                          disabled={reading}
                        >
                          <Glyph name="close" size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {!matches.length && (
                    <div className="empty-state">
                      <Glyph name="grid" size={30} />
                      <h3>
                        {icons.length
                          ? "Nothing by that name."
                          : "A blank canvas. A fresh start."}
                      </h3>
                      <p>
                        {icons.length
                          ? "Try another search."
                          : "Drop SVG files here or load the sample set."}
                      </p>
                    </div>
                  )}
                  <button
                    className="drop-hint"
                    onClick={() => input.current.click()}
                    disabled={reading}
                  >
                    <Glyph name="upload" size={15} />
                    Drop SVGs here, or <b>browse files</b>
                    <span>
                      Up to {MAX_ICONS} SVGs · {single ? "2 MB" : "128 KB"} each
                    </span>
                  </button>
                </div>
              </details>
              <div className="preview-controls">
                <label className="color-control">
                  Preview color{" "}
                  <span className="color-swatch" style={{ background: color }}>
                    <input
                      aria-label="Preview color"
                      type="color"
                      value={color}
                      onChange={(event) => {
                        setColor(event.target.value);
                        setPreviewTheme("light");
                      }}
                    />
                  </span>
                  <code>{color.toUpperCase()}</code>
                </label>
                <label className="size-control" htmlFor="preview-size">
                  Size
                  <input
                    id="preview-size"
                    type="range"
                    min="20"
                    max={single ? "2048" : "64"}
                    value={size}
                    onChange={(event) => setSize(Number(event.target.value))}
                  />
                  {single ? (
                    <input
                      className="size-number"
                      type="number"
                      aria-label="Export size in pixels"
                      min="1"
                      max="2048"
                      value={size}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (
                          Number.isInteger(value) &&
                          value >= 1 &&
                          value <= 2048
                        )
                          setSize(value);
                      }}
                    />
                  ) : (
                    <code>{size}px</code>
                  )}
                </label>
              </div>
              <div className="preview-footnote">
                Preview color changes <code>currentColor</code>; palette pickers
                change named variables. Single SVG downloads include your chosen
                currentColor. Fixed fills and gradient stops retain their source
                colors.
              </div>
            </div>
          </div>
          <div className="workspace-status" aria-live="polite">
            <div className={build.error ? "error-status" : ""}>
              <span className={`status-dot ${build.error ? "error" : ""}`} />
              {build.error ||
                (build.busy
                  ? "Building your sprite…"
                  : icons.length
                    ? single
                      ? `Selected: ${current?.name}. Standalone output ready.`
                      : `${icons.length} icons, one sprite. Looking good.`
                    : "Ready for your first SVG.")}
            </div>
            <span>
              {artifact
                ? `${((single && artifact.single ? new TextEncoder().encode(artifact.single.svg).length : artifact.bytes) / 1024).toFixed(2)} KB`
                : "—"}
              <span className="status-divider">/</span>No uploads. No account.
            </span>
          </div>
        </section>
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button aria-label="Dismiss message" onClick={() => setNotice("")}>
              <Glyph name="close" size={16} />
            </button>
          </div>
        )}
        {artifact?.css && <style>{artifact.css}</style>}
        <section className="output-section">
          <div className="code-panel">
            <div className="code-toolbar">
              <div className="tabs" role="tablist" aria-label="Export code">
                {tabs.map(([value, label]) => (
                  <button
                    key={value}
                    role="tab"
                    id={`tab-${value}`}
                    aria-selected={tab === value}
                    tabIndex={tab === value ? 0 : -1}
                    onKeyDown={(event) => {
                      const all = tabs.map(([key]) => key);
                      const index = all.indexOf(value);
                      const next =
                        event.key === "ArrowRight"
                          ? (index + 1) % all.length
                          : event.key === "ArrowLeft"
                            ? (index + all.length - 1) % all.length
                            : event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? all.length - 1
                                : null;
                      if (next !== null) {
                        event.preventDefault();
                        setTab(all[next]);
                        event.currentTarget.parentElement.children[
                          next
                        ].focus();
                      }
                    }}
                    aria-controls="code-output"
                    onClick={() => setTab(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                className="copy-code"
                aria-label="Copy code"
                onClick={() => copy(code, "code")}
                disabled={!ready}
              >
                <Glyph name={copied === "code" ? "check" : "copy"} size={16} />
                {copied === "code" ? "Copied" : "Copy"}
              </button>
            </div>
            <pre
              id="code-output"
              role="tabpanel"
              aria-labelledby={`tab-${tab}`}
              tabIndex="0"
            >
              <code>{code}</code>
            </pre>
            <div className="code-caption">
              <span className="code-dot" />
              {single
                ? "Self-contained SVG and React. Color inherits from your page; CSS variables include fallback colors."
                : "The actual tiny-isprite React component. The same generation engine as the CLI."}
            </div>
          </div>
          <aside className="export-panel">
            <span className="mini-label">02 — TAKE IT WITH YOU</span>
            <h2>
              Ready to leave
              <br />
              the playground?
            </h2>
            <p>
              {single
                ? `Export ${current?.name || "your icon"} directly. The React component scopes local IDs to each instance.`
                : "Your sprite, hashed assets, source icons, manifest, and React snippet. All packed up."}
            </p>
            <div
              id="animation-export-slot"
              className="animation-export-entry"
            />
            <button
              className="button primary export-button"
              onClick={() =>
                single
                  ? download(
                      artifact.single.component,
                      artifact.single.componentFilename,
                      "text/javascript",
                    )
                  : saveBundle()
              }
              disabled={!ready}
            >
              <Glyph name="download" size={18} />
              {single ? "Download React component" : "Download bundle"}
              <Glyph name="arrow" size={16} />
            </button>
            <button
              className="download-single"
              disabled={!ready}
              onClick={() =>
                download(
                  single ? artifact.single.svg : artifact.sprite,
                  single ? artifact.single.filename : artifact.filename,
                  "image/svg+xml",
                )
              }
            >
              {single ? "Download standalone SVG" : "Just the SVG sprite"}{" "}
              <span>↓</span>
            </button>
            {single && (
              <button
                className="download-single"
                disabled={!ready}
                onClick={() =>
                  download(
                    usageCode,
                    `${current.name}-example.jsx`,
                    "text/javascript",
                  )
                }
              >
                Download React usage <span aria-hidden="true">↓</span>
              </button>
            )}
            {options.mode === "variables" && (
              <button
                className="download-single"
                disabled={!ready || !variables.length}
                onClick={() =>
                  download(
                    single ? paletteCode : artifact.css,
                    single
                      ? `${current.name}-variables.css`
                      : artifact.cssFilename,
                    "text/css",
                  )
                }
              >
                Download CSS variables <span aria-hidden="true">↓</span>
              </button>
            )}
            <button
              className="download-single"
              disabled={!ready}
              onClick={() =>
                download(themeExample.css, "globals.css", "text/css")
              }
            >
              Download globals.css / @theme <span aria-hidden="true">↓</span>
            </button>
            <button
              className="download-single"
              disabled={!ready}
              onClick={() =>
                download(
                  themeExample.jsx,
                  "Theme-example.jsx",
                  "text/javascript",
                )
              }
            >
              Download Tailwind theme example <span aria-hidden="true">↓</span>
            </button>
            <div className="export-file">
              <Glyph name="file" size={15} />
              <span>
                {single
                  ? artifact?.single?.filename || "icon.svg"
                  : artifact?.filename || "sprite.<hash>.svg"}
              </span>
            </div>
          </aside>
        </section>
        <section className="support-note" aria-label="Support the project">
          <div>
            <h3>Enjoying the playground?</h3>
            <p>Your support helps me build more little tools like this.</p>
          </div>
          <a
            className="button secondary"
            href="https://ko-fi.com/dynation"
            target="_blank"
            rel="noreferrer"
          >
            Buy me a coffee ↗
          </a>
        </section>
        <section className="usage-guide" aria-label="How to apply your changes">
          <h3>Use your changes in React</h3>
          {single ? (
            <ol>
              <li>
                <b>Save the component.</b> Download React component as{" "}
                <code>{current?.name || "icon"}.jsx</code>.
              </li>
              <li>
                <b>Open React usage.</b> Copy the example into another file
                beside it, then render <code>&lt;IconExample /&gt;</code>.
              </li>
              {variables.length ? (
                <li>
                  <b>Replace color values.</b> In <code>iconColors</code>, keep
                  each <code>--variable-name</code> and change its HEX value.
                  Pass that object as <code>style</code> to{" "}
                  <code>&lt;ExampleIcon&gt;</code>. No extra CSS import is
                  required.
                </li>
              ) : (
                <li>
                  <b>Change the color prop.</b> It changes paints that use{" "}
                  <code>currentColor</code>. For individually editable colors,
                  choose <b>Generate CSS variables</b> first; original fixed
                  fills keep their colors.
                </li>
              )}
            </ol>
          ) : (
            <ol>
              <li>
                <b>Download the bundle.</b> Install <code>tiny-isprite</code>;
                copy <code>public/</code> and <code>src/generated/</code> into
                your app.
              </li>
              <li>
                <b>Copy React usage.</b> Render{" "}
                <code>&lt;ExampleIcon /&gt;</code>. It loads the generated
                stylesheet and manifest.
              </li>
              <li>
                <b>Replace color values.</b>{" "}
                {variables.length ? (
                  <>
                    Keep variable names in <code>iconStyle</code> and edit the
                    values.
                  </>
                ) : (
                  <>
                    Change <code>color</code> in <code>iconStyle</code> for{" "}
                    <code>currentColor</code> paints; generate CSS variables for
                    individual colors.
                  </>
                )}{" "}
                Style goes on the <code>&lt;span&gt;</code> wrapper because the
                published <code>Icon</code> has no <code>style</code> prop.
              </li>
            </ol>
          )}
          <p>
            <code>color</code> only affects <code>currentColor</code> paints.
            CSS-variable colors are overridden through <code>style</code> or a
            CSS class.{" "}
            {single ? (
              <>
                Change <code>width</code> in the usage example; the calculated
                height keeps your image’s proportions. <code>className</code>{" "}
                accepts your own CSS or Tailwind classes.
              </>
            ) : (
              <>
                Use <code>size</code> for dimensions and <code>className</code>{" "}
                for CSS or Tailwind classes.
              </>
            )}
          </p>
          {variables.length > 0 && (
            <p>
              Prefer a CSS file? Import the downloaded CSS, use{" "}
              <code>className="my-icon"</code>{" "}
              {single ? "on ExampleIcon" : "on the span wrapper"}, and remove
              the inline variable values from <code>style</code>. Inline styles
              take priority over class rules.
            </p>
          )}
          {single && (
            <button className="palette-copy" onClick={() => setTab("usage")}>
              Show React usage example
            </button>
          )}
        </section>
        <section
          className="theme-guide usage-guide"
          aria-label="Tailwind theme setup"
        >
          <h3>One icon. Two themes.</h3>
          <ol>
            <li>
              <b>Merge globals.css / @theme</b> into your Tailwind v4 global
              stylesheet. Light tokens live in <code>@theme static</code>;{" "}
              <code>.dark</code> overrides those same tokens.
            </li>
            <li>
              <b>Copy the Tailwind example.</b> Its literal classes connect the
              icon’s variables to <code>--color-*</code> tokens. No inline
              palette styles.
            </li>
            <li>
              <b>Switch the theme.</b> The included button toggles a{" "}
              <code>.dark</code> ancestor. For your whole app, use its existing
              theme switch or toggle{" "}
              <code>document.documentElement.classList.toggle('dark')</code>.
              The custom dark variant makes <code>dark:</code> classes follow
              that switch.
            </li>
          </ol>
          <p>
            This setup targets Tailwind v4. For v3, configure{" "}
            <code>darkMode: 'class'</code> in tailwind.config.js;{" "}
            <code>@theme</code> requires v4.{" "}
            <a
              href="https://tailwindcss.com/docs/theme"
              target="_blank"
              rel="noreferrer"
            >
              Theme docs
            </a>{" "}
            ·{" "}
            <a
              href="https://tailwindcss.com/docs/dark-mode"
              target="_blank"
              rel="noreferrer"
            >
              Dark mode docs
            </a>
          </p>
        </section>
        <section
          className="developer-setup usage-guide"
          aria-label="Install tiny-isprite"
        >
          <span className="mini-label">FOR YOUR NEXT PROJECT</span>
          <h3>Bring tiny-isprite into your app</h3>
          <p>
            The editor works without installation. For automated sprite builds
            and the React Icon component, install the package.
          </p>
          <button
            className="install"
            onClick={() => copy("npm install tiny-isprite", "install")}
          >
            <span>
              <b>$</b> npm install tiny-isprite
            </span>
            <Glyph name={copied === "install" ? "check" : "copy"} size={17} />
          </button>
          <p>
            <a href={`${github}#quick-start`} target="_blank" rel="noreferrer">
              Read the setup guide ↗
            </a>
          </p>
        </section>
        <section className="how-it-works">
          <div>
            <span className="step-number">01</span>
            <h3>Bring your SVGs</h3>
            <p>
              Start with the samples or drop in your own. We clean scripts and
              external references.
            </p>
          </div>
          <div>
            <span className="step-number">02</span>
            <h3>Keep the good parts</h3>
            <p>
              Choose your prefix and colors. Preview real SVG symbols rendered
              with React.
            </p>
          </div>
          <div>
            <span className="step-number">03</span>
            <h3>Ship a fresh sprite</h3>
            <p>
              Use the generated URL in your app. Changed bytes get a new
              content-hashed filename.
            </p>
          </div>
        </section>
      </main>
      <footer>
        <a className="brand footer-brand" href={github}>
          <BrandMark small />
          <strong>tiny-isprite.</strong>
        </a>
        <p>A little less icon chaos.</p>
        <a href="https://ko-fi.com/dynation" target="_blank" rel="noreferrer">
          Built by Dynation <span>↗</span>
        </a>
      </footer>
    </div>
  );
}

function Workspace() {
  const [loaded, setLoaded] = useState(false),
    [draft, setDraft] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    loadDraft()
      .then((value) => {
        if (value)
          value.icons = value.icons.map((icon) => ({
            ...icon,
            content: cleanSvg(icon.content, icon.name, SINGLE_FILE_SIZE),
          }));
        if (!disposed) {
          setDraft(value);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!disposed) {
          setError("unavailable");
          setLoaded(true);
        }
      });
    return () => {
      disposed = true;
    };
  }, []);
  return loaded ? (
    <App initialDraft={draft} storageError={error} />
  ) : (
    <p className="draft-loading" role="status">
      Opening your local workspace…
    </p>
  );
}
createRoot(document.getElementById("root")).render(<Workspace />);
