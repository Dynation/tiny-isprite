// Match edited regions by painted overlap, never by their incidental scan index.
export const emptyRegionState = {
  origins: {},
  timings: {},
  selected: 0,
  placing: false,
  editing: false,
  retained: [],
};
export function captureTopology(analysis, paints) {
  return {
    width: analysis.width,
    height: analysis.height,
    map: analysis.regionMap,
    groups: analysis.components.map(
      (region) => paints[region.group] || "all-paint",
    ),
  };
}
function recordsFor(config) {
  if (!config.topology) return [];
  const ids = new Set([
    ...Object.keys(config.origins || {}),
    ...Object.keys(config.timings || {}),
  ]);
  return [...ids].map((id) => ({
    id: Number(id),
    key: config.key,
    topology: config.topology,
    origin: config.origins[id],
    timing: config.timings[id],
  }));
}
export function resolveRegions(config, analysis, paints, key) {
  const base =
    config.key === key
      ? config
      : {
          ...emptyRegionState,
          key,
          retained: [...recordsFor(config), ...(config.retained || [])],
        };
  return reconcileRegions(base, analysis, paints);
}
export function reconcileRegions(config, analysis, paints) {
  if (!analysis) return config;
  const topology = captureTopology(analysis, paints);
  if (config.topology?.map === topology.map && !config.retained?.length)
    return config;
  const cache = new Map();
  function matches(source) {
    if (cache.has(source)) return cache.get(source);
    const owners = Array.from(
      { length: analysis.components.length },
      () => new Set(),
    );
    for (let p = 0; p < topology.map.length; p++) {
      const target = topology.map[p];
      if (target < 0) continue;
      const px = Math.min(
        source.width - 1,
        Math.floor(((p % topology.width) * source.width) / topology.width),
      );
      const py = Math.min(
        source.height - 1,
        Math.floor(
          (Math.floor(p / topology.width) * source.height) / topology.height,
        ),
      );
      const old = source.map[py * source.width + px];
      if (old >= 0 && source.groups[old] === topology.groups[target])
        owners[target].add(old);
    }
    const result = new Map();
    owners.forEach((ids, target) => {
      // Merged regions cannot silently inherit conflicting schedules.
      if (ids.size === 1) {
        const old = [...ids][0];
        const list = result.get(old) || [];
        list.push(target);
        result.set(old, list);
      }
    });
    cache.set(source, result);
    return result;
  }
  const origins = {},
    timings = {},
    retained = [],
    occupied = new Set();
  const records = recordsFor(config);
  // Current explicit edits win over older, temporarily unmatchable records.
  for (const record of [...records, ...(config.retained || [])]) {
    if (record.key && record.key !== config.key) {
      retained.push(record);
      continue;
    }
    const targets = matches(record.topology).get(record.id) || [];
    if (!targets.length) {
      retained.push(record);
      continue;
    }
    for (const id of targets) {
      if (occupied.has(id)) continue;
      if (record.origin) origins[id] = record.origin;
      if (record.timing) timings[id] = record.timing;
      occupied.add(id);
    }
  }
  return {
    ...config,
    origins,
    timings,
    topology,
    retained,
    selected: config.topology
      ? (matches(config.topology).get(config.selected)?.[0] ?? 0)
      : 0,
  };
}
