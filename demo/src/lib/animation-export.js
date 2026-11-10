import { animationAiPrompt, animationReadme } from "./animation-guide.js";
import { zipSync, strToU8 } from "fflate";

export function encodeAnimation({
  svg,
  prepared,
  tracks,
  mode,
  originX,
  originY,
  palettes,
  defaultTheme = "light",
  name = "icon",
  initialProgress = 100,
}) {
  if (!prepared || !["flow", "radial"].includes(mode))
    throw new Error("Prepare an animation before exporting.");
  const { width, height, labels, field } = prepared;
  const match = svg.match(/viewBox="([^"]+)"/);
  const box = match?.[1]
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    !box ||
    box.length !== 4 ||
    !box.every(Number.isFinite) ||
    box[2] <= 0 ||
    box[3] <= 0
  )
    throw new Error("Animation artwork needs a valid viewBox.");
  const bytes = new Uint8Array(width * height * 4);
  const view = new DataView(bytes.buffer);
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
    const group = labels[p];
    const arrival =
      mode === "radial"
        ? Math.hypot(
            (p % width) - (originX * width) / 100,
            Math.floor(p / width) - (originY * height) / 100,
          ) / radius
        : field[p];
    view.setUint16(p * 4, group < 0 ? 0 : group + 1, true);
    view.setUint16(
      p * 4 + 2,
      group < 0 ? 65535 : Math.round(Math.max(0, Math.min(1, arrival)) * 65534),
      true,
    );
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const scale = Math.min(width / box[2], height / box[3]);
  return {
    schemaVersion: 1,
    name,
    svg,
    display: {
      width: Number(svg.match(/\bwidth="([^"]+)"/)?.[1]) || 256,
      aspectRatio: box[3] / box[2],
    },
    mode,
    origin: { x: originX, y: originY },
    initialProgress,
    defaultTheme,
    palettes,
    tracks: tracks.map(({ name, start, duration, end }) => ({
      name,
      start,
      duration,
      end,
    })),
    bounds: [
      box[0] - (width - box[2] * scale) / (2 * scale),
      box[1] - (height - box[3] * scale) / (2 * scale),
      width / scale,
      height / scale,
    ],
    map: {
      format: "u16le-paint-arrival-v1",
      width,
      height,
      bytes: btoa(binary),
    },
  };
}

export function createAnimationBundle(
  data,
  { playerSource, reactSource, exampleHtml, license },
) {
  const files = {};
  const add = (name, text) => (files[name] = strToU8(text));
  add(
    "animation-data.js",
    `// Prepared animation data. No graph search is performed by the player.\nexport default ${JSON.stringify(data)};\n`,
  );
  add("artwork.svg", data.svg);
  add("player.js", playerSource);
  add("AnimatedIcon.jsx", reactSource);
  add("index.html", exampleHtml);
  add("LICENSE.txt", license);
  add(
    "react-example.jsx",
    `import { useRef, useState } from 'react';\nimport { AnimatedIcon } from './AnimatedIcon.jsx';\n\nexport default function Example() {\n  const player = useRef(null);\n  const [theme, setTheme] = useState('light');\n  return (\n    <>\n      <button onClick={() => player.current?.replay()}>Replay</button>\n      <button onClick={() => player.current?.pause()}>Pause</button>\n      <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>Theme</button>\n      <AnimatedIcon width={320} theme={theme} onReady={instance => { player.current = instance; }} />\n    </>\n  );\n}\n`,
  );
  add("README.md", animationReadme);
  add("AI-PROMPT.txt", animationAiPrompt);
  return zipSync(files, { level: 6 });
}
