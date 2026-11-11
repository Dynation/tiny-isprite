import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDistanceField,
  trackProgress,
  radialCss,
} from "../src/lib/fill-animation.js";

test("flow travels around a hole rather than jumping straight across empty pixels", () => {
  const width = 7,
    labels = new Int32Array(49).fill(-1);
  for (let y = 1; y <= 5; y++) {
    labels[y * width + 1] = 0;
    labels[y * width + 5] = 0;
  }
  for (let x = 1; x <= 5; x++) labels[5 * width + x] = 0;
  const { field, components } = buildDistanceField(
    labels,
    width,
    7,
    1 / 6,
    1 / 6,
  );
  assert.equal(components.length, 1);
  assert.equal(components[0].seed, 8);
  assert.ok(components[0].maximum >= 10);
  assert.equal(field[3 * width + 3], -1);
  assert.equal(field[1 * width + 5], 1);
  assert.equal(field[8], 0);
});
test("separate islands and adjacent paint groups receive independent inlet seeds", () => {
  const labels = Int32Array.from([0, 0, 1, 1, -1, 0]);
  const result = buildDistanceField(labels, 6, 1, 0, 0);
  assert.equal(result.components.length, 3);
  assert.deepEqual(
    result.components.map((c) => c.group),
    [0, 1, 0],
  );
  for (const component of result.components)
    assert.equal(result.field[component.seed], 0);
});
test("paint timelines overlap and support incomplete final fills", () => {
  const first = { start: 0, duration: 2, end: 100 };
  const second = { start: 0.8, duration: 1, end: 60 };
  assert.equal(trackProgress(0.5, second), 0);
  assert.equal(trackProgress(1, first), 0.5);
  assert.ok(Math.abs(trackProgress(1, second) - 0.12) < 0.0001);
  assert.equal(trackProgress(10, second), 0.6);
});
test("CSS-only export names its radial scope and respects reduced motion", () => {
  const css = radialCss(20, 70, 2.4);
  assert.match(css, /circle\(0% at 20% 70%\)/);
  assert.match(css, /fill-reveal 2.4s/);
  assert.match(css, /prefers-reduced-motion/);
});

test("same-paint islands accept independent origins without changing other regions", () => {
  const labels = Int32Array.from([0, 0, 0, -1, 0, 0, 0]);
  const base = buildDistanceField(labels, 7, 1, 0, 0, {});
  const custom = buildDistanceField(labels, 7, 1, 0, 0, { 0: { x: 1, y: 0 } });
  assert.deepEqual([...custom.regionMap], [0, 0, 0, -1, 1, 1, 1]);
  assert.equal(base.components[0].seed, 0);
  assert.equal(custom.components[0].seed, 2);
  assert.equal(custom.field[2], 0);
  assert.equal(custom.field[0], 1);
  assert.equal(custom.components[1].seed, base.components[1].seed);
  assert.deepEqual([...custom.field.slice(4)], [...base.field.slice(4)]);
  assert.deepEqual(
    [...custom.radialField.slice(4)],
    [...base.radialField.slice(4)],
  );
  assert.ok(custom.radialField[2] > base.radialField[2]);
  assert.equal(custom.components[0].customOrigin, true);
  assert.equal(custom.components[1].customOrigin, false);
});

test("region timing compiles independent schedules of the same color without mutating paint tracks", async () => {
  const { buildRegionTiming } = await import("../src/lib/fill-animation.js");
  const labels = Int32Array.from([0, 0, -1, 0, 0]);
  const prepared = { labels, ...buildDistanceField(labels, 5, 1, 0, 0, {}) };
  const tracks = [{ name: "--red", start: 0, duration: 2, end: 100 }];
  const compiled = buildRegionTiming(prepared, tracks, {
    0: { start: 0.5, duration: 1, end: 60 },
  });
  assert.deepEqual([...compiled.labels], [1, 1, -1, 0, 0]);
  assert.deepEqual(compiled.regionTracks, [1, 0]);
  assert.equal(compiled.tracks[1].name, "--red");
  assert.equal(trackProgress(0.25, compiled.tracks[1]), 0);
  assert.equal(trackProgress(0.25, compiled.tracks[0]), 0.125);
  assert.equal(trackProgress(5, compiled.tracks[1]), 0.6);
  assert.equal(tracks[0].end, 100);
  const all = buildRegionTiming(
    prepared,
    [{ ...tracks[0], start: 30, duration: 30 }],
    { 0: { start: 0, duration: 1 }, 1: { start: 0, duration: 2 } },
  );
  assert.equal(Math.max(...all.tracks.map((t) => t.start + t.duration)), 2);
  assert.equal(buildRegionTiming(prepared, tracks, {}).labels, labels);
  const huge = {
    labels,
    components: Array.from({ length: 4096 }, (_, id) => ({ id, group: 0 })),
  };
  const overrides = Object.fromEntries(
    huge.components.map((c) => [c.id, { start: 1 }]),
  );
  assert.match(buildRegionTiming(huge, tracks, overrides).error, /4095/);
});
