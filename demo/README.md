# tiny-isprite playground

A static React/Vite app for exploring tiny-isprite and exporting sprites in the
browser. No upload endpoint, account, analytics or persistent storage is required.
Local drafts restore your edits when browser storage is available.

## Run

Node 20+: `npm ci`, then `npm run dev`. Production: `npm run build` and
`npm run preview`. `npm test` checks hashing, bundle contents and validation.
From the parent library, `npm run test:playground` runs production browser checks
and reproduces ZIP output with the published generator. Install its browsers with
`npx playwright install chromium firefox` from the parent library.

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

Animation ZIP export lives in the shared downloads panel alongside the static
SVG, React and bundle downloads. It remains available from the Colors tab when
animation is enabled and the current artwork is ready. How to use your animation
ZIP is collapsed by default and contains integration instructions and Copy AI
prompt. Uploaded artwork has a Set up animation helper until animation is enabled.

### Editor workspace

The editor uses the available page width. On desktop, drag the vertical separators
to resize package settings and icon controls; the canvas takes the remaining
space. Separators also support arrow keys (Shift for larger steps), Home/End, and
double-click to reset. Package settings and Icon controls can be collapsed without
unmounting the editor or losing animation settings. Reset layout restores defaults.
Panel widths and collapsed states are saved locally when storage is available.

Expand editor fills the viewport; Escape exits. Downloads leaves the expanded view
and scrolls to all downloads. The timeline stays directly below the artwork,
independent of the controls pane's scroll position. On screens up to 1000px wide,
Package, Colors and Animation open compact bottom sheets; the preview and timeline
remain above the controls on portrait screens. Close or Escape dismisses the sheet.
Short landscape screens prioritize scrollable controls. The regional timing editor
also uses a bottom sheet on phones.

Preview zoom is independent of export dimensions. The canvas toolbar offers
minus/plus (100–1600%), Fit, and a paw-shaped Pan tool. Ctrl/Command + wheel or trackpad
pinch zooms around the pointer inside the canvas. Scrollbars, Pan-tool drag,
Space + drag with canvas focus, and middle-button drag move around enlarged
artwork. Touch users can scroll the enlarged canvas or enable the Pan tool to drag it.
Panning suppresses region-selection/origin-placement clicks. The artwork and
region overlay share one scroll plane, so SVG screen coordinates account for
zoom and scroll. Fit returns to the complete artwork. Switching icons resets
the view; palette, timing and tab edits preserve it. Zoom is not baked into SVGs,
React components or animation exports.

`node test/preview-zoom.mjs` checks selection of 1–2px regions at high zoom,
origin coordinates after scrolling, Pan/Space dragging over the portal overlay,
scoped wheel zoom, Fit, mobile controls and byte-identical static SVG downloads.

`node test/editor-layout.mjs` checks pointer and keyboard resizing, saved layout,
collapse/reset, expanded-view recovery, ZIP download from Colors, and mobile
preview/timeline visibility at 390px and 320px. It is part of test:playground.

### Firefox preview rendering

The live preview uses a stable native SVG mask, matching the working ZIP player's
rendering approach. Updating CSS mask-image to a new PNG URL on every frame caused
intermittent completely blank frames in Firefox. The preview now updates the image
inside one SVG mask while keeping its reference stable. No user-agent detection is
needed, and the portable player and exported animation format are unchanged.

The temporary mask wraps only the displayed artwork. ViewBox, preserveAspectRatio,
letterboxing and the canonical region grid determine mask coordinates. Colors,
disabling animation and regeneration remove the wrapper/defs and restore the
original displayed nodes. Exports continue to use the generated SVG source, so
preview mask nodes never enter downloaded artwork.

`npm run test:firefox-animation` performs more than 200 mask updates in Firefox and
Chromium and counts visible red pixels in captured frames to detect blanking or
large backward jumps. It checks the unchanged portable player alongside preview,
plus actual editor mask reuse and cleanup. Frame statistics are saved under
`.release-artifacts/firefox-animation/`. The test is also part of test:playground;
CI installs both browsers.

### Guided animation editing

Open Fill animation and choose **Show me how** above Enable fill animation.
The short route highlights real controls with an arrow and a popover:

1. Enable fill animation (already enabled on featured examples).
2. Choose the fill effect and shared origin.
3. Start with per-color Start, Duration and End fill. Region overrides keep their
   own settings. Start/Duration use 0.01-second steps.
4. Play or scrub the timeline. Read the current seconds and use them for the next
   color/region's Start; this is time from timeline zero. Orbits can follow one
   another or overlap.
5. **Perfectionism?** Regions under 10 analysis samples often make little visible
   difference. At 1–2 points there is little room for a spreading fill; these may
   be SVG leftovers or rasterization specks. Samples are analysis-grid points,
   not a measure of original SVG detail. Use the preview to decide what matters.
6. **Next** skips individual-region editing and goes straight to ZIP export.

At step five, **Perfectionism mode** opens the optional detour: enable Separate
region origins, choose a region, edit its X/Y and timing in the popover, then place
its inlet on the artwork. That route has eleven steps. The same fields appear in
a bottom sheet on phones. Tiny regions remain selectable and keep their original
settings; this feature does not delete, suppress, retime or zero them. The region
list marks entries under 10 samples as tiny details and uses singular sample for
one analysis point.

Back, Next, Skip tour, Done and Escape are available; Go to control moves keyboard
focus to the highlighted element. Controls stay interactive. Next at the fork
always means the short route, even after returning with Back from the advanced
branch. Back from export reopens the controls. Done/Skip/Escape cancel unfinished
point placement; completed edits remain. Export is still an explicit button click.
Tour state is transient and is not saved into local drafts. The complete JS/React
animation is in Export animation ZIP; separate SVG/React downloads stay static.

`test/animation-tour.mjs` checks both routes at 1440/390/320px, branch navigation,
real regional timing/origin edits in ZIP exports, and Done/Skip/Escape recovery.

### First visit and page theme

The playground starts with the original multicolor Orbit artwork in Single icon
mode at 256px. Generate CSS variables and Include multicolor fills and strokes
are enabled. Featured examples are Orbit, Ribbon, Check circle, Code, Sun and
Photograph, using the maintainer's six exported animation ZIPs. Their paint and
regional schedules, inlet coordinates, light/dark palettes and edited artwork are
restored as editable controls, rather than approximated with generic delays.
Orbit plays once on a fresh visit. Each untouched example plays once when first
selected; saved edits restore paused. Reduced motion shows the completed artwork.
Uploaded artwork still requires opting in. Existing local drafts take precedence;
Load samples explicitly restores the authored examples and standard single-icon
options. Bloom and the other basic icons remain in the collapsed sprite library.

`src/data/demo-animations.json` contains declarative artwork/settings, ZIP SHA-256
provenance and run-length encoded regional topology. ZIP JavaScript is parsed as
JSON during import, never executed. The bundled arrival/player code is not copied;
the editor rebuilds its own fields and uses overlap matching to retain each
region's timing/origin. Topology is bound once to the correct generated geometry.
`test/demo-presets.mjs` compares every region's timing, origin and both palettes
with actual ZIP re-exports for all six examples, and tests autoplay, reduced
motion, saved edits and explicit reset. Orbit, Ribbon and Bloom are original MIT
artwork; Photograph is the maintainer-supplied `photograph-svgrepo-com` asset and
retains its upstream artwork license, as described in animation exports.


The whole page starts dark. The header theme button saves the page theme in
localStorage when available; the editor works when storage is blocked. This is
independent of the artwork's Light preview / Dark preview palette switch.
Downloads precede the React/Tailwind guides, package installation is near the end,
and the optional Ko-fi link follows exports without a popup or blocking step.
The public editor is deployed on GitHub Pages; the earlier Sites preview is
a separate build.

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
by clicking its painted area or using the Selected region list. Choosing a different
region from the dropdown opens its settings popover immediately, including tiny
regions; no artwork click or double-click is needed. Choose **Place
origin on artwork**, then click a point, or enter Region X/Y percentages in the point's popover. The pin
shows the nearest painted sample used as the actual inlet. **Use shared origin** removes only that region's override.

Each disconnected visible region of the same paint can use a different origin.
Start and Duration use 0.01-second steps in both the paint panel and regional
popover, on desktop and mobile. Durations may be as short as 0.01 seconds; drafts,
flow/CSS previews and the bundled portable player preserve those values.

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
and native SVG mask coordinates to account for viewport letterboxing. Region
identities and coordinates survive viewport/export-size changes and palette edits.
Changes to geometry or paint grouping can temporarily leave overrides unapplied; their previous configurations are retained. Regions are connected
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

### Local workspace drafts

The editor saves its workspace in IndexedDB in the current browser: cleaned SVG
sources, selected icon/output, palettes, line width, export size, active tabs and
per-icon animation settings. Switching icons restores that icon's animation;
Colors/Fill animation switches pause rendering without discarding settings.
Reload restores the workspace and paused timeline position. Playback frames,
canvases and prepared arrival maps are rebuilt instead of being stored.

A local-draft status reports saving/saved/unavailable. Saves are batched and
serialized, with an extra flush when the page is hidden. Blocked or exhausted
browser storage does not stop editing, and failed/unsupported restores are not
overwritten with the sample defaults. Drafts are local to this browser and site
origin; clearing site data removes them. Exported ZIPs remain the portable backup.

Stroke-width and palette edits no longer invalidate region schedules. Region
identity ignores presentation-only line-width wrappers and paint fallback values;
painted overlap maps edited regions onto rebuilt topology rather than reusing
scan indices. Splits inherit the previous region's overrides. Merged or missing
regions retain unapplied records, shown by a notice, so reverting the edit can
recover their settings. Actual geometry changes keep earlier configurations in
the draft instead of deleting them. New explicit edits take precedence when
matching stored records.
