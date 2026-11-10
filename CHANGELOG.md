# Changelog

## [2.2.0] - 2026-11-10

- Add a browser-only sprite playground with cleaned SVG uploads, React previews, generator settings and ZIP export.
- Share filesystem-free generation between the CLI and playground, with byte-for-byte export parity checks.
- Add production browser coverage for uploads, local gradients, unsafe content, drag-and-drop, duplicate names, limits and mobile layout.
- Publish the public playground at https://dynation.github.io/tiny-isprite/ and link it from the README and package homepage.
- Add standalone SVG/React exports, editable icon palettes and Tailwind v4 light/dark theme examples.
- Add a separate browser icon animation builder with shape-following flow, radial reveal, per-paint timing and partial fills.
- Export portable animation ZIPs with prepared maps, a standalone JavaScript player, React wrapper, independent examples and an integration guide with a copyable AI prompt.
- Keep the editor and animation player outside the npm package; the existing generator and React Icon API remain compatible.

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
