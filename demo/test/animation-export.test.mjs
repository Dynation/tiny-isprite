import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import {
  encodeAnimation,
  createAnimationBundle,
} from "../src/lib/animation-export.js";
import { decodeAnimation } from "../src/lib/animation-player.js";

function fixture(mode = "flow") {
  return encodeAnimation({
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120" viewBox="0 0 400 120"><path fill="red" d="M0 0h400v120z"/></svg>',
    prepared: {
      width: 2,
      height: 2,
      labels: Int32Array.from([-1, 0, 1, 0]),
      field: Float32Array.from([-1, 0, 0.5, 1]),
    },
    tracks: [
      { name: "red", start: 0, duration: 2, end: 100 },
      { name: "blue", start: 0.5, duration: 1, end: 60 },
    ],
    mode,
    originX: 50,
    originY: 50,
    palettes: { light: { color: "#123456" }, dark: { color: "#eeeeee" } },
    name: "logo",
    initialProgress: 45,
  });
}
test("prepared export round-trips paint/arrival data, overlap, partial ends and letterboxing", () => {
  const data = fixture(),
    decoded = decodeAnimation(data);
  assert.deepEqual([...decoded.labels], [0, 1, 2, 1]);
  assert.equal(decoded.arrivals[0], 65535);
  assert.ok(Math.abs(decoded.arrivals[2] / 65534 - 0.5) < 1 / 65534);
  assert.equal(decoded.duration, 2);
  assert.equal(data.tracks[1].end, 60);
  assert.equal(data.initialProgress, 45);
  assert.deepEqual(data.bounds, [0, -140, 400, 400]);
});
test("malformed and incompatible portable data fails before mounting a player", () => {
  const valid = fixture();
  for (const patch of [
    { schemaVersion: 2 },
    { map: { ...valid.map, width: 0 } },
    { map: { ...valid.map, bytes: "AAAA" } },
    { tracks: [{ start: -1, duration: 2, end: 100 }] },
    { bounds: [0, 0, -1, 20] },
  ])
    assert.throws(() => decodeAnimation({ ...valid, ...patch }));
});
test("animation bundle includes standalone runtime, data, artwork, React and consumer example", async () => {
  const data = fixture();
  const playerSource = await readFile(
    new URL("../src/lib/animation-player.js", import.meta.url),
    "utf8",
  );
  const reactSource = await readFile(
    new URL("../src/lib/animation-react.jsx", import.meta.url),
    "utf8",
  );
  const exampleHtml = await readFile(
    new URL("../src/lib/animation-example.html", import.meta.url),
    "utf8",
  );
  const zip = unzipSync(
    createAnimationBundle(data, {
      playerSource,
      reactSource,
      exampleHtml,
      license: "MIT test license",
    }),
  );
  for (const name of [
    "player.js",
    "animation-data.js",
    "AnimatedIcon.jsx",
    "artwork.svg",
    "index.html",
    "react-example.jsx",
    "README.md",
    "AI-PROMPT.txt",
    "LICENSE.txt",
  ])
    assert.ok(zip[name], name);
  assert.doesNotMatch(
    playerSource,
    /\bimport\s|prepareFillField|buildDistanceField|fetch\(/,
  );
  assert.match(strFromU8(zip["animation-data.js"]), /u16le-paint-arrival-v1/);
  assert.match(strFromU8(zip["README.md"]), /file:\/\//);
  assert.equal(strFromU8(zip["artwork.svg"]), data.svg);
});

test("radial exports store geometric arrival values instead of reusing the flow field", () => {
  const flow = decodeAnimation(fixture("flow"));
  const radial = decodeAnimation(fixture("radial"));
  assert.equal(flow.arrivals[1], 0);
  assert.ok(Math.abs(radial.arrivals[1] / 65534 - Math.SQRT1_2) < 1 / 65534);
});

test("independent region arrivals survive portable flow and radial exports", async () => {
  const { buildDistanceField } = await import("../src/lib/fill-animation.js");
  const labels = Int32Array.from([0, 0, 0, -1, 0, 0, 0]);
  const prepared = {
    width: 7,
    height: 1,
    labels,
    ...buildDistanceField(labels, 7, 1, 0, 0, { 0: { x: 1 / 3, y: 0 } }),
  };
  for (const mode of ["flow", "radial"]) {
    const data = encodeAnimation({
      svg: '<svg width="700" height="100" viewBox="0 0 7 1"><path fill="red" d="M0 0h3v1H0zM4 0h3v1H4z"/></svg>',
      prepared,
      tracks: [{ name: "red", start: 0, duration: 2, end: 100 }],
      mode,
      originX: 0,
      originY: 0,
    });
    const decoded = decodeAnimation(data),
      field = mode === "radial" ? prepared.radialField : prepared.field;
    for (const p of [0, 1, 2, 4, 5, 6])
      assert.ok(Math.abs(decoded.arrivals[p] / 65534 - field[p]) < 1 / 65534);
    assert.equal(data.regions.length, 2);
    assert.equal(data.regions[0].customOrigin, true);
    assert.equal(data.regions[1].customOrigin, false);
    assert.deepEqual([...decoded.labels], [1, 1, 1, 0, 1, 1, 1]);
  }
});
