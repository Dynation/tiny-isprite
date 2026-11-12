import { test } from "node:test";
import assert from "node:assert/strict";
import {
  demoAnimations,
  demoAnimationStates,
} from "../src/lib/demo-animations.js";
import { featuredSamples, samples } from "../src/samples.js";

test("six authored examples have unique sources and valid compact regional topology", () => {
  assert.deepEqual(
    featuredSamples.map((s) => s.name),
    [
      "orbit",
      "ribbon",
      "check-circle",
      "code",
      "sun",
      "photograph-svgrepo-com",
    ],
  );
  assert.equal(new Set(samples.map((s) => s.name)).size, samples.length);
  const states = demoAnimationStates();
  for (const preset of demoAnimations) {
    assert.match(preset.sourceSha256, /^[a-f0-9]{64}$/);
    assert.ok(!preset.content.includes("var("));
    assert.equal(states[preset.name].enabled, true);
    if (!preset.topology) continue;
    const topology = states[preset.name].regionConfig.topology;
    assert.equal(topology.map.length, topology.width * topology.height);
    assert.equal(topology.groups.length, preset.regions.length);
    assert.ok(
      topology.map.every((id) => id >= -1 && id < preset.regions.length),
    );
  }
});
test("fresh preset states are isolated from edited drafts", () => {
  const first = demoAnimationStates(),
    second = demoAnimationStates({ autoPlay: false });
  first.orbit.settings["--all-orbit-stroke-1"].start = 29;
  first.orbit.regionConfig.topology.map.fill(-1);
  assert.notEqual(second.orbit.settings["--all-orbit-stroke-1"].start, 29);
  assert.ok(second.orbit.regionConfig.topology.map.some((id) => id >= 0));
  assert.equal(second.orbit.autoPlay, false);
});
