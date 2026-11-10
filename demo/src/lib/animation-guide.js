export const animationAiPrompt = `Help me integrate an animation exported from tiny-isprite into my project.

I must attach the animation ZIP to this chat, or give my coding agent the local path to its extracted folder. Copying this prompt sends text only; it does not upload or grant access to any files. If you cannot read the files or project, ask me for them before proceeding.

Read README.md and inspect the actual exported files and my project first. Ask where the animation belongs if that is unclear. Preserve unrelated changes and follow the project's conventions.

For HTML/plain JavaScript, keep player.js and animation-data.js together, import createAnimation in a module script, and mount into an existing container with a width. Call replay() to start. For React, also copy AnimatedIcon.jsx alongside those files, import its named AnimatedIcon export, and use autoPlay to start (default is false). Keep cleanup on unmount; call destroy() only when removing a plain JavaScript instance. Do not immediately pause or destroy the startup example.

Use the supplied runtime, timing and palettes; artwork.svg alone is static. No tiny-isprite install, CDN or animation server is required. Serve ES modules over HTTP, not file://. Respect reduced motion and explain that playback does not loop automatically.

Implement the integration if you have project access, then run the relevant build/checks and verify rendering and playback. Explain the changed files, how to run it, and any remaining steps. Do not claim checks passed unless you ran them.`;

export const animationReadme = `# Your portable animation

## Start here

1. Extract the animation ZIP into a folder. Do not use the files from inside the compressed ZIP.
2. Open a terminal in that extracted folder. If Python 3 is installed, run \`python3 -m http.server 8080\` (on Windows, \`py -m http.server 8080\`). Otherwise use your project's local development server.
3. Open http://localhost:8080 in your browser and click Replay. Keep the terminal running; Ctrl+C stops the server. Double-clicking index.html opens file://, where browser ES modules do not reliably run.
4. Choose the HTML or React integration below. You do not need the playground or a tiny-isprite installation.

## What is in the ZIP?

| File | Purpose |
| --- | --- |
| index.html | Working three-instance demo with playback controls |
| player.js | Standalone JavaScript animation runtime |
| animation-data.js | Your artwork, prepared fill maps, timing and palettes |
| AnimatedIcon.jsx | React wrapper; keep beside player.js and animation-data.js |
| react-example.jsx | React example with Replay, Pause and Theme buttons |
| artwork.svg | Static artwork only; it does not play the animation |
| README.md | This integration guide |
| AI-PROMPT.txt | Instructions to paste into an AI chat or coding agent |
| LICENSE.txt | Runtime license; artwork retains its own license |

## HTML / plain JavaScript

Copy player.js and animation-data.js into the same folder as this page (or adjust both import paths). Save this complete example as an HTML page and serve it over HTTP:

\`\`\`html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>My animation</title></head>
<body>
  <div id="icon" style="width: 320px"></div>
  <script type="module">
    import animation from './animation-data.js';
    import { createAnimation } from './player.js';
    const player = createAnimation(document.querySelector('#icon'), animation);
    player.replay();
  </script>
</body>
</html>
\`\`\`

The container must exist before mounting. Its SVG keeps the original viewBox and supports responsive dimensions. Each instance has independent controls and unique SVG/gradient/mask IDs. For an existing site, put the imports and mounting code in its client-side module and adjust the paths to your copied files.

## React

Copy AnimatedIcon.jsx, player.js and animation-data.js together into a folder such as src/components/animation in an existing React project. React is the only peer requirement; no tiny-isprite package is needed. In your page component, adjust the import path and render:

\`\`\`jsx
import { AnimatedIcon } from './components/animation/AnimatedIcon.jsx';

export default function Example() {
  return <AnimatedIcon width={320} autoPlay label="My animation" />;
}
\`\`\`

Run your project's usual development command. autoPlay defaults to false: omit it for a still initial frame, or use react-example.jsx for manual Replay/Pause controls. The wrapper handles cleanup on unmount. SSR reserves an empty container and mounts the SVG on the client; StrictMode mount/cleanup is supported. In Next.js, components passing callbacks such as onReady must be client components.

## Optional controls — not startup steps

Call these on an existing player only when the corresponding user action occurs. Do not run them all after mounting:

| Method | When to use it |
| --- | --- |
| player.replay() | Start again from zero |
| player.play() | Resume, or restart a completed timeline |
| player.pause() | Pause in response to a user action |
| player.seek(45) | Show 45% of the complete timeline (0–100) |
| player.setTheme('dark') | Switch to the exported dark palette |
| player.setColors({ '--paint-name': '#ff0000' }) | Override an exact paint variable from animation-data.js |
| player.destroy() | Cleanup only when removing the instance; cancels playback and restores the container |

React props: width, autoPlay, progress (0–100), theme ('light'/'dark'), colors, label, className, style, onReady(player), onComplete(). Use colors for paint overrides; style controls the container layout.

Playback does not loop automatically. Reduced-motion preference disables automatic motion; manual seek remains available. A track with an end value below 100% intentionally leaves paint incomplete. The saved initialProgress is the editor scrub position.

## Use an AI assistant

Copy AI-PROMPT.txt (or use Copy AI prompt beside the playground export). Only text is copied: no files are uploaded automatically. Attach this animation ZIP to your chat, or give your coding agent the local path to this extracted folder and access to your project. Tell it where you want the animation. If your chat cannot read ZIPs, provide the extracted files it requests.

## Troubleshooting

- Blank or static? Use the animation ZIP runtime, not artwork.svg or the regular static SVG/React download. Check the browser console for missing files or wrong import paths.
- No motion? Click Replay or set React autoPlay. Check the system's reduced-motion setting. A completed animation stays still until replayed.
- Module/CORS error? Use HTTP and keep the runtime/data files together; do not open file://.
- Want a different origin, geometry or timing? Change it in the playground and export again. Colors and theme can change at runtime.

Everything needed for playback is local: no account, CDN, animation server or licensing checks. Flow uses a raster-mask approximation during playback; complete fills restore the exact vector. Paint arrival maps and timing are precomputed, so the player does no graph search. Map format: schemaVersion 1, little-endian uint16 paint index (0 = empty) and uint16 arrival (0–65534) per sample. bounds map the grid into SVG coordinates, preserving editor letterboxing.

The player and React integration are MIT-licensed; see LICENSE.txt. Artwork retains its own license.
`;
