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
test('route dimensions drive the stamp, default to the old fixed sizes and clamp', async () => {
  // A north-south route down the middle of the model, so its X extent is its width.
  const routePath = [[0, 0.001], [0.002, 0.001]];
  const xSpan = parts => {
    let lo = Infinity, hi = -Infinity;
    for (const p of parts) for (let k = 0; k < p.pos.length; k += 3) { lo = Math.min(lo, p.pos[k]); hi = Math.max(hi, p.pos[k]); }
    return hi - lo;
  };

  // Omitting the fields must reproduce the constants this feature replaced, or every
  // model built before it — and every other fixture in this file — silently changes.
  // 120 samples over 180 mm keeps vertices 1.5 mm apart, fine enough that none of the
  // widths below trip the grid floor and get widened out from under the assertions.
  const legacy = TopoGeometry.buildGeometry(source({ samples: 120 }), options({ routeMode: 'through', routePath }));
  assert.equal(legacy.grid.routeHalf, 1.6);
  assert.equal(legacy.grid.channelHalf, 1.8);

  // The through route is clipped from an exact distance field, so it is exactly as
  // wide as asked, and the channel keeps the requested clearance on each side.
  for (const [routeWidthMM, routeClearMM] of [[3.2, 0.2], [8, 0.5]]) {
    const model = TopoGeometry.buildGeometry(source({ samples: 120 }),
      options({ routeMode: 'through', routePath, routeWidthMM, routeClearMM }));
    assert.ok(Math.abs(xSpan(model.routeParts) - routeWidthMM) < 1e-6);
    assert.equal(model.grid.routeHalf, routeWidthMM / 2);
    assert.ok(Math.abs(model.grid.channelHalf - model.grid.routeHalf - routeClearMM) < 1e-9);
    for (const r of model.routeParts) await checkClosed(r.pos);   // still printable when widened
  }

  // Out-of-range input is clamped in the geometry, not just the UI: the worker takes
  // whatever opts it is handed.
  const clamped = TopoGeometry.buildGeometry(source({ samples: 120 }),
    options({ routeMode: 'through', routePath, routeWidthMM: 99, routeClearMM: 9 }));
  assert.equal(clamped.grid.routeHalf, 6);
  assert.equal(clamped.grid.channelHalf, 6.8);

  // Depth is a magnitude; the mode picks the sign. On flat fixture terrain the emboss
  // ridge IS the high point, while the engrave groove floor sits at the base.
  const centreZ = m => {
    let z = 0;
    for (const p of m.pieces) for (let k = 0; k < p.pos.length; k += 3) {
      if (Math.abs(p.pos[k] - 90) < 1e-6) z = Math.max(z, p.pos[k + 2]);
    }
    return z;
  };
  for (const routeDepthMM of [0.8, 2]) {
    const raised = TopoGeometry.buildGeometry(source({ samples: 120 }), options({ routeMode: 'emboss', routePath, routeDepthMM }));
    const cut = TopoGeometry.buildGeometry(source({ samples: 120 }), options({ routeMode: 'engrave', routePath, routeDepthMM }));
    assert.ok(Math.abs(raised.maxZ - (3 + routeDepthMM)) < 1e-6);       // baseMM 3 + ridge
    assert.ok(Math.abs(centreZ(raised) - raised.maxZ) < 1e-6);          // ridge stands proud
    assert.ok(Math.abs(centreZ(cut) - 3) < 1e-6);                       // groove reaches the base
    assert.ok(Math.abs(cut.maxZ - centreZ(cut) - routeDepthMM) < 1e-6); // and is that deep
  }

  // Buildings must clear the route at whatever width it was stamped: fuseCity carves
  // its clearance strips from the same resolver, not the old fixed 0.9 mm half-width.
  const { fuseCity, kernel, fromSoup } = await city, api = await kernel();
  const wide = await fuseCity(TopoGeometry.buildGeometry(source({ samples: 40, slope: 4 }),
    options({ routeMode: 'emboss', routePath, routeWidthMM: 8 })));
  for (const p of wide.citySolids.filter(Boolean)) {
    // The route runs down x = 90; an 8 mm route owns 86..94, so probe well outside the
    // 1.8 mm the old constant would have cleared.
    const addition = fromSoup(api, p), corridor = api.Manifold.cube([6, 180, wide.maxZ]).translate([87, 0, 0]);
    const overlap = addition.intersect(corridor);
    assert.ok(overlap.volume() < 1e-6, `buildings encroach on an 8 mm route: ${overlap.volume()}`);
    overlap.delete(); corridor.delete(); addition.delete();
  }

  // The inlay insert is a solid, so a wider route is a bigger part.
  const volumes = [];
  for (const routeWidthMM of [3.2, 8]) {
    const model = await fuseCity(TopoGeometry.buildGeometry(source({ samples: 120 }),
      options({ routeMode: 'inlay', routePath, routeWidthMM })));
    let total = 0;
    for (const r of model.routeParts) total += await checkClosed(r.pos);
    volumes.push(total);
  }
  assert.ok(volumes[1] > volumes[0] * 1.5, `inlay volume ${volumes[0]} → ${volumes[1]}`);
});
test('band and water solids re-cut the widened route channel they were built for', async () => {
  // buildBandSolidMesh and buildWaterCapMesh clip the channel from `model` alone, so
  // they read the width off model.grid. If they fell back to the old fixed 1.8 mm the
  // bands would not add up to the terrain piece the route was actually carved from.
  // includeBuildings must be off: with buildings, exportSolids derives bands by
  // trimming the fused CSG solid instead and never calls buildBandSolidMesh at all.
  const { exportSolids, kernel, fromSoup } = await city, api = await kernel();
  const volumeOf = pos => { const s = fromSoup(api, pos); const v = s.volume(); s.delete(); return v; };
  const sums = [];
  for (const routeWidthMM of [3.2, 9]) {
    const model = TopoGeometry.buildGeometry(source({ samples: 100, slope: 4, water: true }), options({
      flattenWater: true, includeBuildings: false, routeMode: 'through',
      routePath: [[0, 0.001], [0.002, 0.001]], routeWidthMM
    }));
    model.zCuts = [4, 6]; model.NB = 3;
    const parts = await exportSolids(model);
    const volume = volumeOf(model.pieces[0].pos);
    let sum = 0;
    for (const pos of [parts[0].water, ...parts[0].bands]) if (pos.length) sum += volumeOf(pos);
    // ~1.4e-4 is this path's standing residual from the water skin — present with no
    // route at all. A stale channel width misses by 3.5e-2, well outside this bound.
    assert.ok(Math.abs(sum - volume) / volume < 1e-3, `width ${routeWidthMM}: ${sum} vs ${volume}`);
    sums.push(sum);
  }
  // The widened channel really did remove material rather than the two runs agreeing
  // by accident — the exact signature of a band mesh ignoring model.grid.channelHalf.
  assert.ok(sums[1] < sums[0] * 0.99, `bands did not shrink: ${sums[0]} → ${sums[1]}`);
});
test('a route thinner than the sampling grid still reaches the print', async () => {
  // The stamp is only ever tested at grid vertices, so a route running between two
  // columns used to touch nothing at all: no groove, no insert, no route part, and no
  // warning either, since its coordinates are inside the area. 60 samples across a
  // 180 mm model puts vertices every 3 mm; x = 91.5 mm is exactly between two of them.
  const lon = 91.5 * 0.002 / 180;
  const routePath = [[0.0002, lon], [0.0018, lon]];
  for (const routeWidthMM of [0.6, 1.2, 2]) {
    for (const routeMode of ['inlay', 'through']) {
      const model = TopoGeometry.buildGeometry(source({ samples: 60 }), options({ routeMode, routePath, routeWidthMM }));
      assert.ok(model.routeParts?.length, `${routeMode} ${routeWidthMM} mm produced no route part`);
      for (const r of model.routeParts) await checkClosed(r.pos);
      // Widened to what the grid can carry, and both numbers reported so the page can
      // tell the user the slider is not what was cut.
      assert.equal(model.routeAskedWidthMM, routeWidthMM);
      assert.ok(model.routeStampedWidthMM > routeWidthMM);
      assert.ok(Math.abs(model.routeStampedWidthMM - Math.hypot(model.grid.dx, model.grid.dy)) < 1e-9);
    }
  }
  // A grid fine enough for the requested width must leave it exactly alone — the floor
  // is a rescue, not a rounding rule.
  const fine = TopoGeometry.buildGeometry(source({ samples: 400 }), options({ routeMode: 'inlay', routePath, routeWidthMM: 3.2 }));
  assert.equal(fine.routeStampedWidthMM, 3.2);
  assert.equal(fine.routeAskedWidthMM, 3.2);
  assert.equal(fine.grid.routeHalf, 1.6);
});
