const { test } = require('node:test');
const assert = require('node:assert/strict');
const { source, options, bounds, rectangle, feature } = require('./fixtures.cjs');
require('../landcover.js');
const L = TopoLandcover;
const forest = (id = 1, ring = rectangle(0, 0, 0.001, 0.002)) => feature(id, ring, { natural: 'wood' });

test('land-cover tags, precedence, cell centers and rectangular grids', () => {
  // The order IS the precedence: classify() keeps the lowest code where polygons overlap.
  assert.deepEqual(L.CATEGORIES, ['water', 'snow', 'forest', 'grass', 'other']);
  assert.equal(L.OTHER, L.CODE.other);
  assert.ok(L.CODE.water < L.CODE.snow && L.CODE.snow < L.CODE.forest && L.CODE.forest < L.CODE.grass);
  assert.equal(L.category({ natural: 'wood' }), L.CODE.forest);
  assert.equal(L.category({ landuse: 'forest' }), L.CODE.forest);
  for (const landuse of ['grass', 'meadow', 'farmland', 'orchard', 'vineyard', 'allotments']) assert.equal(L.category({ landuse }), L.CODE.grass);
  for (const natural of ['grassland', 'scrub', 'heath']) assert.equal(L.category({ natural }), L.CODE.grass);
  for (const natural of ['glacier', 'snowfield']) assert.equal(L.category({ natural }), L.CODE.snow);
  assert.equal(L.category({ landuse: 'winter_sports' }), L.OTHER);   // a ski boundary is not snow
  assert.equal(L.category({ leisure: 'park' }), L.OTHER);
  const [f, g, o] = [L.CODE.forest, L.CODE.grass, L.OTHER];
  const a = forest(), b = feature(2, rectangle(0, 0, 0.002, 0.002), { landuse: 'farmland' });
  for (const elements of [[a, b], [b, a]]) assert.deepEqual([...L.classify(L.normalize(elements), bounds, 4, 2)], [f, f, g, g, f, f, g, g]);
  assert.deepEqual([...L.classify(L.normalize([]), bounds, 3, 1)], [o, o, o]);
  // A glacier outranks the farmland it overlaps, whichever order they arrive in.
  const ice = feature(3, rectangle(0, 0, 0.001, 0.002), { natural: 'glacier' });
  for (const elements of [[ice, b], [b, ice]]) assert.deepEqual([...L.classify(L.normalize(elements), bounds, 4, 2)],
    [L.CODE.snow, L.CODE.snow, g, g, L.CODE.snow, L.CODE.snow, g, g]);
});

test('multipolygons stitch member ways, keep holes, deduplicate and report malformed rings', () => {
  const outside = forest(10, rectangle(0, 0, 0.002, 0.002));
  const hole = forest(11, rectangle(0.0005, 0.0005, 0.0015, 0.0015));
  const relation = { type: 'relation', id: 9, tags: { type: 'multipolygon', natural: 'wood' }, members: [
    { type: 'way', ref: 10, role: 'outer', geometry: outside.geometry.slice(0, 3) },
    { type: 'way', ref: 12, role: 'outer', geometry: outside.geometry.slice(2).reverse() },
    { type: 'way', ref: 11, role: 'inner', geometry: hole.geometry },
  ] };
  const broken = forest(13); broken.geometry.pop();
  const data = L.normalize([outside, relation, broken]);
  assert.equal(data.features.length, 1); assert.equal(data.invalid, 1);
  const [f, g, o] = [L.CODE.forest, L.CODE.grass, L.OTHER];
  // An untagged hole stays a hole.
  assert.deepEqual([...L.classify(data, bounds, 4, 4)], [f, f, f, f, f, o, o, f, f, o, o, f, f, f, f, f]);

  /* A clearing carrying its own tag paints itself. The relation punches it out, and OSM's
     standard idiom is for that inner way to say what the clearing actually is -- consuming
     it left the ground painted by nobody, a hole in the middle of a wood. */
  const clearing = feature(11, rectangle(0.0005, 0.0005, 0.0015, 0.0015), { landuse: 'meadow' });
  const cleared = L.normalize([outside, relation, clearing]);
  assert.deepEqual(cleared.features.map(x => x.id).sort(), ['relation/9', 'way/11']);
  assert.deepEqual([...L.classify(cleared, bounds, 4, 4)], [f, f, f, f, f, g, g, f, f, g, g, f, f, f, f, f]);

  /* A hole that cannot be stitched costs the hole, not the forest around it -- the same
     tolerance buildings.js gives its own orphan holes. */
  const invalidRelation = { ...relation, members: [...relation.members, { type: 'way', ref: 99, role: 'inner' }] };
  const fallback = L.normalize([invalidRelation, outside]);
  assert.equal(fallback.invalid, 1);
  assert.equal(fallback.features[0].id, 'relation/9');
  assert.equal(fallback.features.length, 1);   // way/10 is still consumed as its outer ring
});

test('land-cover requests skip disabled mode, cache successes and empty results, retry failures', async () => {
  let calls = 0;
  const response = elements => async (_url, init) => {
    calls++; assert.ok(init.signal);
    const body = decodeURIComponent(init.body);
    // /landuse/ is also what the browser fixture routes on to tell this apart from water.
    assert.match(body, /landuse/); assert.match(body, /glacier/);
    return { ok: true, json: async () => ({ elements }) };
  };
  const b = [[1, 1], [1.001, 1.001]];
  assert.equal((await L.fetchLandcover(b, { retryMs: 0, enabled: false, fetcher: response([]) })).status, 'off');
  assert.equal(calls, 0);
  const first = await L.fetchLandcover(b, { retryMs: 0, fetcher: response([]) });
  assert.equal(first.status, 'empty'); assert.equal(await L.fetchLandcover(b, { retryMs: 0, fetcher: response([]) }), first); assert.equal(calls, 1);
  const b2 = [[2, 2], [2.001, 2.001]];
  await assert.rejects(L.fetchLandcover(b2, { retryMs: 0, fetcher: async () => ({ ok: true, json: async () => ({ remark: 'timeout', elements: [] }) }) }), /errLandcoverFetch/);
  await assert.rejects(L.fetchLandcover(b2, { retryMs: 0, fetcher: async () => { throw new Error('offline'); } }), /errLandcoverFetch/);
  assert.equal((await L.fetchLandcover(b2, { retryMs: 0, fetcher: response([forest()]) })).status, 'ok');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(L.fetchLandcover(b, { retryMs: 0, signal: controller.signal, fetcher: response([]) }), { name: 'AbortError' });
  const pending = new AbortController();
  await assert.rejects(L.fetchLandcover([[3, 3], [3.001, 3.001]], { retryMs: 0, signal: pending.signal, fetcher: async () => {
    pending.abort(); return { ok: true, json: async () => ({ elements: [] }) };
  } }), { name: 'AbortError' });
});

test('area, feature and vertex budgets reject oversized data', async () => {
  // ~49,000 km2: past the ceiling. A 1x1 degree box is ~12,300 km2 and now goes through.
  await assert.rejects(L.fetchLandcover([[0, 0], [2, 2]], { retryMs: 0, fetcher: () => { throw new Error('must not fetch'); } }), /errLandcoverArea/);
  // Wrapped bounds measure as almost no width, so the area guard alone would pass them.
  await assert.rejects(L.fetchLandcover([[0, 170], [1, -170]], { retryMs: 0, fetcher: () => { throw new Error('must not fetch'); } }), /errLandcoverArea/);
  assert.throws(() => L.normalize(Array.from({ length: L.LIMIT + 1 }, (_, i) => forest(i))), /errLandcoverLimit/);
  assert.throws(() => L.normalize([{ ...forest(), geometry: Array(L.MAX_VERTICES + 1).fill({ lon: 0, lat: 0 }) }]), /errLandcoverLimit/);
});

async function build(overrides = {}, srcOverrides = {}, elements) {
  const { fuseCity } = await import('../geometry-city.mjs');
  const { buildLandcover } = await import('../geometry-landcover.mjs');
  const src = source({ samples: 16, slope: 4, water: true, ...srcOverrides });
  src.landcover = L.normalize(elements || [forest(), feature(2, rectangle(0.001, 0, 0.002, 0.002), { landuse: 'farmland' })]);
  const model = TopoGeometry.buildGeometry(src, options({ colorMode: 'landcover', ...overrides }));
  const terrain = model.pieces.map(p => p.pos);
  await fuseCity(model);
  return buildLandcover(model, terrain);
}

test('colored surfaces reconstruct terrain and buildings without overlap across routes and shapes', async () => {
  const { kernel, fromSoup, exportSolids } = await import('../geometry-city.mjs'), api = await kernel();
  const scenarios = [
    {}, { flattenWater: true }, { nx: 2, ny: 2 }, { frameStyle: 'circle' }, { frameStyle: 'hex' },
    { waterEnabled: false }, { baseMM: 1 }, { snowLineM: 13 }, { snowLineM: 13, nx: 2, ny: 2 },
    { landGrowCells: 2 }, { landGrowCells: 3, snowLineM: 13, nx: 2, ny: 2 },
    ...['inlay', 'emboss', 'engrave', 'through'].flatMap(routeMode => ['rounded', 'flat'].map(routeProfile => ({
      routeMode, routeProfile, nx: 2, routePath: [[0, 0.001], [0.002, 0.001]],
    }))),
  ];
  for (const opts of scenarios) {
    const model = await build(opts);
    assert.equal(await exportSolids(model), model.materialMeshes);
    for (const piece of model.pieces) {
      if (!piece.pos.length) continue;
      const original = fromSoup(api, piece.pos), owned = [original];
      try {
        const solids = [];
        for (const [category, mesh] of Object.entries(model.materialMeshes[piece.id].materials)) {
          if (!mesh.pos.length) continue;
          const solid = fromSoup(api, mesh.pos); owned.push(solid); solids.push(solid);
          assert.ok(solid.volume() > 0, JSON.stringify(opts));
          if (category !== 'other') {
            const floor = model.landcoverInfo.skinFloorZ;
            for (let k = 2; k < mesh.pos.length; k += 3) assert.ok(mesh.pos[k] >= floor - 1e-5);
            if (model.citySolids?.[piece.id]) {
              const buildings = fromSoup(api, model.citySolids[piece.id]), intersection = solid.intersect(buildings);
              assert.ok(intersection.volume() < 1e-4); intersection.delete(); buildings.delete();
            }
          }
        }
        const tolerance = Math.max(1e-4, original.volume() * 1e-5);
        for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) {
          const overlap = solids[i].intersect(solids[j]); assert.ok(overlap.volume() < tolerance, `${JSON.stringify(opts)} pair ${i}/${j}: ${overlap.volume()} vs ${tolerance}`); overlap.delete();
        }
        const union = api.Manifold.union(solids); owned.push(union);
        const missing = original.subtract(union), extra = union.subtract(original); owned.push(missing, extra);
        assert.ok(missing.volume() < tolerance && extra.volume() < tolerance, `${JSON.stringify(opts)} piece ${piece.id}: missing ${missing.volume()}, extra ${extra.volume()}, tolerance ${tolerance}, sum ${solids.reduce((n, s) => n + s.volume(), 0)}, original ${original.volume()}`);
      } finally { owned.reverse().forEach(s => s.delete()); }
    }
  }
});

test('rectangular grids, empty categories and thin diagonal patches remain printable', async () => {
  for (const elements of [[], [forest(1, rectangle(0, 0, 0.0003, 0.001)), forest(2, rectangle(0.0003, 0.001, 0.0006, 0.002))]]) {
    const model = await build({ includeBuildings: false, waterEnabled: false }, { samples: 20, samplesY: 10 }, elements);
    assert.deepEqual(Object.keys(model.materialMeshes[0].materials), L.CATEGORIES);
    assert.equal(model.materialMeshes[0].materials.water.pos.length, 0);
    if (!elements.length) {
      assert.equal(model.landcoverInfo.status, 'empty');
      assert.equal(model.materialMeshes[0].materials.forest.pos.length, 0);
      assert.equal(model.landcoverInfo.vegetationPercent, 0);
    }
  }
});

/* The fixture ramps 10 m to 14 m across x over 16 columns, so cell i sits at
   10 + (i + 0.5) / 4 m and a 13 m line takes the eastern quarter, i >= 12. */
test('the snow line claims cells by altitude, defers to water, and costs nothing when off', async () => {
  const above = await build({ snowLineM: 13 });
  assert.ok(above.materialMeshes[0].materials.snow.pos.length > 0);
  assert.ok(above.landcoverInfo.hasSnow);
  assert.equal(above.landcoverInfo.snowLineM, 13);
  assert.ok(Math.abs(above.landcoverInfo.snowPercent - 25) < 0.01, `snow ${above.landcoverInfo.snowPercent}`);
  // Snow overwrites mapped vegetation rather than letting it veto: an OSM treeline
  // drawn across the line would otherwise leave the cap moth-eaten.
  assert.ok(above.landcoverInfo.vegetationPercent < 75.01);

  for (const opts of [{}, { snowLineM: null }, { snowLineM: 100 }]) {
    const off = await build(opts);
    assert.deepEqual(Object.keys(off.materialMeshes[0].materials), L.CATEGORIES);
    assert.equal(off.materialMeshes[0].materials.snow.pos.length, 0, JSON.stringify(opts));
    assert.equal(off.landcoverInfo.hasSnow, false);
    assert.equal(off.landcoverInfo.snowPercent, 0);
  }

  // Every cell is above a 5 m line, but the fixture's western third is OSM water and
  // water is stamped last, so it keeps those cells.
  const wet = await build({ snowLineM: 5 });
  assert.ok(wet.materialMeshes[0].materials.water.pos.length > 0);
  assert.ok(wet.landcoverInfo.snowPercent > 0 && wet.landcoverInfo.snowPercent < 100);
  assert.equal(wet.landcoverInfo.vegetationPercent, 0);   // snow took all the land
});

test('a mapped glacier reaches the print as its own material', async () => {
  const ice = feature(3, rectangle(0.001, 0, 0.002, 0.002), { natural: 'glacier' });
  const model = await build({}, {}, [forest(), ice]);
  const materials = model.materialMeshes[0].materials;
  assert.ok(materials.snow.pos.length > 0);
  assert.ok(materials.forest.pos.length > 0);
  assert.ok(model.landcoverInfo.hasSnow);
  assert.equal(model.landcoverInfo.snowLineM, null);   // no line: this is OSM data alone
});

test('a large selection is split into tiles, merged once, and deduplicated', async () => {
  // 1x1 degree ~ 111 km a side: over the old single-request ceiling, under the new one.
  const big = [[10, 10], [11, 11]];
  const boxes = L.tileBoxes(big);
  assert.ok(boxes.length > 1 && boxes.length <= L.MAX_TILES, `tiles ${boxes.length}`);
  assert.deepEqual(boxes[0][0], [10, 10]);                       // covers the south-west corner
  assert.deepEqual(boxes.at(-1)[1], [11, 11]);                   // and the north-east one
  assert.equal(L.tileBoxes([[1, 1], [1.001, 1.001]]).length, 1); // a small box still asks once

  /* Overpass returns anything INTERSECTING a tile, whole -- so a feature straddling tiles
     comes back from several. It must survive as one. */
  let calls = 0;
  const wide = feature(1, rectangle(10, 10, 11, 11), { natural: 'wood' });
  const data = await L.fetchLandcover(big, { retryMs: 0, fetcher: async () => {
    calls++; return { ok: true, json: async () => ({ elements: [wide] }) };
  } });
  assert.equal(calls, boxes.length);
  assert.equal(data.status, 'ok');
  assert.equal(data.missing, 0);
  assert.equal(data.tiles, boxes.length);
  assert.equal(data.features.length, 1);
});

const bboxOf = init => decodeURIComponent(init.body).match(/\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)/)[0];

test('a transient tile failure is retried rather than costing a rectangle of land', async () => {
  /* One 429 used to drop a whole tile silently -- half the map on a two-tile selection.
     Overpass rate-limits routinely, so the first attempt failing must not be the end of it. */
  const big = [[40, 40], [41, 41]];
  const total = L.tileBoxes(big).length;
  const wood = feature(1, rectangle(40.1, 40.1, 40.2, 40.2), { natural: 'wood' });
  const seen = new Map();
  const healed = await L.fetchLandcover(big, { retryMs: 0, fetcher: async (_url, init) => {
    const key = bboxOf(init), n = (seen.get(key) || 0) + 1; seen.set(key, n);
    if (n === 1) return { ok: false, status: 429 };             // every tile 429s once
    return { ok: true, json: async () => ({ elements: [wood] }) };
  } });
  assert.equal(healed.status, 'ok');
  assert.equal(healed.missing, 0);
  assert.equal(seen.size, total);
  // A 400 is the query being wrong, which a retry cannot mend, so it is not retried.
  const tries = new Map();
  await assert.rejects(L.fetchLandcover([[41, 41], [42, 42]], { retryMs: 0, fetcher: async (_url, init) => {
    const key = bboxOf(init); tries.set(key, (tries.get(key) || 0) + 1);
    return { ok: false, status: 400 };
  } }), /errLandcoverFetch/);
  assert.deepEqual([...new Set(tries.values())], [1]);
});

test('a timed-out tile keeps the ground it did return', async () => {
  /* Overpass answers a server-side timeout with 200, a remark, AND the elements it managed
     to collect -- often most of them. Throwing that away lost ground it had already sent. */
  const big = [[50, 50], [51, 51]];
  const total = L.tileBoxes(big).length;
  const wood = feature(1, rectangle(50.1, 50.1, 50.4, 50.4), { natural: 'wood' });
  const truncated = await L.fetchLandcover(big, { retryMs: 0, fetcher: async () => ({ ok: true,
    json: async () => ({ remark: 'runtime error: Query timed out', elements: [wood] }) }) });
  assert.equal(truncated.status, 'partial');    // kept, but the gap is still declared
  assert.equal(truncated.missing, total);
  assert.ok(truncated.features.length > 0);
  // A remark with nothing attached is a plain failure.
  await assert.rejects(L.fetchLandcover([[51, 51], [52, 52]], { retryMs: 0, fetcher: async () => ({ ok: true,
    json: async () => ({ remark: 'runtime error', elements: [] }) }) }), /errLandcoverFetch/);
});

test('a failed tile leaves a gap the caller can see, and is never cached', async () => {
  const big = [[20, 20], [21, 21]];
  const total = L.tileBoxes(big).length;
  assert.ok(total > 1);
  const wood = id => feature(id, rectangle(20.1, 20.1, 20.2, 20.2), { natural: 'wood' });
  // One tile is down for good -- retries cannot save it, so the gap is real.
  let dead = null, calls = 0;
  const flaky = async (_url, init) => {
    calls++;
    const key = bboxOf(init);
    if (dead === null) dead = key;
    if (key === dead) throw new Error('overpass down');
    return { ok: true, json: async () => ({ elements: [wood(calls)] }) };
  };
  const partial = await L.fetchLandcover(big, { retryMs: 0, fetcher: flaky });
  assert.equal(partial.status, 'partial');
  assert.equal(partial.missing, 1);
  assert.equal(partial.tiles, total);
  assert.ok(partial.features.length > 0);   // the tiles that answered still count

  // Uncached, so pressing Generate really does go back for the gap.
  calls = 0;
  const retry = await L.fetchLandcover(big, { retryMs: 0, fetcher: async () => {
    calls++; return { ok: true, json: async () => ({ elements: [wood(1)] }) };
  } });
  assert.equal(calls, total);
  assert.equal(retry.status, 'ok');
  assert.equal(retry.missing, 0);

  // Every tile failing is a failure, not a gap.
  await assert.rejects(L.fetchLandcover([[30, 30], [31, 31]], {
    fetcher: async () => { throw new Error('offline'); },
  }), /errLandcoverFetch/);
});

test('features too small for any cell this selection could resolve are dropped', () => {
  // The threshold follows the BOUNDS, not the chosen detail, so one cached response stays
  // valid across detail changes. At 1 degree a side the finest cell is ~111 m.
  const span = L.cellSpan([[40, 40], [41, 41]]);
  assert.ok(span[0] > 0 && span[1] > 0);
  const tiny = feature(1, rectangle(40.5, 40.5, 40.5002, 40.5002), { natural: 'wood' });
  const strip = feature(2, rectangle(40.5, 40.5, 40.9, 40.5002), { natural: 'wood' });
  const big = feature(3, rectangle(40.2, 40.2, 40.8, 40.8), { natural: 'wood' });
  const kept = L.normalize([tiny, strip, big], span);
  assert.deepEqual(kept.features.map(f => f.id), ['way/2', 'way/3']);   // the strip survives
  // Without a threshold nothing is filtered, which is what every small selection does.
  assert.equal(L.normalize([tiny, strip, big]).features.length, 3);
});

test('spreading grows mapped types one cell a round, and never moves water', async () => {
  const { growCategories } = await import('../geometry-landcover.mjs');
  const { CODE, OTHER } = L;
  const W = 7, D = 1;
  const grid = (...v) => Uint8Array.from(v);
  const all = new Uint8Array(W * D).fill(1);

  // One forest cell reaches exactly one cell a round, both ways.
  const one = grid(OTHER, OTHER, OTHER, CODE.forest, OTHER, OTHER, OTHER);
  assert.deepEqual([...growCategories(one.slice(), W, D, 0, all, CODE, OTHER)], [...one]);
  assert.deepEqual([...growCategories(one.slice(), W, D, 1, all, CODE, OTHER)],
    [OTHER, OTHER, CODE.forest, CODE.forest, CODE.forest, OTHER, OTHER]);
  assert.deepEqual([...growCategories(one.slice(), W, D, 2, all, CODE, OTHER)],
    [OTHER, CODE.forest, CODE.forest, CODE.forest, CODE.forest, CODE.forest, OTHER]);

  // Water is a measured mask: it is neither spread nor overwritten.
  const wet = grid(CODE.water, OTHER, OTHER, CODE.forest, OTHER, OTHER, CODE.water);
  assert.deepEqual([...growCategories(wet.slice(), W, D, 1, all, CODE, OTHER)],
    [CODE.water, OTHER, CODE.forest, CODE.forest, CODE.forest, OTHER, CODE.water]);
  // Even a long spread leaves the water cells exactly where they were.
  const flooded = growCategories(wet.slice(), W, D, 5, all, CODE, OTHER);
  assert.equal(flooded[0], CODE.water); assert.equal(flooded[6], CODE.water);
  assert.equal(flooded[1], CODE.forest);

  // A cell between two types takes the lower code, as overlapping polygons do.
  const both = grid(CODE.grass, OTHER, CODE.forest, OTHER, OTHER, OTHER, OTHER);
  assert.equal(growCategories(both.slice(), W, D, 1, all, CODE, OTHER)[1], CODE.forest);
  assert.ok(CODE.forest < CODE.grass);

  // Growth stops at the printed footprint.
  const shape = Uint8Array.from([1, 1, 1, 1, 0, 0, 0]);
  assert.deepEqual([...growCategories(one.slice(), W, D, 3, shape, CODE, OTHER)],
    [CODE.forest, CODE.forest, CODE.forest, CODE.forest, OTHER, OTHER, OTHER]);

  /* Per code: each type reaches its own distance. Forest 2, grass 0 -- the grass cell holds
     its ground but gains none, while the forest advances two and then stops. */
  const rounds = []; rounds[CODE.forest] = 2; rounds[CODE.grass] = 0;
  const mixed = grid(CODE.grass, OTHER, OTHER, OTHER, CODE.forest, OTHER, OTHER);
  assert.deepEqual([...growCategories(mixed.slice(), W, D, rounds, all, CODE, OTHER)],
    [CODE.grass, OTHER, CODE.forest, CODE.forest, CODE.forest, CODE.forest, CODE.forest]);
  // And the inverse, to prove neither is privileged by the loop order.
  const other = []; other[CODE.forest] = 0; other[CODE.grass] = 2;
  assert.deepEqual([...growCategories(mixed.slice(), W, D, other, all, CODE, OTHER)],
    [CODE.grass, CODE.grass, CODE.grass, OTHER, CODE.forest, OTHER, OTHER]);
});

test('spreading raises what is painted without touching what was mapped', async () => {
  /* The default fixture tiles the whole box with wood and farmland, so there is nothing to
     grow INTO. Use a sparse map instead: two small patches east of the water, with real
     unmapped ground between and around them. */
  const sparse = [feature(1, rectangle(0.0008, 0.0008, 0.0012, 0.0012), { natural: 'wood' }),
    feature(2, rectangle(0.0014, 0.0014, 0.0018, 0.0018), { landuse: 'farmland' })];
  const plain = await build({}, {}, sparse);
  const spread = await build({ landGrowCells: 2 }, {}, sparse);
  // The OSM figure is measured before the spread, so the note keeps meaning what it says.
  assert.equal(spread.landcoverInfo.vegetationPercent, plain.landcoverInfo.vegetationPercent);
  assert.deepEqual(spread.landcoverInfo.growCells, { snow: 2, forest: 2, grass: 2 });
  assert.deepEqual(plain.landcoverInfo.growCells, { snow: 0, forest: 0, grass: 0 });
  // coloredPercent is the "is anything growing" signal the note gates on.
  assert.equal(plain.landcoverInfo.coloredPercent, null);
  assert.ok(spread.landcoverInfo.coloredPercent > plain.landcoverInfo.mappedPercent);

  // Per type: one land type spreads while the others are left exactly alone.
  const forestOnly = await build({ landGrowCells: { forest: 2 } }, {}, sparse);
  assert.deepEqual(forestOnly.landcoverInfo.growCells, { snow: 0, forest: 2, grass: 0 });
  assert.equal(forestOnly.landcoverInfo.vegetationPercent, plain.landcoverInfo.vegetationPercent);
  assert.ok(forestOnly.landcoverInfo.coloredPercent > plain.landcoverInfo.mappedPercent);
  // Spreading one type reaches less ground than spreading every type.
  assert.ok(forestOnly.landcoverInfo.coloredPercent < spread.landcoverInfo.coloredPercent);
  // All zeroes is off, whichever shape it arrives in.
  assert.equal((await build({ landGrowCells: { forest: 0 } }, {}, sparse)).landcoverInfo.coloredPercent, null);
});

test('a thin base and a route bed keep their land colour', async () => {
  /* The skin used to be trimmed at a fixed z >= 1, which is exactly MIN_ROUTE_FLOOR. A flat
     through route follows the lowest ground by definition, so its bed came out with no
     colour at the DEFAULT base -- and a 1 mm base lost its colour wherever the ground sat
     near the model minimum. Nothing caught it: the leftover "other" is the complement, so a
     piece whose colours all vanished still reconstructs perfectly. */
  const { kernel, fromSoup } = await import('../geometry-city.mjs'), api = await kernel();
  const volumeOf = mesh => {
    if (!mesh.pos.length) return 0;
    const solid = fromSoup(api, mesh.pos);
    try { return solid.volume(); } finally { solid.delete(); }
  };
  // No water, so the fixture's lowest columns are forest rather than lake.
  const thick = await build({ baseMM: 3 }, { water: false });
  const thin = await build({ baseMM: 1 }, { water: false });
  assert.ok(thick.landcoverInfo.skinFloorZ <= thick.grid.baseMM - 0.2);
  assert.ok(thin.landcoverInfo.skinFloorZ <= thin.grid.baseMM - 0.2);
  // The colour is a surface skin: how thick the base is underneath must not consume it.
  const full = volumeOf(thick.materialMeshes[0].materials.forest);
  assert.ok(full > 0);
  assert.ok(volumeOf(thin.materialMeshes[0].materials.forest) > full * 0.9,
    `thin base kept ${volumeOf(thin.materialMeshes[0].materials.forest)} of ${full}`);

  // The bed of a flat through route is the lowest surface that still has to be coloured.
  const routed = await build({ routeMode: 'through', routeProfile: 'flat',
    routePath: [[0, 0.001], [0.002, 0.001]] }, { water: false });
  assert.ok(routed.grid.routeFloorZ > 0);
  assert.ok(routed.landcoverInfo.skinFloorZ < routed.grid.routeFloorZ,
    `skin floor ${routed.landcoverInfo.skinFloorZ} must sit below the route bed ${routed.grid.routeFloorZ}`);
  assert.ok(volumeOf(routed.materialMeshes[0].materials.forest) > 0);
});

test('the skin drop follows the steeper neighbour of each vertex', async () => {
  const { skinDropField, SKIN_MM } = await import('../geometry-landcover.mjs');
  const grid = (...h) => ({ Hv: Float32Array.from(h), W: 2, D: 1, VW: 3, dx: 1, dy: 1, zScale: 1 });
  // Flat ground is the case that must not change: the factor is exactly 1.
  const flat = skinDropField(grid(0, 0, 0, 0, 0, 0));
  assert.equal(flat.length, 6);
  for (const d of flat) assert.ok(Math.abs(d - SKIN_MM) < 1e-6, `${d}`);
  // A uniform 1:1 ramp needs sqrt(2) of vertical drop to leave SKIN_MM perpendicular.
  for (const d of skinDropField(grid(0, 1, 2, 0, 1, 2))) assert.ok(Math.abs(d - SKIN_MM * Math.SQRT2) < 1e-6, `${d}`);
  /* A vertex shared by a flat cell and a steep one takes the STEEP one -- that is the cell
     whose ribbon is at risk, and a central difference would average the spike away. */
  const step = skinDropField(grid(0, 0, 3, 0, 0, 3)), steep = SKIN_MM * Math.hypot(1, 3);
  assert.ok(Math.abs(step[0] - SKIN_MM) < 1e-6, `${step[0]}`);
  for (const k of [1, 2]) assert.ok(Math.abs(step[k] - steep) < 1e-6, `${k}: ${step[k]}`);
  // The ceiling is a stop against absurd coordinates, not part of the shape.
  for (const d of skinDropField(grid(0, 0, 3, 0, 0, 3), SKIN_MM, 1)) assert.ok(d <= 1);
});

test('the coloured skin stays wide enough to slice on steep ground', async () => {
  /* The skin used to be cut by dropping the terrain straight DOWN by 0.8 mm, which makes it
     0.8 mm thick vertically -- so at a slicing layer the coloured ribbon was only
     0.8 / slope wide, and a model's slope is the real slope times the vertical
     exaggeration. Snow paid for it: a snow line puts snow on the highest and steepest
     ground in the model by construction, so Bambu Studio dropped the ribbon as a
     sub-extrusion-width feature and the summit printed in the ground colour, while the
     app's own preview showed the snow perfectly. So measure what the slicer measures --
     the horizontal width of the ribbon at a layer -- rather than the mesh's thickness. */
  const { kernel, fromSoup } = await import('../geometry-city.mjs'), api = await kernel();
  const { SKIN_MM } = await import('../geometry-landcover.mjs');
  // One land type over the whole box, no water and no buildings: the skin is then the
  // entire coloured surface and a slice of it is one clean band across the ramp.
  const everywhere = [feature(1, rectangle(0, 0, 0.002, 0.002), { natural: 'wood' })];
  const skinOf = async slope => {
    const model = await build({ includeBuildings: false, waterEnabled: false }, { water: false, slope }, everywhere);
    return { model, skin: fromSoup(api, model.materialMeshes[0].materials.forest.pos) };
  };

  const { model, skin } = await skinOf(200);
  try {
    // The fixture ramps along x alone, so this is the model's slope exactly.
    const slope = (model.maxZ - model.grid.baseMM) / model.modelWidth;
    assert.ok(slope > 2, `slope ${slope}`);
    // What the old flat drop would have left: well under one 0.4 mm extrusion, i.e. nothing.
    assert.ok(SKIN_MM / slope < 0.4, `a flat drop would leave ${SKIN_MM / slope} mm`);
    const box = skin.boundingBox();
    for (let f = 0.2; f <= 0.81; f += 0.1) {
      const cross = skin.slice(box.min[2] + (box.max[2] - box.min[2]) * f);
      try {
        const width = cross.bounds().max[0] - cross.bounds().min[0];
        assert.ok(width >= SKIN_MM - 1e-3, `layer ${f.toFixed(1)} of the ramp is ${width} mm wide`);
      } finally { cross.delete(); }
    }
  } finally { skin.delete(); }

  // Level ground keeps precisely the slab it always had: volume over footprint is SKIN_MM.
  const flat = await skinOf(0);
  try {
    const thickness = flat.skin.volume() / (flat.model.modelWidth * flat.model.modelDepth);
    assert.ok(Math.abs(thickness - SKIN_MM) < 1e-3, `flat ground skin is ${thickness} mm thick`);
  } finally { flat.skin.delete(); }
});
