import Module from './vendor/manifold-3d/manifold.js';
import './geometry-core.js';
import './buildings.js';

let ready;
export async function kernel() {
  if (!ready) ready = Module({ locateFile: file => new URL(`./vendor/manifold-3d/${file}`, import.meta.url).href }).then(m => { m.setup(); return m; });
  return ready;
}

export function fromSoup(api, pos) {
  const vertices = [], indices = [], lookup = new Map();
  for (let k = 0; k < pos.length; k += 9) {
    const ids = [];
    for (let v = 0; v < 3; v++) {
      const p = k + v * 3;
      const xyz = [Math.fround(pos[p]), Math.fround(pos[p + 1]), Math.fround(pos[p + 2])];
      if (!xyz.every(Number.isFinite)) throw new Error('errCityGeometry');
      const key = xyz.join(',');
      let index = lookup.get(key);
      if (index === undefined) { index = vertices.length / 3; vertices.push(...xyz); lookup.set(key, index); }
      ids.push(index);
    }
    if (new Set(ids).size === 3) indices.push(...ids);
  }
  const mesh = new api.Mesh({ numProp: 3, vertProperties: new Float32Array(vertices), triVerts: new Uint32Array(indices) });
  mesh.merge();
  const solid = api.Manifold.ofMesh(mesh);
  if (solid.status() !== 'NoError') { solid.delete(); throw new Error('errCityGeometry'); }
  return solid;
}

export function toSoup(solid) {
  if (solid.status() !== 'NoError') throw new Error('errCityGeometry');
  const mesh = solid.getMesh(), pos = new Float32Array(mesh.triVerts.length * 3), nrm = new Float32Array(pos.length);
  for (let i = 0; i < mesh.triVerts.length; i++) {
    const v = mesh.triVerts[i] * mesh.numProp;
    pos[i * 3] = mesh.vertProperties[v]; pos[i * 3 + 1] = mesh.vertProperties[v + 1]; pos[i * 3 + 2] = mesh.vertProperties[v + 2];
  }
  for (let i = 0; i < pos.length; i += 9) {
    const ux = pos[i + 3] - pos[i], uy = pos[i + 4] - pos[i + 1], uz = pos[i + 5] - pos[i + 2];
    const vx = pos[i + 6] - pos[i], vy = pos[i + 7] - pos[i + 1], vz = pos[i + 8] - pos[i + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, length = Math.hypot(nx, ny, nz) || 1;
    for (let v = 0; v < 3; v++) { nrm[i + v * 3] = nx / length; nrm[i + v * 3 + 1] = ny / length; nrm[i + v * 3 + 2] = nz / length; }
  }
  return { pos, nrm };
}

function projectedFeature(feature, model) {
  const [[s, w], [n, e]] = model.src.bounds;
  return feature.polygons.map(poly => poly.map(ring => ring.map(([lon, lat]) => [
    (lon - w) / (e - w) * model.modelWidth, (lat - s) / (n - s) * model.modelDepth,
  ])));
}

function groundAt(model, x, y) {
  const g = model.grid, gx = Math.max(0, Math.min(g.W, x / g.dx)), gy = Math.max(0, Math.min(g.D, (model.modelDepth - y) / g.dy));
  const i = Math.min(g.W - 1, Math.floor(gx)), j = Math.min(g.D - 1, Math.floor(gy)), fx = gx - i, fy = gy - j;
  const a = g.Hv[j * g.VW + i], b = g.Hv[j * g.VW + i + 1], c = g.Hv[(j + 1) * g.VW + i], d = g.Hv[(j + 1) * g.VW + i + 1];
  // Same diagonal as the terrain top triangles, not a bilinear approximation.
  const h = fx >= fy ? a + fx * (b - a) + fy * (d - b) : a + fx * (d - c) + fy * (c - a);
  return g.baseMM + (h - model.minE) * g.zScale;
}

function roofGround(model, polygons) {
  let top = -Infinity;
  const g = model.grid;
  for (const rings of polygons) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const ring of rings) for (const [x, y] of ring) {
      top = Math.max(top, groundAt(model, x, y));
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    for (let j = Math.max(0, Math.floor((model.modelDepth - y1) / g.dy)); j <= Math.min(g.D, Math.ceil((model.modelDepth - y0) / g.dy)); j++) {
      for (let i = Math.max(0, Math.floor(x0 / g.dx)); i <= Math.min(g.W, Math.ceil(x1 / g.dx)); i++) {
        const p = [i * g.dx, model.modelDepth - j * g.dy];
        if (TopoBuildings.inPolygon(p, rings)) top = Math.max(top, groundAt(model, ...p));
      }
    }
  }
  return top;
}

export async function fuseCity(model, progress = () => {}) {
  const data = model.src.buildings || { features: [], status: 'off', invalid: 0 };
  model.cityInfo = { status: data.status, count: 0, estimated: 0, invalid: data.invalid || 0 };
  if (!data.features.length || !model.opts.includeBuildings) return model;
  const api = await kernel(), { CrossSection, Manifold } = api;
  const owned = [], own = x => { owned.push(x); return x; };
  try {
    const solids = model.pieces.map(p => p.pos.length ? own(fromSoup(api, p.pos)) : null);
    // Every piece has a flat base; slicing it also preserves full-depth routes.
    const outlines = solids.map(s => s ? own(s.slice(model.grid.baseMM * 0.5)) : null);
    let routeClearance = null;
    if (model.routeParts?.length && model.routeMode === 'inlay') {
      const projections = model.routeParts.map(p => own(own(fromSoup(api, p.pos)).project()));
      routeClearance = own(CrossSection.union(projections));
    } else if (['engrave', 'emboss'].includes(model.routeMode) && model.opts.routePath?.length > 1) {
      const [[s, w], [n, e]] = model.src.bounds;
      const pts = model.opts.routePath.map(([lat, lon]) => [(lon - w) / (e - w) * model.modelWidth, (lat - s) / (n - s) * model.modelDepth]);
      const strips = [];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (!len) continue;
        const dx = (b[1] - a[1]) / len * 0.9, dy = -(b[0] - a[0]) / len * 0.9;
        strips.push(own(new CrossSection([[[a[0] + dx, a[1] + dy], [b[0] + dx, b[1] + dy], [b[0] - dx, b[1] - dy], [a[0] - dx, a[1] - dy]]], 'EvenOdd')));
        strips.push(own(own(CrossSection.circle(0.9, 16)).translate(a)), own(own(CrossSection.circle(0.9, 16)).translate(b)));
      }
      if (strips.length) routeClearance = own(CrossSection.union(strips));
    }
    const domains = outlines.map(c => c && routeClearance ? own(c.subtract(routeClearance)) : c);
    const additions = model.pieces.map(() => []);
    const metreScale = model.grid.zScale / model.opts.vex;
    for (let k = 0; k < data.features.length; k++) {
      const feature = data.features[k], polygons = projectedFeature(feature, model);
      const footprint = own(CrossSection.union(polygons.map(p => own(new CrossSection(p, 'EvenOdd')))));
      if (footprint.isEmpty()) { model.cityInfo.invalid++; continue; }
      const roof = roofGround(model, polygons) + feature.heightM * metreScale * model.opts.buildingScale;
      let included = false;
      for (let p = 0; p < domains.length; p++) {
        if (!domains[p]) continue;
        const clipped = footprint.intersect(domains[p]);
        if (!clipped.isEmpty()) {
          // Foundation reaches the flat base, so no floating buildings or slope gaps.
          additions[p].push(own(clipped.extrude(roof))); included = true;
        }
        clipped.delete();
      }
      if (included) {
        model.cityInfo.count++; model.maxZ = Math.max(model.maxZ, roof);
        if (feature.heightSource !== 'height') model.cityInfo.estimated++;
      }
      if (k % 25 === 0) progress('pgCity', { done: k + 1, total: data.features.length });
    }
    model.citySolids = [];
    for (let p = 0; p < solids.length; p++) {
      if (!additions[p].length) { model.citySolids.push(null); continue; }
      const buildings = own(Manifold.union(additions[p]));
      model.citySolids.push(toSoup(buildings).pos);
      const fused = own(solids[p].add(buildings));
      Object.assign(model.pieces[p], toSoup(fused));
      const P = model.pieces[p]; let sx = 0, sy = 0;
      for (let i = 0; i < P.pos.length; i += 3) { sx += P.pos[i]; sy += P.pos[i + 1]; }
      P.cx = sx / (P.pos.length / 3); P.cy = sy / (P.pos.length / 3);
      P.col = new Float32Array(P.pos.length);
    }
    model.triCount = model.pieces.reduce((sum, p) => sum + p.pos.length / 9, 0) + (model.routeParts || []).reduce((sum, p) => sum + p.pos.length / 9, 0);
    return model;
  } finally { for (let i = owned.length - 1; i >= 0; i--) owned[i].delete(); }
}

export async function exportSolids(model, progress = () => {}) {
  const G = TopoGeometry, output = [];
  // Existing terrain-only exports keep their established water/band construction.
  if (!model.cityInfo?.count) {
    for (const p of model.pieces) output.push({ id: p.id, water: model.hasWater ? G.buildWaterCapMesh(model, p.id) : [],
      bands: Array.from({ length: model.NB }, (_, b) => G.buildBandSolidMesh(model, p.id, b)) });
    return output;
  }
  const api = await kernel();
  for (const piece of model.pieces) {
    const owned = [], own = x => { owned.push(x); return x; };
    try {
      if (!piece.pos.length) { output.push({ id: piece.id, water: [], bands: Array.from({ length: model.NB }, () => []) }); continue; }
      const fused = own(fromSoup(api, piece.pos));
      let water = null, land = fused;
      const waterPos = model.hasWater ? G.buildWaterCapMesh(model, piece.id) : [];
      if (waterPos.length) {
        water = own(own(fromSoup(api, waterPos)).intersect(fused));
        if (model.citySolids[piece.id]) water = own(water.subtract(own(fromSoup(api, model.citySolids[piece.id]))));
        land = own(fused.subtract(water));
      }
      const bands = [];
      for (let b = 0; b < model.NB; b++) {
        let slab = land;
        if (b > 0) slab = own(slab.trimByPlane([0, 0, 1], model.zCuts[b - 1]));
        if (b < model.NB - 1) slab = own(slab.trimByPlane([0, 0, -1], -model.zCuts[b]));
        bands.push(toSoup(slab).pos);
      }
      output.push({ id: piece.id, water: water ? toSoup(water).pos : [], bands });
      progress('pgCityExport', { done: output.length, total: model.pieces.length });
    } finally { for (let i = owned.length - 1; i >= 0; i--) owned[i].delete(); }
  }
  return output;
}
