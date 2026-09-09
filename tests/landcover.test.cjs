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
  const data = L.normalize([outside, hole, relation, broken]);
  assert.equal(data.features.length, 1); assert.equal(data.invalid, 1);
  const [f, o] = [L.CODE.forest, L.OTHER];
  assert.deepEqual([...L.classify(data, bounds, 4, 4)], [f, f, f, f, f, o, o, f, f, o, o, f, f, f, f, f]);
  const invalidRelation = { ...relation, members: [...relation.members, { type: 'way', ref: 99, role: 'inner' }] };
  const fallback = L.normalize([invalidRelation, outside]);
  assert.equal(fallback.invalid, 1); assert.equal(fallback.features[0].id, 'way/10');
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
  assert.equal((await L.fetchLandcover(b, { enabled: false, fetcher: response([]) })).status, 'off');
  assert.equal(calls, 0);
  const first = await L.fetchLandcover(b, { fetcher: response([]) });
  assert.equal(first.status, 'empty'); assert.equal(await L.fetchLandcover(b, { fetcher: response([]) }), first); assert.equal(calls, 1);
  const b2 = [[2, 2], [2.001, 2.001]];
  await assert.rejects(L.fetchLandcover(b2, { fetcher: async () => ({ ok: true, json: async () => ({ remark: 'timeout', elements: [] }) }) }), /errLandcoverFetch/);
  await assert.rejects(L.fetchLandcover(b2, { fetcher: async () => { throw new Error('offline'); } }), /errLandcoverFetch/);
  assert.equal((await L.fetchLandcover(b2, { fetcher: response([forest()]) })).status, 'ok');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(L.fetchLandcover(b, { signal: controller.signal, fetcher: response([]) }), { name: 'AbortError' });
  const pending = new AbortController();
  await assert.rejects(L.fetchLandcover([[3, 3], [3.001, 3.001]], { signal: pending.signal, fetcher: async () => {
    pending.abort(); return { ok: true, json: async () => ({ elements: [] }) };
  } }), { name: 'AbortError' });
});

test('area, feature and vertex budgets reject oversized data', async () => {
  await assert.rejects(L.fetchLandcover([[0, 0], [1, 1]], { fetcher: () => { throw new Error('must not fetch'); } }), /errLandcoverArea/);
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
            for (let k = 2; k < mesh.pos.length; k += 3) assert.ok(mesh.pos[k] >= 1 - 1e-5);
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
