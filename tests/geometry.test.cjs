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
test('the water layer can be switched off, freeing its slot as a fourth land band', async () => {
  // The fixture's left third is an OSM lake, so this exercises the case the level
  // alone cannot reach: `osmWater[v] ||` short-circuits the level test entirely.
  const wet = m => m.grid.water.reduce((n, v) => n + v, 0);

  // Water on (and absent, as every other fixture in this file leaves it) is unchanged.
  const on = TopoGeometry.buildGeometry(source({ water: true, slope: 4 }), options());
  assert.equal(on.hasWater, true);
  assert.equal(on.NB, 3);
  assert.ok(wet(on) > 0);
  assert.ok(on.landMin > on.minE, 'the lake should lift landMin above the true minimum');

  const off = TopoGeometry.buildGeometry(source({ water: true, slope: 4 }), options({ waterEnabled: false }));
  assert.equal(off.hasWater, false);
  assert.equal(off.hasOsmWater, false);
  assert.equal(wet(off), 0, 'mapped lakes must be ignored, not merely out-scored');
  assert.equal(off.NB, 4, 'the freed slot becomes a fourth land band');
  // landMinOf promises this, and it is what makes the fourth band span the real range.
  assert.equal(off.landMin, off.minE);
  assert.equal(off.grid.capCell, null);

  // #waterAuto governs the freed slot only when water is ON but none was found. An
  // explicit off always reuses it, so the checkbox must not be able to contradict it.
  const offNoFallback = TopoGeometry.buildGeometry(source({ water: true, slope: 4 }),
    options({ waterEnabled: false, autoFallback: false }));
  assert.equal(offNoFallback.NB, 4);

  // flattenWaterHeights rewrites Hv in place and re-derives minE/maxE, so leaving it
  // to run with the layer off would move the elevation range of a print showing no
  // water at all. Flatten on/off must be indistinguishable once water is disabled.
  const offFlat = TopoGeometry.buildGeometry(source({ water: true, slope: 4 }),
    options({ waterEnabled: false, flattenWater: true }));
  assert.equal(offFlat.minE, off.minE);
  assert.equal(offFlat.maxE, off.maxE);
  assert.equal(offFlat.grid.capCell, null);
  // ...and the flatten really does move the range when water IS on, so the check above
  // is comparing against something that would otherwise differ.
  const onFlat = TopoGeometry.buildGeometry(source({ water: true, slope: 4 }), options({ flattenWater: true }));
  assert.ok(onFlat.minE > off.minE, 'flatten should raise minE when water is on');

  // The pieces still print, and the four bands still reconstruct them.
  const { exportSolids } = await city;
  const volume = await checkClosed(off.pieces[0].pos);
  off.zCuts = [11, 12, 13];
  const parts = await exportSolids(off);
  assert.equal(parts[0].bands.length, 4);
  assert.equal(parts[0].water.length, 0, 'no water solid, so no blue filament');
  let sum = 0;
  for (const pos of parts[0].bands) if (pos.length) sum += await checkClosed(pos);
  assert.ok(Math.abs(sum - volume) / volume < 1e-3, `${sum} vs ${volume}`);
});
test('the flat route profile is opt-in and leaves every default byte-identical', async () => {
  const routePath = [[0, 0.001], [0.002, 0.001]];
  // Absent, explicit 'round' and an unrecognised value must all give the original
  // geometry. The check belongs here rather than in the UI because the worker is handed
  // arbitrary opts, and every other fixture in this file passes no profile at all.
  for (const routeMode of ['off', 'inlay', 'through', 'engrave', 'emboss']) {
    const base = TopoGeometry.buildGeometry(source({ samples: 120, slope: 4 }),
      options({ routeMode, routePath }));
    for (const routeProfile of ['round', 'bogus', undefined]) {
      const other = TopoGeometry.buildGeometry(source({ samples: 120, slope: 4 }),
        options({ routeMode, routePath, routeProfile }));
      const label = `${routeMode} / ${routeProfile}`;
      assert.deepEqual(other.pieces.map(p => p.pos), base.pieces.map(p => p.pos), label);
      assert.deepEqual((other.routeParts || []).map(p => p.pos),
                       (base.routeParts || []).map(p => p.pos), label);
    }
    // A rounded route still reaches the print bottom, which is what a floor of 0 means
    // — and is also what a model built before pockets reads back as.
    assert.equal(base.grid.routeFloorZ, 0);
    assert.equal(base.routeProfile, 'round');
  }
});
test('the flat profile cuts a flat groove floor and an even inlay ribbon', async () => {
  const routePath = [[0, 0.001], [0.002, 0.001]];   // north-south down x = 90 mm
  // 400 samples puts vertices 0.45 mm apart, fine enough to resolve the 0.64 mm chamfer.
  // At 120 the whole chamfer falls between two vertices and neither profile is visible.
  const build = (routeMode, routeProfile) => TopoGeometry.buildGeometry(source({ samples: 400 }),
    options({ routeMode, routePath, routeProfile, includeBuildings: false }));

  // Across the flat span the groove floor is a single level. A parabola is a curve and
  // cannot be, which is exactly why its insert only ever touched the bed along a line.
  const floorLevels = m => {
    const { Hv, VW, dx, dy, routeHalf } = m.grid;
    const { chamfer } = TopoGeometry.resolveRouteDims(m.opts, Math.hypot(dx, dy));
    const levels = new Set();
    for (let i = 0; i < VW; i++)
      if (Math.abs(i * dx - 90) <= routeHalf - chamfer) levels.add(Hv[200 * VW + i].toFixed(6));
    return levels.size;
  };
  assert.equal(floorLevels(build('engrave', 'flat')), 1);
  assert.ok(floorLevels(build('engrave', 'round')) > 1);

  // The profile changes the shape BETWEEN the extremes, not the extremes: both are 1 at
  // the centre and 0 at the edge, so the depth the slider asks for still lands exactly
  // and the model's height range is untouched.
  for (const routeMode of ['engrave', 'emboss'])
    assert.ok(Math.abs(build(routeMode, 'round').maxZ - build(routeMode, 'flat').maxZ) < 1e-9, routeMode);

  // A flat floor lies below the parabola everywhere off the centreline, so it takes more
  // material out of an engraved groove and puts more into an embossed ridge.
  assert.ok(await checkClosed(build('engrave', 'flat').pieces[0].pos)
          < await checkClosed(build('engrave', 'round').pieces[0].pos));
  assert.ok(await checkClosed(build('emboss', 'flat').pieces[0].pos)
          > await checkClosed(build('emboss', 'round').pieces[0].pos));

  // The insert's bottom already follows the grooved surface, so flattening the floor
  // gives it a flat underside for free — the same fact as the single floor level above,
  // measured on the part that actually gets printed.
  const insertVolume = async profile => {
    let v = 0;
    for (const r of build('inlay', profile).routeParts) v += await checkClosed(r.pos);
    return v;
  };
  const round = await insertVolume('round'), flat = await insertVolume('flat');
  assert.ok(flat > round * 1.05, `insert did not thicken: ${round} -> ${flat}`);
});
test('a flat through route stops at a floor plane and prints on a flat bottom', async () => {
  const routePath = [[0, 0.001], [0.002, 0.001]];
  const build = (src, opt) => TopoGeometry.buildGeometry(source(src), options({
    routeMode: 'through', routeProfile: 'flat', routePath, includeBuildings: false, ...opt }));

  /* Every configuration that puts a seam, a shape boundary or a coarse cell across the
     channel. Each is a distinct chance for the pocket's step wall to leave a T-junction
     where it meets a cell-boundary wall, and Manifold rejects those outright rather
     than tolerating them — so checkClosed here is the real proof the split is right. */
  for (const [name, src, opt] of [
    ['flat terrain', { samples: 60 }, {}],
    ['sloped', { samples: 60, slope: 4 }, {}],
    ['piece seams', { samples: 60, slope: 4 }, { nx: 2, ny: 2 }],
    ['shape boundary', { samples: 60, slope: 4 }, { frameStyle: 'circle' }],
    ['coarse grid', { samples: 24, slope: 4 }, {}],
    ['water and flatten', { samples: 60, slope: 4, water: true }, { flattenWater: true }],
  ]) {
    const m = build(src, opt);
    assert.ok(m.grid.routeFloorZ > 0, name);
    for (const p of m.pieces) if (p.pos.length) await checkClosed(p.pos);
    for (const r of m.routeParts) await checkClosed(r.pos);
  }

  const m = build({ samples: 60, slope: 4 }, {});
  const f = m.grid.routeFloorZ;
  // The plug's underside is one plane at the floor. That is the whole point of the
  // profile: it rests on a face, so it prints with supports off.
  let minZ = Infinity;
  for (const r of m.routeParts) for (let k = 2; k < r.pos.length; k += 3) minZ = Math.min(minZ, r.pos[k]);
  assert.ok(Math.abs(minZ - f) < 1e-9, `plug bottom ${minZ} is not the floor ${f}`);

  // Nothing of the terrain survives inside the channel above the floor — that is the
  // pocket — while the slab underneath is left whole.
  let above = 0, onFloor = 0;
  for (const p of m.pieces) for (let k = 0; k < p.pos.length; k += 3) {
    if (Math.abs(p.pos[k] - 90) >= m.grid.channelHalf - 1e-6) continue;
    if (p.pos[k + 2] > f + 1e-6) above++;
    if (Math.abs(p.pos[k + 2] - f) < 1e-9) onFloor++;
  }
  assert.equal(above, 0, 'terrain survives inside the channel above the pocket floor');
  assert.ok(onFloor > 0, 'no pocket floor was emitted');

  /* A cliff beside the channel is the case a naive floor gets wrong. The chord
     interpolates towards the low side, so a floor taken over the channel's own vertices
     can sit ABOVE it, inverting the step wall into a self-intersection that stays
     perfectly watertight and silently ADDS volume — checkClosed would pass. Bounding the
     floor by cell CORNERS is what prevents it, and only a volume check can prove it. */
  const cliff = build({ samples: 60, slope: 200 }, { vex: 5 });
  const noRoute = TopoGeometry.buildGeometry(source({ samples: 60, slope: 200 }),
    options({ routeMode: 'off', vex: 5, includeBuildings: false }));
  assert.ok(await checkClosed(cliff.pieces[0].pos) < await checkClosed(noRoute.pieces[0].pos),
    'the route added volume instead of removing it');

  // Too deep to leave a slab worth printing: fall back to the full-depth cut a through
  // route has always been, as one global decision the pieces and the plug both take.
  const deep = build({ samples: 60 }, { routeDepthMM: 3 });
  assert.equal(deep.grid.routeFloorZ, 0);
  const full = TopoGeometry.buildGeometry(source({ samples: 60 }), options({
    routeMode: 'through', routePath, includeBuildings: false, routeDepthMM: 3 }));
  assert.deepEqual(deep.pieces.map(p => p.pos), full.pieces.map(p => p.pos));
});
test('a partial-depth route keeps its bands adding up and buildings out of the pocket', async () => {
  const { exportSolids, fuseCity, kernel, fromSoup } = await city, api = await kernel();
  const volumeOf = pos => { const s = fromSoup(api, pos); const v = s.volume(); s.delete(); return v; };
  const routePath = [[0, 0.001], [0.002, 0.001]];

  /* Bands are horizontal slabs, so the floor plane sorts them three ways: below it the
     band never sees the route, above it the channel is a clean hole, and one band
     straddles and carries the step. Straddle it deliberately, with water and flatten on
     so the same assertion also covers capCell, the water step walls and the cap mesh. */
  const model = TopoGeometry.buildGeometry(source({ samples: 100, slope: 4, water: true }), options({
    flattenWater: true, includeBuildings: false, routeMode: 'through', routeProfile: 'flat', routePath }));
  const f = model.grid.routeFloorZ;
  assert.ok(f > 0);
  model.zCuts = [f - 0.5, f + 0.5]; model.NB = 3;
  const parts = await exportSolids(model);
  const volume = volumeOf(model.pieces[0].pos);
  let sum = 0;
  for (const pos of [parts[0].water, ...parts[0].bands]) if (pos.length) sum += volumeOf(pos);
  assert.ok(Math.abs(sum - volume) / volume < 1e-3, `bands ${sum} vs piece ${volume}`);

  /* A full-depth route leaves a gap in the slice fuseCity takes each piece's building
     domain from, which is what has kept buildings off it for free. A partial-depth route
     is solid at that height, so the corridor has to be subtracted explicitly — without
     that, buildings stand in the pocket. The fixture building spans x = 54..126 mm, so
     it straddles the route at x = 90. */
  const built = await fuseCity(TopoGeometry.buildGeometry(source({ samples: 40 }), options({
    nx: 2, routeMode: 'through', routeProfile: 'flat', routePath })));
  assert.ok(built.grid.routeFloorZ > 0);
  assert.ok(built.cityInfo.count > 0, 'no buildings were fused, so the check proves nothing');
  for (const p of built.pieces) await checkClosed(p.pos);
  for (const pos of built.citySolids) {
    if (!pos) continue;
    for (let k = 0; k < pos.length; k += 3)
      assert.ok(Math.abs(pos[k] - 90) >= built.grid.channelHalf - 1e-6,
        `a building reaches x=${pos[k]}, inside the route pocket`);
  }
});
test('the flat route part is planar top and bottom in every route mode', async () => {
  const routePath = [[0, 0.001], [0.002, 0.001]];   // north-south down x = 90 mm
  const T = 2;
  let first = null;
  /* 'off' is the point of the loop: the flat part is a separate download, so it must not
     depend on anything the terrain stamp did — and with the mode off there is no stamp,
     no grid.routeDist and no routeParts to lean on. */
  for (const routeMode of ['off', 'inlay', 'through', 'emboss', 'engrave']) {
    const model = TopoGeometry.buildGeometry(source({ samples: 40 }), options({ routeMode, routePath }));
    const mesh = TopoGeometry.buildFlatRouteMesh(model, T);
    assert.ok(mesh, `${routeMode} produced no flat route`);
    const volume = await checkClosed(mesh.pos);
    // The whole feature in one assertion: every vertex sits on one of exactly two planes.
    const z = new Set(Array.from(mesh.pos).filter((_, k) => k % 3 === 2));
    assert.deepEqual([...z].sort((a, b) => a - b), [0, T], `${routeMode} is not flat: ${[...z]}`);
    // Same part in every mode, so switching modes cannot silently resize the download.
    if (first === null) first = volume;
    else assert.ok(Math.abs(volume - first) / first < 1e-9, `${routeMode}: ${volume} vs ${first}`);
  }
});
test('flat route thickness scales the part and is clamped by the geometry', async () => {
  const model = TopoGeometry.buildGeometry(source({ samples: 40 }),
    options({ routeMode: 'off', routePath: [[0, 0.001], [0.002, 0.001]] }));
  const vol = t => checkClosed(TopoGeometry.buildFlatRouteMesh(model, t).pos);
  const [v1, v2, v4] = [await vol(1), await vol(2), await vol(4)];
  assert.ok(Math.abs(v2 / v1 - 2) < 1e-6, `${v2} / ${v1}`);
  assert.ok(Math.abs(v4 / v1 - 4) < 1e-6, `${v4} / ${v1}`);
  // Clamped by the geometry, not just the slider — the page is not the only caller.
  assert.ok(Math.abs((await vol(50)) / v1 - 10) < 1e-6);
  assert.ok(Math.abs((await vol(0)) / v1 - 0.4) < 1e-6);
  assert.ok(Math.abs((await vol(undefined)) / v1 - 2) < 1e-6);   // default thickness
});
test('the flat route follows the stamped width and the printed outline', async () => {
  const routePath = [[0, 0.001], [0.002, 0.001]];
  // A grid fine enough to carry the asked width: the plate is then exactly
  // width x length x thickness, which pins the corridor to the route slider.
  const fine = TopoGeometry.buildGeometry(source({ samples: 400 }),
    options({ routeMode: 'off', routePath, routeWidthMM: 3.2 }));
  assert.equal(fine.grid.routeHalf, 1.6);
  const got = await checkClosed(TopoGeometry.buildFlatRouteMesh(fine, 2).pos);
  const want = 3.2 * fine.modelDepth * 2;
  assert.ok(Math.abs(got - want) / want < 1e-5, `${got} vs ${want}`);
  // Too thin for the grid: the plate takes the width the terrain was actually stamped
  // with, so the part still matches the route on the print.
  const coarse = TopoGeometry.buildGeometry(source({ samples: 40 }),
    options({ routeMode: 'off', routePath, routeWidthMM: 0.6 }));
  assert.ok(coarse.grid.routeHalf > 0.3);
  const thin = await checkClosed(TopoGeometry.buildFlatRouteMesh(coarse, 2).pos);
  const thinWant = coarse.grid.routeHalf * 2 * coarse.modelDepth * 2;
  assert.ok(Math.abs(thin - thinWant) / thinWant < 1e-5, `${thin} vs ${thinWant}`);
  // Clipped to the print shape exactly as the stamped route is, so a plate cannot run
  // out past the terrain it belongs to.
  const square = await checkClosed(TopoGeometry.buildFlatRouteMesh(
    TopoGeometry.buildGeometry(source({ samples: 60 }),
      options({ routeMode: 'off', routePath: [[0, 0.0018], [0.002, 0.0018]] })), 2).pos);
  for (const frameStyle of ['circle', 'hex']) {
    const clipped = await checkClosed(TopoGeometry.buildFlatRouteMesh(
      TopoGeometry.buildGeometry(source({ samples: 60 }),
        options({ routeMode: 'off', routePath: [[0, 0.0018], [0.002, 0.0018]], frameStyle })), 2).pos);
    assert.ok(clipped < square * 0.95, `${frameStyle} did not clip: ${clipped} vs ${square}`);
  }
});
test('the flat route is absent rather than empty when there is no route on the print', async () => {
  const none = TopoGeometry.buildGeometry(source(), options());
  assert.equal(TopoGeometry.buildFlatRouteMesh(none, 2), null);
  // A single point is not a path, and neither is a route the box does not cover.
  const one = TopoGeometry.buildGeometry(source(), options({ routePath: [[0.001, 0.001]] }));
  assert.equal(TopoGeometry.buildFlatRouteMesh(one, 2), null);
  const outside = TopoGeometry.buildGeometry(source(), options({ routePath: [[0.5, 0.5], [0.6, 0.6]] }));
  assert.equal(TopoGeometry.buildFlatRouteMesh(outside, 2), null);
});
