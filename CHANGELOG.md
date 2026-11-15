# Changelog

## Unreleased

- Parse SVG XML and static CSS instead of deleting the root tag. Preserve root
  rendering properties, normalize comma-separated viewBoxes, namespace internal
  IDs and update local href/paint/ARIA references.
- Materialize supported static CSS with its cascade before changing the tree.
  Preserve SVG text whitespace and reject unsupported input with its filename.
- Add `target` validation: CLI/Node default to portable `external`; complex
  paint-server artwork uses `inline`. The browser API defaults to `inline`.
- Add pixel regression coverage in Chromium, Firefox and WebKit and generation
  dependencies for XML/CSS parsing and selector matching. The React runtime
  component is unchanged. This unreleased change has not been published.


## [2.2.0] - 2026-11-12

- Add the typed `tiny-isprite/browser` entry point for in-memory SVG/CSS generation without Node filesystem or DOM dependencies.
- Share the canonical generation engine between the CLI and browser API, with byte-for-byte color-mode parity coverage. Existing React Icon and CLI APIs remain compatible.
- Build the package when installed from a pinned Git commit through `prepare`; keep lifecycle diagnostics separate from JSON output in packing/compatibility checks.
- Move the editor, animation tools and their browser tests to the separate private tiny-isprite Lab repository. They remain outside the npm package.
- Move the public editor to https://tiny-isprite.com/ on Vercel. Retire GitHub Pages and update package/demo links.
- Keep package compatibility and packed-consumer production coverage separate from Lab CI.

## [2.1.0] - 2026-11-09

- Add clean prepack builds, including regression coverage for stale and obsolete dist files.
- Add GitHub Actions for Node 18/20/22/24 and React 17/18/19 package compatibility, browser tests and audit.
- Add runnable Vite/Next.js examples and packed-consumer production smoke tests with cache, SSR and hydration coverage.
- Correct generated manifest declaration filenames and provide separate ESM/CommonJS component declarations.
- Correct the declared Node minimum to 18, matching the already-required Commander 13 minimum; Node 16 was previously declared but unsupported by the CLI dependency.

- Refresh build-tool dependencies in the lockfile: sucrase 3.35.1 removes glob/minimatch/brace-expansion; update rollup and picomatch to patched versions. Full npm audit reports zero vulnerabilities.

- Generate deterministic content-hashed SVG/CSS assets and an importable typed manifest; retain legacy aliases and old hashed files.
- Add CLI watch and public-path/manifest options. Generation failures now reject and fail the one-shot CLI.
- Add React spriteUrl/version/prefix props and update both SVG href attributes with a keyed use element; preserve legacy inline/external defaults.
- Fix CommonJS exports and the build:sprite script; expose the Node generator subpath.
- Add generator/API/package regression tests and Chromium tests for Vite Fast Refresh and production immutable caching.
- External consumers must pass the generated sprite.url to activate cache-safe updates; existing fixed URLs retain their legacy caching behavior.

## [2.0.1] - 2025-04-29

### Added
- Добавлены тесты для генерации спрайтов
- Улучшена обработка CSS переменных

### Fixed
- Исправлен путь генерации CSS файла
