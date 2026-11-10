# tiny-isprite playground

A static React/Vite app for exploring tiny-isprite and exporting sprites in the
browser. No upload endpoint, account, analytics or persistent storage is required.
Refreshing resets the sample set.

## Run

Node 20+: `npm ci`, then `npm run dev`. Production: `npm run build` and
`npm run preview`. `npm test` checks hashing, bundle contents and validation.
From the parent library, `npm run test:playground` runs production browser checks
and reproduces ZIP output with the published generator.

## Shared generation

`src/lib/sprite-content.js` is generated from the parent library's canonical
`core/sprite-content.js`. The predev/prebuild hooks refresh it when that source is
available. A standalone Sites snapshot retains the mirror for independent builds.
Edit the canonical module in the library and regenerate; do not hand-edit the copy.

`src/lib/project.js` handles cleanup, SHA-256 hashing and ZIP export. The preview
uses the published tiny-isprite 2.1.0 React component.

## Uploads

Up to 80 SVGs, 128 KB each. Scripts, embedded HTML/images, animation, style blocks
and external references are removed. Duplicate filenames get unique names. Root
presentation attributes are preserved on a group, and local IDs are namespaced.
The bundle contains cleaned sources, not original uploaded files.

Color handling matches the CLI: default mode converts monochrome fills, original
mode preserves fills, and CSS-variable mode converts monochrome fill/stroke values.
Fixed strokes retain their color. Preview color affects currentColor only.

## Hosting

Build output is dist/. There are no client-side routes. The hosting manifest
identifies the owner-private Sites preview.
