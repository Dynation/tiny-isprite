import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDistanceField } from "../src/lib/fill-animation.js";
import {
  captureTopology,
  resolveRegions,
  emptyRegionState,
} from "../src/lib/animation-state.js";
function analysis(points) {
  const labels = new Int32Array(27).fill(-1);
  for (const p of points) labels[p] = 0;
  return { width: 9, height: 3, ...buildDistanceField(labels, 9, 3, 0, 0, {}) };
}
const paints = ["--red"];
test("region schedules follow overlap when stroke edits reorder scan indices", () => {
  const before = analysis([9, 10, 16, 17]),
    after = analysis([4, 9, 10, 16, 17]);
  const config = {
    ...emptyRegionState,
    key: "shape",
    topology: captureTopology(before, paints),
    selected: 1,
    origins: { 1: { x: 0.9, y: 0.5 } },
    timings: { 0: { start: 0.4 }, 1: { start: 1.3, end: 65 } },
  };
  const next = resolveRegions(config, after, paints, "shape");
  assert.equal(next.timings[0], undefined);
  assert.equal(next.timings[1].start, 0.4);
  assert.equal(next.timings[2].start, 1.3);
  assert.equal(next.origins[2].x, 0.9);
  assert.equal(next.selected, 2);
  assert.equal(config.timings[1].start, 1.3);
});
test("merged or hidden regions retain edits and recover when the original regions return", () => {
  const before = analysis([9, 10, 16, 17]),
    merged = analysis([9, 10, 11, 12, 13, 14, 15, 16, 17]);
  const config = {
    ...emptyRegionState,
    key: "shape",
    topology: captureTopology(before, paints),
    timings: { 0: { start: 0.4 }, 1: { start: 1.3 } },
  };
  const next = resolveRegions(config, merged, paints, "shape");
  assert.deepEqual(next.timings, {});
  assert.equal(next.retained.length, 2);
  const restored = resolveRegions(next, before, paints, "shape");
  assert.equal(restored.timings[0].start, 0.4);
  assert.equal(restored.timings[1].start, 1.3);
  assert.equal(restored.retained.length, 0);
  const rotated = resolveRegions(config, merged, paints, "rotated");
  assert.equal(rotated.retained.length, 2);
  const returned = resolveRegions(rotated, before, paints, "shape");
  assert.equal(returned.timings[0].start, 0.4);
});

test("draft saving rejects oversized UTF-8 sources before replacing a saved record", async () => {
  const { saveDraft } = await import("../src/lib/local-draft.js");
  await assert.rejects(
    saveDraft({ icons: [{ content: "é".repeat(1024 * 1024 + 1) }] }),
    /restore limit/,
  );
});
