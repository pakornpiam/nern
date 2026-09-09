import './landcover.js';
import { kernel, fromSoup, toSoup } from './geometry-city.mjs';

// Coalesce equal horizontal runs across rows before constructing cross sections.
export function cellRectangles(cells, W, D, kind) {
  const rectangles = []; let active = new Map();
  for (let j = 0; j < D; j++) {
    const next = new Map();
    for (let i = 0; i < W;) {
      if (cells[j * W + i] !== kind) { i++; continue; }
      const start = i;
      while (i < W && cells[j * W + i] === kind) i++;
      const key = `${start}:${i}`, rect = active.get(key) || [start, j, i, j];
      rect[3] = j + 1; next.set(key, rect); active.delete(key);
    }
    rectangles.push(...active.values()); active = next;
  }
  rectangles.push(...active.values()); return rectangles;
}

const emptyMesh = () => ({ pos: new Float32Array(), nrm: new Float32Array() });

// A category edge that lands exactly on a piece seam leaves zero-thickness flaps in
// the boolean result. They enclose nothing, so the kernel ignores them, but a
// triangle soup cannot tell a flap from a real surface: reloading the mesh welds it
// into the shell beside it and swallows part of that shell. Export only the
// components that actually hold volume.
function solidSoup(api, solid) {
  const components = solid.decompose();
  try {
    const solids = components.filter(c => c.volume() > 1e-6);
    if (solids.length === components.length) return toSoup(solid);
    if (!solids.length) return emptyMesh();
    const kept = api.Manifold.compose(solids);
    try { return toSoup(kept); } finally { kept.delete(); }
  } finally { for (const c of components) c.delete(); }
}

export async function buildLandcover(model, terrainPieces, progress = () => {}) {
  const api = await kernel(), g = model.grid, data = model.src.landcover;
  if (!data || !['ok', 'empty'].includes(data.status)) throw new Error('errLandcoverFetch');
  const { CODE, OTHER, CATEGORIES } = TopoLandcover;
  const cells = TopoLandcover.classify(data, model.src.bounds, g.W, g.D);
  const water = model.waterOff ? null : TopoGeometry.buildCapCellMask(g.water, g.W, g.D, g.VW);
  /* An altitude the user chose, in metres above sea level -- the same units and the same
     grid applyWaterLevel compares against. null when the control is off. An embossed
     route raises Hv before this runs, so a cell within the ridge height of the line can
     flip to snow: a one-cell fringe along a route lying exactly on it, not a bug. */
  const snowLine = Number.isFinite(model.opts?.snowLineM) ? model.opts.snowLineM : null;
  const counts = new Int32Array(CATEGORIES.length);
  let selected = 0;
  for (let k = 0; k < cells.length; k++) {
    if (!g.cellShape[k]) { cells[k] = OTHER; continue; }
    selected++;
    if (snowLine !== null) {
      const i = k % g.W, j = (k / g.W) | 0;
      /* The mean of the four corners IS the bilinear height at the cell CENTRE, which is
         the point classify() tests polygons against -- so the altitude rule answers the
         same question the OSM rule does. Unconditional rather than only over unmapped
         ground: a snow line that mapped vegetation could veto comes out moth-eaten
         wherever OSM draws a treeline. */
      const h = (g.Hv[j * g.VW + i] + g.Hv[j * g.VW + i + 1] +
        g.Hv[(j + 1) * g.VW + i] + g.Hv[(j + 1) * g.VW + i + 1]) / 4;
      if (h >= snowLine) cells[k] = CODE.snow;
    }
    if (water?.[k]) cells[k] = CODE.water;   // stamped last, so water always wins
    counts[cells[k]]++;
  }
  const pct = n => (selected ? 100 * n / selected : 0);
  model.landcoverInfo = { status: data.status, invalid: data.invalid,
    vegetationPercent: pct(counts[CODE.forest] + counts[CODE.grass]),
    snowPercent: pct(counts[CODE.snow]), hasSnow: counts[CODE.snow] > 0, snowLineM: snowLine };
  model.materialMeshes = [];
  const owned = [], own = x => { owned.push(x); return x; };
  try {
    const domainOf = (mask, kind) => {
      const rects = cellRectangles(mask, g.W, g.D, kind);
      if (!rects.length) return null;
      const rings = rects.map(([x0, y0, x1, y1]) => {
        // Match fromSoup's float32 terrain coordinates. Sub-ULP slivers along
        // outer edges otherwise produce unstable coplanar boolean cuts.
        const left = Math.fround(x0 * g.dx), right = Math.fround(x1 * g.dx);
        const bottom = Math.fround(model.modelDepth - y1 * g.dy), top = Math.fround(model.modelDepth - y0 * g.dy);
        return [[left, bottom], [right, bottom], [right, top], [left, top]];
      });
      return own(own(new api.CrossSection(rings, 'NonZero')).extrude(model.maxZ + 1));
    };
    const domains = Array.from({ length: OTHER }, (_, kind) => domainOf(cells, kind));
    // The leftover is cut with the three categories merged into ONE region, in 2D
    // where the seams between them dissolve. Removing them one at a time — or as a
    // 3D union, which keeps those seams — leaves the leftover touching itself at the
    // vertex where a category edge meets a building wall. A triangle soup cannot
    // record that: reloading it welds the seam shut and swallows its neighbour.
    // The 0 here is cellRectangles' kind selector, not the water category -- incidental.
    const coveredDomain = domainOf(Uint8Array.from(cells, c => (c === OTHER ? OTHER : 0)), 0);
    for (const piece of model.pieces) {
      const materials = Object.fromEntries(CATEGORIES.map(c => [c, emptyMesh()]));
      if (piece.pos.length) {
        const local = [], keep = x => { local.push(x); return x; };
        try {
          // The city's mesh has already been rounded to float32; resolve tiny
          // coplanar differences well below the export's 0.008 mm resolution.
          const solidOf = pos => keep(keep(fromSoup(api, pos)).setTolerance(0.0001));
          const terrain = solidOf(terrainPieces[piece.id]);
          const fused = solidOf(piece.pos);
          const lowered = keep(terrain.translate([0, 0, -0.8]));
          // Use the fused top surface, whose vertices have already made the city's
          // float32 round trip, so the skin and remainder share exactly that top.
          let shell = keep(keep(fused.subtract(lowered)).trimByPlane([0, 0, 1], 1));
          if (model.citySolids?.[piece.id]?.length) shell = keep(shell.subtract(solidOf(model.citySolids[piece.id])));
          // The skin already lies inside the fused piece, so each domain's slice of it
          // is the finished part; the leftover keeps everything the merged skin misses.
          for (let kind = 0; kind < OTHER; kind++) {
            if (domains[kind]) materials[CATEGORIES[kind]] = solidSoup(api, keep(shell.intersect(domains[kind])));
          }
          materials[CATEGORIES[OTHER]] = solidSoup(api, coveredDomain ? keep(fused.subtract(keep(shell.intersect(coveredDomain)))) : fused);
        } finally { for (let i = local.length - 1; i >= 0; i--) local[i].delete(); }
      }
      model.materialMeshes.push({ id: piece.id, materials });
      progress('pgLandcoverGeometry', { done: model.materialMeshes.length, total: model.pieces.length });
    }
  } finally { for (let i = owned.length - 1; i >= 0; i--) owned[i].delete(); }
  return model;
}
