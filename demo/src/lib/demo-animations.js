import presets from "../data/demo-animations.json" with { type: "json" };

export const demoAnimations = presets;
// Only editable artwork and authoring settings are imported. ZIP players and
// executable modules are never evaluated, and arrival maps are rebuilt locally.
export function demoAnimationStates({ autoPlay = true } = {}) {
  return Object.fromEntries(
    presets.map((preset) => {
      const settings = {};
      for (const track of preset.tracks)
        settings[track.name] ??= {
          start: track.start,
          duration: track.duration,
          end: track.end,
        };
      const origins = {},
        timings = {};
      for (const region of preset.regions || []) {
        if (region.customOrigin)
          origins[region.id] = { x: region.x / 100, y: region.y / 100 };
        const track = preset.tracks[region.track],
          base = settings[track.name];
        if (
          ["start", "duration", "end"].some((key) => track[key] !== base[key])
        )
          timings[region.id] = {
            start: track.start,
            duration: track.duration,
            end: track.end,
          };
      }
      let topology;
      if (preset.topology) {
        const { width, height, groups, rle } = preset.topology;
        const map = new Int32Array(width * height);
        let offset = 0;
        for (let i = 0; i < rle.length; i += 2) {
          map.fill(rle[i], offset, offset + rle[i + 1]);
          offset += rle[i + 1];
        }
        if (offset !== map.length)
          throw new Error("Invalid demo animation topology.");
        topology = { width, height, groups: [...groups], map };
      }
      return [
        preset.name,
        {
          enabled: true,
          mode: preset.mode,
          x: preset.origin.x,
          y: preset.origin.y,
          settings,
          progress: 100,
          autoPlay,
          regionMode: !!topology,
          regionConfig: {
            origins,
            timings,
            selected: 0,
            placing: false,
            editing: false,
            retained: [],
            ...(topology ? { topology, needsGeometryKey: true } : {}),
          },
        },
      ];
    }),
  );
}
export function demoDarkPalettes() {
  return Object.fromEntries(
    presets.map((p) => [p.name, { ...p.palettes.dark }]),
  );
}
