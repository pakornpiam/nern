const { test } = require('node:test');
const assert = require('node:assert/strict');
const { feature, rectangle, bounds, wideBounds } = require('./fixtures.cjs');
const T = TopoTerrain, B = TopoBuildings;

test('both elevation encodings preserve negative and fractional heights', () => {
  assert.equal(T.decoders.terrarium(128, 0, 0), 0);
  assert.equal(T.decoders.terrarium(127, 255, 128), -0.5);
  assert.ok(Math.abs(T.decoders.maptiler(1, 134, 160)) < 1e-10);
  assert.ok(Math.abs(T.decoders.maptiler(1, 130, 184) + 100) < 1e-9);
});
test('zoom respects provider limits, latitude, and rectangular tile budgets', () => {
  const p = { minZoom: 1, maxZoom: 15, tileSize: 256 };
  const a = T.choose(bounds, 200, p), b = T.choose(bounds, 800, p);
  assert.ok(b.zoom >= a.zoom); assert.ok(b.zoom <= 15);
  const wide = T.choose([[0, 0], [0.1, 20]], 1000, p, 4);
  const r = wide.rect; assert.ok((r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1) <= 4); assert.equal(wide.limited, true);
  assert.throws(() => T.choose([[0, 179], [1, -179]], 400, p), /errTerrainBounds/);
});
test('per-axis grids match a scalar when square and keep the short axis resolved', () => {
  const p = { minZoom: 1, maxZoom: 15, tileSize: 256 };
  // A scalar is exactly an equal pair, so every legacy caller is unaffected.
  assert.equal(T.choose(bounds, [200, 200], p).zoom, T.choose(bounds, 200, p).zoom);
  // A proportional grid over a 4:1 box: zoom is chosen from the finer axis, so it
  // can only gain detail, and the reported scalar spacing stays the coarser axis.
  const prop = T.choose(wideBounds, [400, 100], p), flat = T.choose(wideBounds, 400, p);
  assert.ok(prop.zoom >= flat.zoom);
  assert.ok(Math.abs(prop.meshSpacing - flat.meshSpacing) / flat.meshSpacing < 0.02);
  // Proportional samples over a 4:1 box give square cells.
  assert.ok(Math.abs(prop.meshSpacingX - prop.meshSpacingY) / prop.meshSpacingX < 0.02);
  // A square grid on the same box does not: the short axis is oversampled 4x.
  assert.ok(flat.meshSpacingX / flat.meshSpacingY > 3.5);
});
test('sampler interpolates across tile edges and rejects missing elevations', () => {
  const tiles = new Map([['0,0', new Float32Array([0, 10, 20, 30])], ['1,0', new Float32Array([40, 50, 60, 70])]]);
  const sample = T.sampler(tiles, { tileSize: 2 }, 1, { x0: 0, x1: 1, y0: 0, y1: 0 });
  assert.equal(sample(0, 0), 45); // horizontal seam, lower row clamped to tile extent
  tiles.get('1,0')[2] = NaN;
  assert.throws(() => sample(0, 0), /errTerrainTile/);
});
test('requests retry transient failures twice, reject invalid keys immediately, and sanitize errors', async () => {
  let calls = 0;
  const ok = await T.request('https://example.test/?key=private', { fetcher: async () => ++calls < 3 ? new Response('', { status: 503 }) : new Response('ok') });
  assert.equal(await ok.text(), 'ok'); assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(T.request('https://example.test/?key=private', { fetcher: async () => { calls++; return new Response('', { status: 403 }); } }), /errTerrainAuth/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(T.request('https://example.test/?key=private', { fetcher: async () => { calls++; throw new Error('private'); } }), e => e.message === 'errTerrainTile');
  assert.equal(calls, 3);
});
test('pool caps concurrency at six and stops queued work on cancellation', async () => {
  let active = 0, peak = 0;
  await T.pool(Array.from({ length: 20 }, (_, i) => i), async () => {
    active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 2)); active--;
  });
  assert.equal(peak, 6);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(T.pool([1, 2], async () => assert.fail(), controller.signal), { name: 'AbortError' });
});
test('height tags, units, levels and unknown heights follow the chosen defaults', () => {
  assert.equal(B.height({ height: '40 m', 'building:levels': '2' }).heightM, 40);
  assert.equal(B.height({ height: '20 ft' }).heightM, 6.096);
  assert.equal(B.height({ height: 'bad', 'building:levels': '3' }).heightM, 9);
  assert.equal(B.height({ height: '-1', 'building:levels': '0' }).heightSource, 'default');
});
test('multipart relations stitch reversed ways, retain courtyards, and deduplicate members', () => {
  const outer = rectangle(0, 0, 0.002, 0.002), hole = rectangle(0.0008, 0.0008, 0.0012, 0.0012);
  const geom = r => r.map(([lon, lat]) => ({ lon, lat }));
  const relation = { type: 'relation', id: 9, tags: { type: 'multipolygon', building: 'yes', height: '15' }, members: [
    { type: 'way', ref: 1, role: 'outer', geometry: geom([outer[0], outer[1], outer[2]]) },
    { type: 'way', ref: 2, role: 'outer', geometry: geom([outer[0], outer[3], outer[2]]) },
    { type: 'way', ref: 3, role: 'inner', geometry: geom([...hole, hole[0]]) },
  ] };
  const result = B.normalize([feature(3, hole), relation]);
  assert.equal(result.features.length, 1); assert.equal(result.features[0].polygons[0].length, 2);
  assert.equal(result.features[0].heightM, 15);
});
test('mapped parts replace their outline; invalid and excessive data are explicit', () => {
  const outer = feature(1, rectangle(0, 0, 0.002, 0.002));
  const part = feature(2, rectangle(0.0005, 0.0005, 0.001, 0.001), { 'building:part': 'yes', height: '30' });
  const result = B.normalize([outer, part]); assert.equal(result.features.length, 1); assert.equal(result.features[0].id, 'way/2');
  const broken = feature(5, rectangle(0, 0, 1, 1)); broken.geometry.pop();
  assert.equal(B.normalize([broken]).invalid, 1);
  const many = Array.from({ length: 10001 }, (_, id) => ({ ...part, id }));
  assert.equal(B.normalize(many).status, 'limit'); assert.equal(B.normalize(many).features.length, 0);
});
test('buildings off or oversized selections do not make network requests', async () => {
  assert.equal((await B.fetchBuildings(bounds, { enabled: false })).status, 'off');
  assert.equal((await B.fetchBuildings([[0, 0], [1, 1]])).status, 'area');
});

test('failed building requests are retryable and empty results cache independently of terrain', async () => {
  const original = global.fetch; let calls = 0;
  const area = [[2, 2], [2.002, 2.002]];
  try {
    global.fetch = async () => {
      calls++;
      return calls === 1 ? new Response('', { status: 429 }) : Response.json({ elements: [] });
    };
    assert.equal((await B.fetchBuildings(area)).status, 'failed');
    assert.equal((await B.fetchBuildings(area)).status, 'empty');
    assert.equal((await B.fetchBuildings(area)).status, 'empty');
    assert.equal(calls, 2);
    global.fetch = async () => Response.json({ remark: 'timeout: partial data', elements: [feature(1, rectangle(2, 2, 2.001, 2.001))] });
    assert.equal((await B.fetchBuildings([[3, 3], [3.002, 3.002]])).status, 'failed');
  } finally { global.fetch = original; }
});
