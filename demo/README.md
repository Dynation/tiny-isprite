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

Up to 80 SVGs. Sprite uploads allow 128 KB each; Single icon allows 2 MB each. Scripts, embedded HTML/images, animation, style blocks
and external references are removed. Duplicate filenames get unique names. Root
presentation attributes are preserved on a group, and local IDs are namespaced.
The bundle contains cleaned sources, not original uploaded files.

Color handling matches the CLI: default mode converts monochrome fills, original
mode preserves fills, and CSS-variable mode converts monochrome fill/stroke values.
Fixed strokes retain their color outside variable mode. In the editable palette,
currentColor paints are materialized as #245cf3 to give them named variables;
SVGs with implicit black fills get an explicit fill. Enable multicolor conversion
to match the CLI's --all option. Gradient stops retain their source colors.

The selected icon shows its own fill/stroke variables with color pickers and HEX
inputs. Edits persist per icon, update the preview and generated CSS, and are baked
into exported source SVGs so the published CLI can regenerate the chosen colors.
CSS variables can be copied or downloaded separately. React examples put variables
on a wrapper, compatible with the published Icon API (which accepts className,
not style). The Tailwind tab provides equivalent arbitrary custom-property classes
for use in a Tailwind-enabled project; the playground itself uses plain CSS.

## Hosting

Build output is dist/. There are no client-side routes. The hosting manifest
identifies the owner-private Sites preview.

## Single icon

Choose **Single icon**, then select an icon to download a standalone `.svg` or
`.jsx` component. This output needs neither a sprite nor tiny-isprite installed.
It uses the same cleanup and color conversion engine. The larger editor appears
above the icon gallery in Single mode. Line thickness and rotation are optional
controls; thickness affects strokes, not filled silhouettes. CSS variables carry inline
fallback colors, so no stylesheet is required. Single SVG exports include the chosen currentColor as a color presentation
attribute; consumers can override it with CSS or React props. The width sets the exported defaults (1–2048 px); height follows the SVG viewBox
ratio. Comma-separated viewBoxes are normalized before sprite generation.

Generated React components scope local IDs with `useId` (React 18+), preventing
collisions when the same gradient, mask or clip-path icon is rendered twice. SVG
files retain static local IDs; when manually pasting multiple SVGs into the same
HTML document, namespace their IDs or use the generated React component.

Optional local regression fixtures can be supplied with PLAYGROUND_LOGO (a
multicolor, 400-unit wide logo) and PLAYGROUND_ARTWORK (the 2400×1352 monochrome
artwork used in manual QA). Personal source files are not committed or uploaded.

## Applying colors in React

In Single mode, React usage is shown first. Download the component as the exact
filename in the import, then copy/download the separate usage file beside it.
Render its default IconExample in the consuming app. Keep the quoted variable
names in iconColors, change their color values, and pass style={iconColors}
directly to the standalone ExampleIcon. Its generated paint fallbacks remain
editable without modifying paths. The example computes height from width and the
source aspect ratio. color only affects currentColor paints.

For the published tiny-isprite Icon, the React example instead uses an iconStyle
object on a span wrapper, because Icon 2.1.0 does not accept a style prop. The
wrapper passes custom properties to the SVG. With a downloaded CSS file, import
it, keep className="my-icon" on that wrapper (or standalone component), and remove
inline variable overrides so the class can apply.

The browser regression compiles the actual generated usage file, resolves its
component import, replaces a color value and verifies the rendered SVG's computed
fill changes to that value.
