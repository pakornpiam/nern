const { test } = require('node:test');
const assert = require('node:assert/strict');
const { source, options, feature, rectangle, wideBounds } = require('./fixtures.cjs');
const city = import('../geometry-city.mjs');

async function checkClosed(pos) {
  const { kernel, fromSoup } = await city, api = await kernel(), solid = fromSoup(api, pos);
  assert.equal(solid.status(), 'NoError'); assert.ok(solid.volume() > 0);
  const volume = solid.volume(); solid.delete(); return volume;
}
test('fused buildings add volume and retain flat roofs independently of exaggeration', async () => {
  const { fuseCity } = await city;
  let height;
  for (const vex of [1, 5]) {
    const base = TopoGeometry.buildGeometry(source(), options({ vex }));
    const before = await checkClosed(base.pieces[0].pos);
    const model = await fuseCity(base);
    assert.equal(model.cityInfo.count, 1);
    const after = await checkClosed(model.pieces[0].pos); assert.ok(after > before);
    if (height) assert.ok(Math.abs(height - model.maxZ) < 1e-8); height = model.maxZ;
    const z = Array.from(model.pieces[0].pos).filter((_, i) => i % 3 === 2);
    assert.ok(Math.abs(Math.max(...z) - model.maxZ) < 1e-5);
  }
});
test('buildings split at jigsaw seams and preserve through-route gaps', async () => {
  const { fuseCity, kernel, fromSoup } = await city, api = await kernel();
  const model = await fuseCity(TopoGeometry.buildGeometry(source({ samples: 40 }), options({ nx: 2, routeMode: 'through', routePath: [[0, 0.001], [0.002, 0.001]] })));
  for (const p of model.pieces) await checkClosed(p.pos);
  const a = fromSoup(api, model.pieces[0].pos), b = fromSoup(api, model.pieces[1].pos), overlap = a.intersect(b);
  assert.ok(overlap.volume() < 1e-6); overlap.delete(); a.delete(); b.delete();
  for (const p of model.pieces) {
    const solid = fromSoup(api, p.pos), slice = solid.slice(5);
    assert.ok(slice.area() > 0); slice.delete(); solid.delete();
  }
});
test('courtyards remain open and roofs clear sloping ground', async () => {
  const { fuseCity, kernel, fromSoup } = await city, api = await kernel();
  const outer = rectangle(0.0003, 0.0003, 0.0017, 0.0017), hole = rectangle(0.0008, 0.0008, 0.0012, 0.0012);
  const buildings = { status: 'ok', invalid: 0, features: [{ id: 'courtyard', heightM: 20, heightSource: 'height', polygons: [[outer, hole]] }] };
  const model = await fuseCity(TopoGeometry.buildGeometry(source({ buildings, slope: 5 }), options()));
  await checkClosed(model.pieces[0].pos);
  const solid = fromSoup(api, model.citySolids[0]);
  const center = api.Manifold.cube([2, 2, model.maxZ]).translate([89, 89, 0]), overlap = solid.intersect(center);
  assert.equal(overlap.volume(), 0); overlap.delete(); center.delete(); solid.delete();
});
test('city 3MF bands plus water reconstruct the fused solid', async () => {
  const { fuseCity, exportSolids } = await city;
  for (const flattenWater of [false, true]) {
    const src = source({ slope: 4, water: true });
    const model = await fuseCity(TopoGeometry.buildGeometry(src, options({ flattenWater })));
    model.zCuts = [4, 6]; model.NB = 3;
    const parts = await exportSolids(model);
    const volume = await checkClosed(model.pieces[0].pos);
    let sum = 0;
    for (const pos of [parts[0].water, ...parts[0].bands]) if (pos.length) sum += await checkClosed(pos);
    assert.ok(Math.abs(sum - volume) / volume < 1e-5, `${sum} vs ${volume}`);
  }
});
test('selection shape clips buildings and off mode preserves terrain', async () => {
  const { fuseCity } = await city;
  const buildings = TopoBuildings.normalize([feature(1, rectangle(-0.001, -0.001, 0.003, 0.003))]);
  const a = await fuseCity(TopoGeometry.buildGeometry(source({ buildings }), options({ frameStyle: 'circle' })));
  await checkClosed(a.pieces[0].pos);
  const off = TopoGeometry.buildGeometry(source(), options({ includeBuildings: false })), before = off.pieces[0].pos.slice();
  await fuseCity(off); assert.deepEqual(off.pieces[0].pos, before);
});

test('city additions leave every route mode open and retain printable route inserts', async () => {
  const { fuseCity, kernel, fromSoup } = await city, api = await kernel();
  for (const routeMode of ['inlay', 'through', 'engrave', 'emboss']) {
    const model = await fuseCity(TopoGeometry.buildGeometry(source({ samples: 40, slope: 4 }), options({
      nx: 2, routeMode, routePath: [[0, 0.001], [0.002, 0.001]],
    })));
    for (const p of model.pieces) await checkClosed(p.pos);
    for (const r of model.routeParts || []) await checkClosed(r.pos);
    for (const p of model.citySolids.filter(Boolean)) {
      const addition = fromSoup(api, p), center = api.Manifold.cube([1, 180, model.maxZ]).translate([89.5, 0, 0]);
      const overlap = addition.intersect(center); assert.ok(overlap.volume() < 1e-6, routeMode);
      overlap.delete(); center.delete(); addition.delete();
    }
  }
});

test('administrative boundaries with holes clip city foundations', async () => {
  const { fuseCity, kernel, fromSoup } = await city, api = await kernel();
  const polygons = [{ bbox: [0, 0, 0.002, 0.002], rings: [rectangle(0, 0, 0.002, 0.002), rectangle(0.0008, 0.0008, 0.0012, 0.0012)] }];
  const model = await fuseCity(TopoGeometry.buildGeometry(source(), options({ regionPolygons: polygons })));
  await checkClosed(model.pieces[0].pos);
  const solid = fromSoup(api, model.pieces[0].pos), hole = api.Manifold.cube([10, 10, model.maxZ]).translate([85, 85, 0]), overlap = solid.intersect(hole);
  assert.equal(overlap.volume(), 0); overlap.delete(); hole.delete(); solid.delete();
});
test('rectangular selections fit the maximum model size and still print solid pieces', async () => {
  // 4:1 bounds with a proportionally sized grid: the shape the app now produces.
  const model = TopoGeometry.buildGeometry(source({ samples: 80, samplesY: 20, bounds: wideBounds }),
    options({ bounds: wideBounds, nx: 2, ny: 2 }));
  // widthMM is the longest side, whichever axis that is.
  assert.ok(Math.abs(Math.max(model.modelWidth, model.modelDepth) - 180) < 1e-6);
  assert.ok(model.modelDepth < model.modelWidth);          // aspect survives
  assert.ok(Math.abs(model.modelWidth / model.modelDepth - 4) < 0.01);
  // A proportional grid keeps terrain cells square.
  assert.ok(Math.abs(model.grid.dx - model.grid.dy) / model.grid.dx < 0.01);
  assert.ok(Math.abs(model.pieceW - model.modelWidth / 2) < 1e-9);
  assert.ok(Math.abs(model.pieceH - model.modelDepth / 2) < 1e-9);
  // The real proof that W !== D stays manifold through walls, caps and the partition.
  for (const p of model.pieces) await checkClosed(p.pos);
});
