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
not style). The Tailwind tab provides a working theme-switch component with semantic-token
classes for a Tailwind v4 project; globals.css / @theme supplies its stylesheet.
The playground itself uses plain CSS.

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

## Tailwind v4 themes

Each selected icon has independent light and dark color values. The Light/Dark
preview switch changes inherited custom properties without replacing the SVG.
The preview uses plain CSS; regressions compile the actual generated global CSS
with Tailwind 4.3.0 and verify both the published sprite Icon and standalone
component inherit the correct light/dark paints. Tailwind is a development-only
test dependency and is not included in the browser bundle.

Download or copy globals.css / @theme and the Tailwind theme example. Merge
@import "tailwindcss", @custom-variant dark and @theme static into the consuming
app's global stylesheet. The generated --color-icon-\* tokens hold light colors;
.dark overrides the same tokens. static emits tokens even if the only consumer
is an SVG custom-property binding. The component's literal Tailwind classes map
its generated paint variables to these tokens. Do not add inline palette styles,
which would override the theme.

The example includes a local .dark ancestor toggle and dark: surface/text classes.
An existing app-wide theme toggle can replace it. The generated CSS targets v4;
@theme is not supported in v3. Sprite ZIPs include src/globals.css and
src/Theme-example.jsx for the selected icon. Single mode provides separate CSS and
example downloads beside the generated component. SVG and basic React downloads
retain light palette defaults; theme files contain both palettes.

Official references: https://tailwindcss.com/docs/theme and
https://tailwindcss.com/docs/dark-mode .

## Optional fill animation

Enable fill animation in the selected icon editor. It is off by default and does
not alter SVG, React, sprite, palette or theme exports. Both Single and Sprite
selection previews use the standalone vector for this effect.

Flow inside shape rasterizes a temporary paint-label render on a grid with at
most 320 pixels on its longest side. It finds connected components per paint and
computes eight-neighbour graph distances from an inlet nearest the chosen point
in each component. Increasing the progress threshold reveals the original vector
with a temporary raster mask. It bends around holes but is an approximation, not
a fluid simulation or handwriting reconstruction. Separate islands get separate
inlets. At complete fill the mask is removed, restoring the exact vector.

Generate CSS variables to obtain separate fill/stroke tracks. Each has a start
time, duration and final percentage, allowing overlap and intentionally unfinished
fills. X/Y controls or clicking the artwork choose the inlet. Playback is explicit,
runs once, can pause, and is cleaned up on selection/source changes, disable and
unmount. Reduced-motion users get the completed state on Play, with manual
timeline scrubbing still available.

The radial alternative uses the same preview controls but expands by geometric
distance from the inlet instead of distance inside the shape. Its downloadable
CSS-only example reveals the whole icon with clip-path: circle(). That shortcut
does not include per-paint tracks or flow around holes. Shape-following flow
uses JavaScript; Export animation ZIP packages its prepared maps and player for
independent playback.

Tests cover a U-shaped obstacle, disconnected pieces and paint boundaries,
overlapping/incomplete tracks, browser playback, origin changes, reduced motion,
CSS download and cleanup. Optional local QA can supply PLAYGROUND_FLOW_LOGO
for an additional complex text/logo SVG; that file is not committed or uploaded.

## Editor layout

Colors and Fill animation are sibling tabs beside the selected SVG. Playback and
the timeline are the first animation controls, above Fill effect, origin and paint
tracks. The control pane scrolls independently with sticky tabs/timeline; the
preview stays alongside it on desktop and in a compact area above it on phones.
Switching to Colors stops playback and clears the temporary preview mask without
losing the animation's enabled state, timing settings or scrub position. Returning
to animation restores the chosen frame. The mask analysis follows the measured
SVG viewport (including letterboxing) and updates when that viewport resizes.

Browser assertions cover simultaneous artwork/timeline visibility at desktop,
tablet and phone widths, timeline order, scrolling and state across tab changes.

## Full portable animation export

Enable animation, configure paint timing and click Export animation ZIP. It ships
cleaned artwork, animation-data.js (schema v1, packed precomputed arrival/paint
maps, bounds, tracks and light/dark palettes), a dependency-free player.js,
AnimatedIcon.jsx, JS/React usage examples, an independent index.html consumer and
the player license. No payment or server dependency is included.

The exported player does not rasterize SVG or calculate graph distances. It
decodes the prepared little-endian uint16 maps once and renders threshold masks.
Mask bounds are stored in SVG coordinates, including editor letterboxing, so
responsive instances do not need to recompute the geometry. Complete fills remove
the mask and render the exact vector. Multiple instances rename internal IDs and
manage their own playback/listeners. The React wrapper supports SSR import,
StrictMode, controlled progress, theme/color changes and cleanup. See the ZIP's
README for the API and an HTTP-server example (ES modules need an HTTP origin).
For strict CSP consumers, allow data: images for the generated alpha masks.

Portable playback supports play/replay/pause/seek, partial final paints, reduced
motion and destroy/remount. No automatic loop is applied. Existing static exports
remain static. Animation data changes require a new export; themes and paint
colors can be changed by the player.

`npm run test:animation-export` builds the demo, downloads the real ZIP through the
UI and serves only extracted files on an independent origin. It checks preview
parity, visible masks, three instances/unique IDs, offline playback, responsive
layout, reduced motion, colors, partial ends, destroy/remount, React StrictMode and
production React bundles. It blocks all outside requests. Optional local QA may
set PLAYGROUND_EXPORT_SVG to a personal SVG; that source is not committed.
`npm run test:playground` includes this consumer test.

Animation ZIP export is available at the top of the animation pane, in the sticky
Timeline block. The general downloads panel includes Open animation export, which
opens the correct tab, scrolls to the selected icon and focuses Enable fill
animation. Its caption explains the remaining enable/export steps.

### First visit and page theme

The playground starts with the original multicolor Orbit artwork in Single icon
mode at 256px. Generate CSS variables and Include multicolor fills and strokes
are enabled. Fill animation is ready to play for the three featured samples;
uploaded artwork still requires opting in. Orbit, Bloom and Ribbon are original
MIT-licensed demo artwork. The full sprite collection is available in the
collapsed More icons & sprite collection panel below the selected editor.

The whole page starts dark. The header theme button saves the page theme in
localStorage when available; the editor works when storage is blocked. This is
independent of the artwork's Light preview / Dark preview palette switch.
Downloads precede the React/Tailwind guides, package installation is near the end,
and the optional Ko-fi link follows exports without a popup or blocking step.
The current Sites address remains the preview location; deployment does not
change the audience or enable public access.

### GitHub Pages

Public demo: https://dynation.github.io/tiny-isprite/ . Pages serves compiled
static files from the `gh-pages` branch at `/`. Source changes are reviewed in
`master`; publishing build output does not merge a source PR or publish npm.

Build specifically for this repository subpath:

```sh
VITE_BASE_PATH=/tiny-isprite/ npm run build:demo
```

Run the full browser/export suite under that same base before publishing:

```sh
VITE_BASE_PATH=/tiny-isprite/ npm run test:playground
```

Publish only `demo/dist/`, with `.nojekyll`, to `gh-pages`. Keep previously
published hashed assets when updating, so already open tabs retain their imports.
The default base remains `/` for the separate private Sites preview. The home
link and favicon follow the configured base. No analytics provider is configured.

### Independent region origins

Enable **Separate region origins** in Fill animation. The transparent preview
overlay selects painted regions without changing the source SVG. Select a region
by clicking its painted area or using the Selected region list. Choose **Place
origin on artwork**, then click a point, or enter Region X/Y percentages in the point's popover. The pin
shows the nearest painted sample used as the actual inlet. **Use shared origin** removes only that region's override.

Each disconnected visible region of the same paint can use a different origin.
Paint timing supplies shared defaults. Double-click a region or its pin, or choose
**Edit region settings**, to open a compact nonmodal popover with that region's
X/Y, Start (s), Duration (s) and End fill (%). Start is an absolute delay from the
beginning of the timeline. Editing a timing field overrides only that field;
**Use color timing** restores inheritance. Coordinates are no longer repeated in
the main panel. Escape/Close restores focus to the edit button; outside clicks
close the popover, and the explicit button supports touch and keyboard use. Flow and radial ZIP exports bake
these origins into arrival maps; no extra processing is added to the portable
player. Optional `regions` metadata records effective origins without changing
the map format or breaking existing schema-v1 players. CSS-only radial export
still represents the whole-icon shortcut.

This mode uses a fixed artwork-aspect analysis grid, with an aligned SVG overlay
and contain/cover mask placement to account for viewport letterboxing. Region
identities and coordinates survive viewport/export-size changes and palette edits.
Changes to geometry or paint grouping reset overrides. Regions are connected
samples on the existing 320px analysis grid, not semantic SVG path objects:
touching shapes can form one region and subpixel gaps may be indistinguishable.
The overlay/highlight/pins never enter exported artwork.

Region timing exports compile into ordinary positional timing tracks and remap
the per-pixel track indices. Multiple tracks may retain the same CSS-variable
name because they represent separate regions of the same paint. Region metadata
links each region to its compiled track. Inherited tracks with no remaining
regions are omitted so they do not extend playback. Existing schema-v1 players
need no change. Export remains limited to 4095 effective timing tracks; an
explicit error disables play/export if that limit is exceeded.
