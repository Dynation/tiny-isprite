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
  add(
    "README.md",
    `# Your portable animation\n\nEverything needed for playback is in this folder. No account, CDN, playground, tiny-isprite install or animation server is required. Artwork is cleaned SVG; paint arrival maps and timing are already calculated. The player only renders the prepared map each frame. Flow remains a raster-mask approximation during playback; complete fills restore the exact vector.\n\n## Try the website\n\nServe this folder over HTTP, for example with \`python3 -m http.server 8080\`, and open http://localhost:8080. Browser ES modules do not reliably run from file://. index.html is an independent three-instance consumer site using only player.js and animation-data.js.\n\n## Plain JavaScript\n\n\`\`\`js\nimport animation from './animation-data.js';\nimport { createAnimation } from './player.js';\nconst player = createAnimation(document.querySelector('#icon'), animation);\nplayer.replay();\nplayer.pause();\nplayer.seek(45); // percentage of the complete timeline, 0–100\nplayer.setTheme('dark');\nplayer.setColors({ /* exact --paint-variable-name: 'your color' */ });\nplayer.destroy(); // removes listeners, cancels playback and restores the container\n\`\`\`\n\nGive the container a width (for example 320px). Its SVG keeps the original viewBox and supports responsive dimensions. Multiple instances have independent control and unique SVG/gradient/mask IDs.\n\n## React\n\nCopy AnimatedIcon.jsx, player.js and animation-data.js together into your React project. See react-example.jsx. React is the only peer requirement. Props: width, autoPlay (false by default), progress (0–100), theme ('light'/'dark'), colors (paint overrides), label, className, style (container layout), onReady(player), onComplete(). Use colors or setColors for paint overrides; style controls the container. SSR renders an empty reserved-width container; the SVG mounts on the client. StrictMode mount/cleanup is supported.\n\nPlayback does not loop automatically. Replay starts at zero; Play resumes a paused timeline and restarts a completed one. A completed timeline may intentionally leave paint incomplete if its end value is below 100%. Reduced-motion preference disables automatic motion but keeps manual seek available.\n\nMap format: schemaVersion 1, little-endian uint16 paint index (0 = empty) plus uint16 arrival (0–65534) per sample. bounds map that grid into SVG coordinates, preserving editor letterboxing even on other layouts. Changing origin, SVG geometry or timing requires a new export; colors and theme can change at runtime. The saved initialProgress is the editor scrub position.\n\nThe player and React integration are MIT-licensed; see LICENSE.txt. Artwork retains its own license. No payments or licensing checks are embedded.\n`,
  );
  return zipSync(files, { level: 6 });
}
