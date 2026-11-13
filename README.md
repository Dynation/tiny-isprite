# tiny-isprite

[![npm version](https://img.shields.io/npm/v/tiny-isprite)](https://www.npmjs.com/package/tiny-isprite)
[![license](https://img.shields.io/npm/l/tiny-isprite)](LICENSE.md)

**[Live demo & icon animation builder](https://dynation.github.io/tiny-isprite/)**

Generate an SVG sprite from a folder of icons, then render its symbols with React.
Content-hashed filenames give regenerated sprites a new URL, so browsers can cache
assets without keeping an old icon after a rebuild.

- React 17, 18 and 19; JavaScript and TypeScript; ESM and CommonJS component imports.
- CLI and Node.js generator, watch mode, custom paths and symbol prefixes.
- `currentColor`, preserved fills and generated CSS variables.
- Runnable Vite and Next.js examples, with browser tests for production rebuilds.
- A [browser playground](#online-editor) for sprites and standalone icons, plus
  a separate [icon animation builder](#icon-animation-builder) with portable exports.

The npm package stays focused on the sprite generator and React `Icon` component.
The browser editor and exported animation player are separate; installing
`tiny-isprite` does not add an animation runtime to your app.

This README documents the **2.2** release line. For existing projects, see
[Upgrading from 2.0.x](#upgrading-from-20x).

## Quick start

The CLI requires **Node.js 18+**.

```bash
npm install tiny-isprite@^2.2.0
```

Put SVG files in `icons/`. Each filename becomes a symbol name: `star.svg` becomes
`icon-star` by default. Include a `viewBox` in your source SVG:

```svg
<!-- icons/star.svg -->
<svg viewBox="0 0 24 24">
  <path fill="currentColor" d="M12 2l3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1z" />
</svg>
```

Generate the sprite and an importable module containing its URL:

```bash
npx build-sprite ./icons ./public/sprite.svg --manifest ./src/generated/sprite.js
```

Use that URL from a component in `src/`:

```tsx
import { Icon } from 'tiny-isprite';
import sprite from './generated/sprite.js';

export function Favorite() {
  return <Icon name="star" spriteUrl={sprite.url} prefix={sprite.prefix} size={32} />;
}
```

`name` is the filename without `.svg` or the prefix. Supplying `spriteUrl` enables
external mode; you do not also need `external`.

Generation produces files like these:

```text
icons/star.svg
public/sprite.svg                    # Mutable alias for existing integrations
public/sprite.<hash>.svg             # Content-hashed asset
src/generated/sprite.js              # URL, hash, prefix and optional CSS URL
src/generated/sprite.d.ts            # TypeScript declaration
```

The hash is derived from the final SVG bytes. Unchanged output keeps the same URL
and does not rewrite the manifest. Keep the manifest in application source so your
bundler tracks it; keep generated assets outside the icon source directory.

## Development and builds

Add these scripts alongside your framework's existing `dev` and `build` scripts:

```json
{
  "scripts": {
    "sprite": "build-sprite ./icons ./public/sprite.svg --manifest ./src/generated/sprite.js",
    "sprite:watch": "npm run sprite -- --watch",
    "predev": "npm run sprite",
    "prebuild": "npm run sprite"
  }
}
```

Run `npm run dev` in one terminal and `npm run sprite:watch` in another. Watch mode
handles SVG edits, additions, renames and deletions. The imported manifest changes
when the generated URL changes, allowing the bundler to update the application.
Vite React Fast Refresh is covered by a browser test, including state retention.

Run `npm run build` for production. The `prebuild` hook generates the assets before
the framework reads the manifest. Watch mode is a separate process; the package
does not install a Vite or Next.js plugin.

### Base paths and Next.js

The filesystem output and public URL are separate settings. For an application
served under `/demo`, with assets in `public/assets/`, use:

```bash
npx build-sprite ./icons ./public/assets/sprite.svg --manifest ./src/generated/sprite.js --public-path /demo/assets/
```

Match `--public-path` to your deployment, including Vite `base` or Next.js
`basePath`; the generator does not infer either setting. Import the manifest normally
in Next.js. Add `"use client"` to components that use client-side features such as
state, as shown in the [Next.js example](examples/next/app/sprite-demo.jsx).

## Upgrading from 2.0.x

Existing calls remain supported:

```tsx
<Icon name="star" />          // Inline: #icon-star
<Icon name="star" external /> // External: /sprite.svg#icon-star
```

For inline mode, the matching symbol must already exist in the page. The component
does not inject sprite markup.

**External integrations must pass the generated `sprite.url` to receive the new
cache-safe URLs.** The legacy `external` prop still uses `/sprite.svg`. Re-rendering
that fixed URL, changing its fragment or changing a React key cannot reliably
invalidate a browser's cached external SVG document.

The CLI and generator require Node 18+. The old `>=16` package declaration was
inconsistent with the existing Commander 13 dependency's Node 18 minimum.

## React API

```tsx
import Icon, { type IconProps } from 'tiny-isprite';
```

```js
const { Icon } = require('tiny-isprite');
```

| Prop | Type | Default | Purpose |
| --- | --- | --- | --- |
| `name` | `string` | Required | Symbol name without its prefix. |
| `size` | `number` | `24` | SVG width and height. |
| `className` | `string` | — | Class on the outer SVG. |
| `external` | `boolean` | `false` | Use `/sprite.svg` when no `spriteUrl` is supplied. |
| `spriteUrl` | `string` | — | External sprite URL; enables external mode. |
| `prefix` | `string` | `"icon-"` | Symbol ID prefix; use `sprite.prefix` with custom prefixes. |
| `version` | `string \| number` | — | Set the `v` query parameter on an external URL. |

The component writes both `href` and `xlinkHref` and replaces the `<use>` element
when its full reference changes. Icons have `aria-hidden="true"`; give an icon-only
button an accessible label on the button itself.

For integrations that manage their own versioned URL:

```tsx
<Icon name="star" spriteUrl="/sprite.svg?theme=dark" version="release-42" />
// /sprite.svg?theme=dark&v=release-42#icon-star
```

This preserves other query parameters and replaces an existing `v`. Your CDN must
include `v` in its cache key for query versioning to work. Prefer the generated
hashed filename. Use a stable version shared by server and client; timestamps or
random values during render can cause SSR hydration mismatches.

## CLI reference

```text
build-sprite [srcDir] [outputFile] [options]
```

| Argument or option | Default | Purpose |
| --- | --- | --- |
| `srcDir` | `./icons` | Folder of source SVG files; non-recursive. |
| `outputFile` | `./public/sprite.svg` | Mutable alias; hashed SVGs are written beside it. |
| `-x, --prefix <prefix>` | `icon-` | Prefix for every symbol ID. |
| `--manifest <file>` | `<output-stem>.manifest.js` | Generated ES module. Point this into application source. |
| `--public-path <url>` | `/` | Public URL directory for assets. |
| `-w, --watch` | Off | Regenerate on source SVG changes. |
| `-p, --preserve-colored` | Off | Keep original monochrome fills instead of converting them to `currentColor`. |
| `-c, --use-css-vars` | Off | Convert explicit fills/strokes to variables for icons classified as monochrome. |
| `-a, --all` | Off | Convert explicit fills/strokes to variables for all icons. |
| `-m, --minify` | Off | Collapse whitespace in the generated SVG. |

Icons with multiple explicit fill colors are preserved by default. `none`,
`currentColor` and paint-server references such as `url(...)` are left unchanged
by CSS-variable conversion. Supply a four-value `viewBox`; otherwise the generator
falls back to `0 0 24 24`.

One-shot generation errors exit with status 1. Watch mode logs rebuild errors and
retries on the next SVG edit. An empty source folder publishes an empty sprite so
removed icons do not remain in the current output.

## Colors

### currentColor and Tailwind

For a monochrome icon using `currentColor`, set CSS `color` on the SVG or an ancestor:

```css
.favorite-icon { color: #e11d48; }
```

```tsx
<Icon name="star" spriteUrl={sprite.url} className="favorite-icon" />
<Icon name="star" spriteUrl={sprite.url} className="text-rose-600" />
```

The second example assumes Tailwind is configured in your application. A class can
be applied directly to `Icon`; a wrapping element is optional. Paths with preserved
fixed fills retain those colors.

### CSS variables

For example, `icons/badge.svg` containing a rectangle with `fill="#2563eb"` produces
`--badge-fill-1` with `--use-css-vars`. Add the flag to your `sprite` script to keep it
enabled on every rebuild:

```bash
npx build-sprite ./icons ./public/sprite.svg --manifest ./src/generated/sprite.js --use-css-vars
```

Load the generated stylesheet and override its actual variable names:

```tsx
import { Icon } from 'tiny-isprite';
import sprite from './generated/sprite.js';

export function Badge() {
  return <>
    {sprite.cssUrl && <link rel="stylesheet" href={sprite.cssUrl} />}
    <Icon name="badge" spriteUrl={sprite.url} prefix={sprite.prefix} className="badge" />
  </>;
}
```

```css
.badge { --badge-fill-1: #ef4444; }
```

Variable names follow `--<name>-fill-1`, `--<name>-stroke-1`, and so on; `--all` adds
`all-`, for example `--all-badge-fill-1`. The generated symbol prefix is not part of
these variable names. Inspect `icons-vars.css` for the variables your icons produce.

The stylesheet has its own hashed URL in `sprite.cssUrl`, plus an `icons-vars.css`
alias. A color-only edit can update the CSS URL without changing the SVG URL; load
`sprite.cssUrl` to receive that update.

## Production and caching

1. Generate sprites before building the application.
2. Deploy hashed SVG/CSS assets before, or atomically with, the application that
   references them.
3. Retain previous hashed assets for existing tabs, older bundles and rollbacks.

| Resource | Suggested `Cache-Control` |
| --- | --- |
| Hashed SVG/CSS | `public, max-age=31536000, immutable` |
| Mutable aliases or a manifest served directly over HTTP | `no-cache` |

The generator retains old hashed files. Decide how long to keep them when deploying;
a clean checkout alone will not contain assets from earlier releases. It does not
configure your host or purge CDN caches.

Serve external sprites from the same origin as the page. Cross-origin SVG `<use>`
has browser restrictions, even with CORS headers. A CDN can still sit behind your
same-origin asset URLs.

Already-open pages need an application update or reload to receive a new manifest.
The component does not poll for it. Stale HTML, JavaScript or a service worker can
still pin an older application and must be managed by the deployment.

References: [HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching),
[Vite static assets](https://vite.dev/guide/assets.html).

## Node.js API

The generator is an ESM-only Node entry point. It returns the same metadata it
writes to the manifest; failures reject the promise.

```js
import { generateSprite } from 'tiny-isprite/generator';

const sprite = await generateSprite({
  srcDir: './icons',
  outputFile: './public/sprite.svg',
  manifestFile: './src/generated/sprite.js',
  publicPath: '/',
  prefix: 'icon-',
  preserveColored: false,
  useCssVars: false,
  forceAllVars: false,
  minify: false,
});

console.log(sprite.url); // /sprite.<hash>.svg
```

The return type is `{ url, hash, prefix, cssUrl? }`. Generator options and return
values have TypeScript declarations. Unlike the CLI, the Node API defaults its
source folder to `./public/icons`; specify `srcDir` to make the choice explicit.

## Browser generation API

Use `tiny-isprite/browser` to generate sprite and CSS strings without Node.js
filesystem imports, manifests or a DOM. This entry uses the same engine as the CLI.

```js
import { buildSpriteContent } from 'tiny-isprite/browser';

const { sprite, css } = await buildSpriteContent({
  icons: [{ name: 'heart.svg', content: trustedSvgMarkup }],
  prefix: 'icon-',
  useCssVars: true,
  minify: true,
});
```

`icons` is an array of `{ name, content }`. Supported flags are `preserveColored`,
`useCssVars`, `forceAllVars`, `minify` and `prefix`, with the same color semantics as
the CLI. The result contains `sprite` and optional `css` strings. The caller owns
input sanitization, hashing, filenames and delivery; this API does not sanitize
untrusted SVG. TypeScript declarations are included.

## Online editor

**[Open tiny-isprite Lab](https://dynation.github.io/tiny-isprite/)** to recolor SVGs,
create sprites or standalone React/SVG icons, and export optional fill animations.
No install or account is needed; uploaded artwork stays in the browser.

The editor is maintained and deployed separately from this package. Editor UI,
animation playback and its export tools are not part of the npm Icon API.
The CLI, React component and browser generation API remain in this repository.

## Examples

The [Vite](examples/vite) and [Next.js](examples/next) examples use this checkout as a
local dependency. Both demonstrate the `/demo` base path and `demo-` symbol prefix.
From the repository root:

```bash
npm ci
npm run build
cd examples/vite # Or: cd examples/next
npm install
npm run build
npm start
```

Open `/demo/` at the server address printed by the framework. For development, run
`npm run dev` and `npm run sprite:watch` in separate terminals inside the example.
Edit `icons/star.svg`, not the generated files.

The Next.js example requires Node 20.9+ and is tested with Next.js 16.4.5/Turbopack.
The Vite example is tested with Vite 6.4.6. Example cache headers are provided for
local preview/Next.js; configure equivalent rules on your actual host.

## Contributing and release checks

Use Node 22+ for the full release suite:

```bash
npm ci
npx playwright install chromium
npm run check:release
```

Individual checks:

| Command | Coverage |
| --- | --- |
| `npm run typecheck` | Library source types. |
| `npm test` | Generator, React/API, typed manifests, packed package and stale `dist` regression tests. |
| `npm run test:compat` | Packed package with React 17/18/19 on the current Node; ESM, CommonJS, SSR, CLI and TypeScript. |
| `npm run test:browser` | Vite Fast Refresh with React state retention and an immutable-cache regression. |
| `npm run test:production` | Packed consumers, two Vite/Next.js production builds, visible SVG updates with warm cache, retained assets, Next.js SSR/hydration, and consumer audits. |
| `npm audit` | The repository dependency tree. |

[GitHub Actions](.github/workflows/ci.yml) defines the Node 18/20/22/24 compatibility
matrix and production browser checks. The same 12 Node/React combinations have been
checked locally. These are local production-server tests, not proof of a live CDN,
Vercel deployment or physical-device coverage.

Screenshots, production logs, compatibility results and the packed archive go into
`.release-artifacts/`. The workflow uploads production evidence; it does not deploy
or publish the package.

`npm pack` and `npm publish` trigger a clean rebuild through `prepack`. This prevents
stale or obsolete files in `dist` from entering the archive. Run release checks
first: the packaging hook builds the library but does not run browser tests.

See [CHANGELOG.md](CHANGELOG.md) for release details.

## License

[MIT](LICENSE.md) · [Dina / Dynation](https://github.com/Dynation)

*No human neuroslop. Just tiny sprites.*
