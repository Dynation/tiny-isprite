// SPDX-License-Identifier: MIT
// Portable player: no imports, network calls, SVG rasterization or graph search.
const hosts = new WeakMap();
let sequence = 0;
const NS = "http://www.w3.org/2000/svg";
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));

export function decodeAnimation(data) {
  if (
    data?.schemaVersion !== 1 ||
    data.map?.format !== "u16le-paint-arrival-v1"
  )
    throw new Error("Unsupported animation format.");
  const { width, height, bytes } = data.map;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 320 ||
    height > 320
  )
    throw new Error("Invalid animation map dimensions.");
  if (
    !Array.isArray(data.tracks) ||
    !data.tracks.length ||
    data.tracks.length > 4095
  )
    throw new Error("Invalid paint tracks.");
  for (const track of data.tracks)
    if (
      ![track.start, track.duration, track.end].every(Number.isFinite) ||
      track.start < 0 ||
      track.start > 30 ||
      track.duration < 0.1 ||
      track.duration > 30 ||
      track.end < 0 ||
      track.end > 100
    )
      throw new Error("Invalid paint timing.");
  if (
    !Array.isArray(data.bounds) ||
    data.bounds.length !== 4 ||
    !data.bounds.every(Number.isFinite) ||
    data.bounds[2] <= 0 ||
    data.bounds[3] <= 0
  )
    throw new Error("Invalid animation bounds.");
  const raw = Uint8Array.from(atob(bytes), (ch) => ch.charCodeAt(0));
  if (raw.byteLength !== width * height * 4)
    throw new Error("Animation map is incomplete.");
  const view = new DataView(raw.buffer);
  const labels = new Uint16Array(width * height),
    arrivals = new Uint16Array(width * height);
  let painted = 0;
  for (let i = 0; i < labels.length; i++) {
    labels[i] = view.getUint16(i * 4, true);
    arrivals[i] = view.getUint16(i * 4 + 2, true);
    if (labels[i] > data.tracks.length || (labels[i] && arrivals[i] === 65535))
      throw new Error("Invalid paint map entry.");
    if (labels[i]) painted++;
  }
  return {
    width,
    height,
    labels,
    arrivals,
    painted,
    duration: Math.max(...data.tracks.map((t) => t.start + t.duration)),
  };
}

function uniqueSvg(source) {
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  const svg = parsed.documentElement;
  if (
    parsed.querySelector("parsererror") ||
    svg.localName !== "svg" ||
    svg.namespaceURI !== NS ||
    svg.querySelector("script,foreignObject,iframe,object,embed,image")
  )
    throw new Error("Invalid animation artwork.");
  const prefix = `isprite-motion-${++sequence}-${Math.random().toString(36).slice(2, 9)}`;
  const ids = new Map();
  for (const element of [svg, ...svg.querySelectorAll("*")]) {
    for (const attr of [...element.attributes])
      if (/^on/i.test(attr.name)) throw new Error("Unsafe animation artwork.");
    if (element.id) ids.set(element.id, `${prefix}-${ids.size}`);
  }
  for (const element of [svg, ...svg.querySelectorAll("*")])
    for (const attr of [...element.attributes]) {
      if (attr.name === "id") attr.value = ids.get(attr.value);
      else if (attr.localName === "href") {
        if (!attr.value.startsWith("#") || !ids.has(attr.value.slice(1)))
          throw new Error("External artwork references are unsupported.");
        attr.value = `#${ids.get(attr.value.slice(1))}`;
      } else {
        attr.value = attr.value.replace(
          /url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/g,
          (_, id) => `url(#${ids.get(id) || id})`,
        );
        if (attr.name === "aria-labelledby" || attr.name === "aria-describedby")
          attr.value = attr.value
            .split(/\s+/)
            .map((id) => ids.get(id) || id)
            .join(" ");
      }
    }
  return { svg: document.importNode(svg, true), prefix };
}

export function createAnimation(host, data, options = {}) {
  if (!host || typeof host.replaceChildren !== "function")
    throw new Error("Provide a DOM container.");
  if (hosts.has(host))
    throw new Error(
      "This container already has an animation. Destroy it before mounting again.",
    );
  const map = decodeAnimation(data);
  const initialProgress =
    options.initialProgress ?? data.initialProgress ?? 100;
  const initialTheme = options.theme || data.defaultTheme || "light";
  if (!Number.isFinite(Number(initialProgress)))
    throw new Error("Progress must be a finite percentage.");
  if (!["light", "dark"].includes(initialTheme))
    throw new Error("Theme must be light or dark.");
  const { svg, prefix } = uniqueSvg(data.svg);
  const original = [...host.childNodes];
  const defs = document.createElementNS(NS, "defs");
  const mask = document.createElementNS(NS, "mask");
  const image = document.createElementNS(NS, "image");
  const content = document.createElementNS(NS, "g");
  const id = `${prefix}-reveal`;
  mask.id = id;
  mask.setAttribute("maskUnits", "userSpaceOnUse");
  mask.setAttribute("maskContentUnits", "userSpaceOnUse");
  mask.style.maskType = "alpha";
  for (const [index, key] of ["x", "y", "width", "height"].entries()) {
    mask.setAttribute(key, String(data.bounds[index]));
    image.setAttribute(key, String(data.bounds[index]));
  }
  image.setAttribute("preserveAspectRatio", "none");
  mask.appendChild(image);
  defs.appendChild(mask);
  for (const child of [...svg.childNodes])
    if (
      child.nodeType === 1 &&
      ["defs", "title", "desc"].includes(child.localName)
    )
      continue;
    else content.appendChild(child);
  svg.append(defs, content);
  svg.style.display = "block";
  svg.style.width = "100%";
  svg.style.height = "auto";
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", options.label || data.name || "Animated icon");
  const canvas = document.createElement("canvas");
  canvas.width = map.width;
  canvas.height = map.height;
  const context = canvas.getContext("2d");
  const pixels = context.createImageData(map.width, map.height);
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  let progress = 100,
    playing = false,
    frame = 0,
    destroyed = false,
    lastFrame = 0,
    theme = initialTheme,
    overrides = {};
  const appliedColors = new Set();
  let revealed = map.painted;
  function live() {
    if (destroyed) throw new Error("Animation has been destroyed.");
  }
  function pause() {
    if (destroyed) return;
    cancelAnimationFrame(frame);
    frame = 0;
    playing = false;
  }
  function seek(value) {
    live();
    pause();
    if (!Number.isFinite(Number(value)))
      throw new Error("Progress must be a finite percentage.");
    progress = clamp(Number(value), 0, 100);
    render();
    return progress;
  }
  function render() {
    const time = (progress * map.duration) / 100;
    const paints = data.tracks.map(
      (t) => (clamp((time - t.start) / t.duration, 0, 1) * t.end) / 100,
    );
    revealed = 0;
    if (paints.every((v) => v >= 1)) {
      content.removeAttribute("mask");
      revealed = map.painted;
      return;
    }
    for (let p = 0; p < map.labels.length; p++) {
      const group = map.labels[p];
      const value = group ? paints[group - 1] : 0;
      const arrival = map.arrivals[p] / 65534;
      const alpha =
        !group || value <= 0
          ? 0
          : value >= 1
            ? 255
            : clamp((value - arrival) * 255 * 80, 0, 255);
      const offset = p * 4;
      pixels.data[offset] =
        pixels.data[offset + 1] =
        pixels.data[offset + 2] =
          255;
      pixels.data[offset + 3] = alpha;
      if (alpha > 127) revealed++;
    }
    context.putImageData(pixels, 0, 0);
    image.setAttribute("href", canvas.toDataURL("image/png"));
    content.setAttribute("mask", `url(#${id})`);
  }
  function play() {
    live();
    if (playing) return;
    if (media.matches) {
      seek(100);
      options.onComplete?.();
      return;
    }
    if (progress >= 100) progress = 0;
    const began = performance.now() - progress * map.duration * 10;
    playing = true;
    lastFrame = 0;
    function tick(now) {
      if (destroyed || !playing) return;
      progress = Math.min(100, (now - began) / (map.duration * 10));
      if (now - lastFrame >= 33 || progress >= 100) {
        render();
        lastFrame = now;
      }
      if (progress < 100) frame = requestAnimationFrame(tick);
      else {
        frame = 0;
        playing = false;
        options.onComplete?.();
      }
    }
    frame = requestAnimationFrame(tick);
  }
  function replay() {
    seek(0);
    play();
  }
  function applyColors() {
    const palette = { ...(data.palettes?.[theme] || {}), ...overrides };
    for (const key of appliedColors) svg.style.removeProperty(key);
    appliedColors.clear();
    for (const [key, value] of Object.entries(palette)) {
      if (
        (key === "color" || /^--[\w-]+$/.test(key)) &&
        CSS.supports("color", value)
      ) {
        svg.style.setProperty(key, value);
        appliedColors.add(key);
      }
    }
  }
  function setTheme(value) {
    live();
    if (!["light", "dark"].includes(value))
      throw new Error("Theme must be light or dark.");
    theme = value;
    applyColors();
  }
  function setColors(value = {}) {
    live();
    overrides = { ...value };
    applyColors();
  }
  function setLabel(value) {
    live();
    svg.setAttribute("aria-label", String(value));
  }
  function motionChanged() {
    if (media.matches) {
      pause();
      seek(100);
    }
  }
  const api = {
    play,
    replay,
    pause,
    seek,
    setTheme,
    setColors,
    setLabel,
    getState: () => ({
      progress,
      playing,
      theme,
      destroyed,
      reducedMotion: media.matches,
      duration: map.duration,
      revealed,
      painted: map.painted,
    }),
    destroy() {
      if (destroyed) return;
      pause();
      destroyed = true;
      media.removeEventListener("change", motionChanged);
      hosts.delete(host);
      host.replaceChildren(...original);
    },
  };
  host.replaceChildren(svg);
  hosts.set(host, api);
  media.addEventListener("change", motionChanged);
  applyColors();
  seek(initialProgress);
  if (options.autoPlay) replay();
  return api;
}
