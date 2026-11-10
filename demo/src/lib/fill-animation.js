export const FLOW_RESOLUTION = 320;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// Eight-neighbour graph distances stay inside each connected painted region.
// Each disconnected island gets a seed nearest the requested inlet point.
export function buildDistanceField(
  labels,
  width,
  height,
  originX = 0.5,
  originY = 0.5,
) {
  const count = width * height;
  const distance = new Int32Array(count).fill(-1);
  const field = new Float32Array(count).fill(-1);
  const seen = new Uint8Array(count);
  const queue = new Int32Array(count);
  const components = [];
  function neighbours(index, visit) {
    const x = index % width,
      y = Math.floor(index / width);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (
          (!dx && !dy) ||
          x + dx < 0 ||
          x + dx >= width ||
          y + dy < 0 ||
          y + dy >= height
        )
          continue;
        visit(index + dx + dy * width);
      }
  }
  for (let start = 0; start < count; start++) {
    if (labels[start] < 0 || seen[start]) continue;
    let head = 0,
      tail = 1,
      seed = start,
      nearest = Infinity;
    queue[0] = start;
    seen[start] = 1;
    while (head < tail) {
      const pixel = queue[head++];
      const d =
        ((pixel % width) - originX * (width - 1)) ** 2 +
        (Math.floor(pixel / width) - originY * (height - 1)) ** 2;
      if (d < nearest) {
        nearest = d;
        seed = pixel;
      }
      neighbours(pixel, (next) => {
        if (!seen[next] && labels[next] === labels[start]) {
          seen[next] = 1;
          queue[tail++] = next;
        }
      });
    }
    const pixels = queue.slice(0, tail);
    head = 0;
    tail = 1;
    queue[0] = seed;
    distance[seed] = 0;
    let maximum = 0;
    while (head < tail) {
      const pixel = queue[head++];
      neighbours(pixel, (next) => {
        if (distance[next] < 0 && labels[next] === labels[start]) {
          distance[next] = distance[pixel] + 1;
          maximum = Math.max(maximum, distance[next]);
          queue[tail++] = next;
        }
      });
    }
    for (const pixel of pixels)
      field[pixel] = maximum ? distance[pixel] / maximum : 0;
    components.push({
      group: labels[start],
      seed,
      maximum,
      pixels: pixels.length,
    });
  }
  return { field, components };
}

export function trackProgress(time, track) {
  return (
    clamp((time - track.start) / Math.max(0.1, track.duration), 0, 1) *
    clamp(track.end / 100, 0, 1)
  );
}
export function radialCss(originX, originY, duration) {
  const x = clamp(Number(originX) || 0, 0, 100),
    y = clamp(Number(originY) || 0, 0, 100);
  const seconds = clamp(Number(duration) || 1.8, 0.1, 30);
  return `/* Whole-icon radial reveal. This circle does not travel around holes.\n   Apply className="fill-reveal" to ExampleIcon, or a wrapper around Icon.\n   No changes to the SVG paths are needed. */\n.fill-reveal {\n  animation: fill-reveal ${seconds}s linear both;\n}\n@keyframes fill-reveal {\n  from { clip-path: circle(0% at ${x}% ${y}%); }\n  to   { clip-path: circle(150% at ${x}% ${y}%); }\n}\n@media (prefers-reduced-motion: reduce) {\n  .fill-reveal { animation: none; clip-path: none; }\n}\n/* Shape-following flow uses a computed distance field in JavaScript.\n   Per-paint timing in the demo is not included in this CSS-only shortcut. */\n`;
}

export async function prepareFillField(
  svg,
  variables,
  originX,
  originY,
  aspectRatio = 1,
) {
  if (variables.length > 4095)
    throw new Error(
      "Too many paint variables for the animation preview (maximum 4095).",
    );
  const width = Math.max(
    1,
    Math.round(FLOW_RESOLUTION / Math.max(1, aspectRatio)),
  );
  const height = Math.max(
    1,
    Math.min(FLOW_RESOLUTION, Math.round(width * aspectRatio)),
  );
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  // A flat label render identifies each generated paint independently of its color.
  variables.forEach((variable, index) => {
    const id = index + 1;
    root.style.setProperty(
      variable.name,
      `rgb(${(id & 15) * 16 + 8},${((id >> 4) & 15) * 16 + 8},${((id >> 8) & 15) * 16 + 8})`,
    );
  });
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(root)], {
      type: "image/svg+xml",
    }),
  );
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    const labels = new Int32Array(width * height).fill(-1);
    const groupCount = Math.max(1, variables.length);
    for (let p = 0; p < labels.length; p++) {
      const offset = p * 4;
      if (data[offset + 3] < 24) continue;
      const id =
        Math.round((data[offset] - 8) / 16) +
        Math.round((data[offset + 1] - 8) / 16) * 16 +
        Math.round((data[offset + 2] - 8) / 16) * 256 -
        1;
      labels[p] = id >= 0 && id < groupCount ? id : 0;
    }
    const { field, components } = buildDistanceField(
      labels,
      width,
      height,
      originX / 100,
      originY / 100,
    );
    if (!components.length)
      throw new Error("This SVG has no visible painted pixels to animate.");
    context.clearRect(0, 0, width, height);
    return {
      width,
      height,
      labels,
      field,
      components,
      canvas,
      context,
      pixels: context.createImageData(width, height),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function drawFillMask(prepared, tracks, time, mode, originX, originY) {
  const { labels, field, width, height, canvas, context, pixels } = prepared;
  const progress = tracks.map((track) => trackProgress(time, track));
  let revealed = 0,
    painted = 0;
  const radius = Math.max(
    ...[
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ].map(([x, y]) =>
      Math.hypot(x - (originX * width) / 100, y - (originY * height) / 100),
    ),
  );
  for (let p = 0; p < labels.length; p++) {
    const offset = p * 4;
    const group = labels[p];
    let alpha = 0;
    if (group >= 0) {
      painted++;
      const value = progress[group] ?? progress[0];
      const arrival =
        mode === "radial"
          ? Math.hypot(
              (p % width) - (originX * width) / 100,
              Math.floor(p / width) - (originY * height) / 100,
            ) / radius
          : field[p];
      alpha =
        value <= 0
          ? 0
          : value >= 1
            ? 255
            : clamp((value - arrival) * 255 * 80, 0, 255);
      if (alpha > 127) revealed++;
    }
    pixels.data[offset] =
      pixels.data[offset + 1] =
      pixels.data[offset + 2] =
        255;
    pixels.data[offset + 3] = alpha;
  }
  context.putImageData(pixels, 0, 0);
  return {
    url: canvas.toDataURL("image/png"),
    revealed,
    painted,
    complete: progress.every((value) => value >= 1),
  };
}
