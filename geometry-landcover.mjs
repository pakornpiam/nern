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

/* Spread each mapped land type outward by one cell per round. classify() samples cell
   CENTRES, so a wood covering much of a cell but missing its centre vanishes outright --
   and a cell is selection width over detail, hundreds of metres on a large selection.
   This closes the gaps between the fragments that survive. It spreads what OSM mapped; it
   invents nothing where nothing is mapped. */
export const MAX_GROW = 5;
export function growCategories(cells, W, D, rounds, shape, CODE, OTHER) {
  /* Per code, so each land type reaches its own distance; a plain number means all of them.
     Densified either way: a gap in a sparse array would make total NaN and quietly grow
     nothing at all. */
  const per = Array.from({ length: OTHER + 1 }, (_, c) => (c <= CODE.water || c >= OTHER) ? 0
    : Math.max(0, (typeof rounds === 'number' ? rounds : rounds[c]) | 0));
  const total = Math.max(0, ...per);
  for (let r = 0; r < total; r++) {
    const src = cells.slice();   // one snapshot per round, so growth advances exactly one cell
    for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i;
      // Only unmapped ground is ever written, and never outside the printed footprint --
      // those cells have to stay OTHER or the merged domain would claim ground the piece
      // does not have.
      if (src[k] !== OTHER || !shape[k]) continue;
      let best = OTHER;
      /* Water is measured, not guessed: spreading it would move a real shoreline, so it is
         never a source. Otherwise the lowest code wins, the same precedence classify() uses
         where polygons overlap. Four neighbours, not eight -- a diagonal step covers 1.41
         cells and leaves the checkerboards buildCapCellMask has to bridge. */
      const take = nb => { if (nb > CODE.water && nb < best && r < per[nb]) best = nb; };
      if (i > 0) take(src[k - 1]);
      if (i + 1 < W) take(src[k + 1]);
      if (j > 0) take(src[k - W]);
      if (j + 1 < D) take(src[k + W]);
      if (best < OTHER) cells[k] = best;
    }
  }
  return cells;
}

const emptyMesh = () => ({ pos: new Float32Array(), nrm: new Float32Array() });

/* How thick the coloured skin is, measured PERPENDICULAR to the ground rather than
   vertically. The difference is the whole point, and it decides whether the colour
   survives the slicer.

   The skin is cut by subtracting a lowered copy of the terrain. Lower it straight down by
   0.8 mm and the skin is 0.8 mm thick VERTICALLY, so at any slicing layer the coloured
   ribbon is only 0.8 / slope wide -- and the model's slope is the real slope times the
   vertical exaggeration, because X/Y and Z both scale by mmPerMeter and only Z is then
   multiplied by vex. At the default vex of 2.5 a 22 degree hillside leaves 0.8 mm, a 39
   degree one leaves 0.4 mm -- a single extrusion -- and anything steeper is below one
   extrusion width, which Bambu Studio drops outright. Snow is the category that paid for
   it: a snow line puts snow on the highest and steepest ground in the model by
   construction, so it sliced away to nothing while the app's own preview showed it
   perfectly, and forest and grass on gentler ground survived.

   Dropping by SKIN_MM * sqrt(1 + |grad z|^2) instead gives a skin SKIN_MM thick
   perpendicular to the surface. The ribbon at a layer is then SKIN_MM * sqrt(1 + 1/s^2),
   which is at least SKIN_MM on ANY slope at ANY exaggeration, and on flat ground the
   factor is exactly 1 -- so level terrain keeps precisely the geometry it had before. */
export const SKIN_MM = 0.8;

/* Vertical drop per grid vertex, in model mm. Per axis it takes the STEEPER of the two
   adjacent cells rather than a central difference: the vertex is shared by the triangles on
   both sides, and it is the steeper of them whose ribbon is at risk -- a central difference
   averages exactly the spike that has to print away. `ceiling` is a sanity stop for a cliff
   that drops a whole tile in one cell; the skin is trimmed at skinFloorZ regardless, so a
   drop deeper than the model is tall can only cost boolean work. */
export function skinDropField(g, skin = SKIN_MM, ceiling = Infinity) {
  const { Hv, W, D, VW, dx, dy, zScale } = g, VD = D + 1;
  const drop = new Float32Array(VW * VD);
  for (let j = 0; j < VD; j++) for (let i = 0; i < VW; i++) {
    const k = j * VW + i, h = Hv[k];
    const gx = Math.max(i > 0 ? Math.abs(h - Hv[k - 1]) : 0, i < W ? Math.abs(Hv[k + 1] - h) : 0) * zScale / dx;
    const gy = Math.max(j > 0 ? Math.abs(h - Hv[k - VW]) : 0, j < D ? Math.abs(Hv[k + VW] - h) : 0) * zScale / dy;
    drop[k] = Math.min(ceiling, skin * Math.hypot(1, gx, gy));
  }
  return drop;
}

/* Bilinear, and a pure function of (x, y) -- which is what keeps the sheared mesh closed.
   A wall's top and bottom vertex, and the two cells meeting at a seam, share an (x, y) and
   so are guaranteed the identical drop. Same grid indexing as groundAt in geometry-city. */
function dropAt(drop, g, x, y) {
  const gx = Math.min(Math.max(x / g.dx, 0), g.W), gy = Math.min(Math.max((g.modelDepth - y) / g.dy, 0), g.D);
  const i = Math.min(g.W - 1, Math.floor(gx)), j = Math.min(g.D - 1, Math.floor(gy));
  const fx = gx - i, fy = gy - j, k = j * g.VW + i;
  return drop[k] * (1 - fx) * (1 - fy) + drop[k + 1] * fx * (1 - fy) +
    drop[k + g.VW] * (1 - fx) * fy + drop[k + g.VW + 1] * fx * fy;
}

/* The lowered terrain, as a vertical shear (x, y, z) -> (x, y, z - drop(x, y)) of the piece
   rather than a translate. A shear is a bijection of space, so it cannot introduce a
   self-intersection; the piece's base is tessellated cell by cell on the same grid as its
   top, so the sheared copy stays closed; walls, whose two ends share an (x, y), stay
   vertical; and the sheared base sits below the sheared top everywhere because the original
   top is always above z = 0. */
function loweredSoup(pos, drop, g) {
  const out = new Float32Array(pos.length);
  for (let k = 0; k < pos.length; k += 3) {
    out[k] = pos[k]; out[k + 1] = pos[k + 1];
    out[k + 2] = pos[k + 2] - dropAt(drop, g, pos[k], pos[k + 1]);
  }
  return out;
}

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
  // 'partial' means some map requests failed; the model is built from what arrived and
  // detailNotes names the gap, rather than throwing away the tiles that did come back.
  if (!data || !['ok', 'empty', 'partial'].includes(data.status)) throw new Error('errLandcoverFetch');
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
  const mapped = counts[CODE.snow] + counts[CODE.forest] + counts[CODE.grass];
  /* Spread AFTER counting, and after water. After counting because the coverage note is
     quoted as what OSM actually mapped, and growth must not quietly inflate it. After
     water because growth writes only into unmapped ground, which is what leaves the
     shoreline exactly where the water mask put it. */
  /* Leave solid material under the colour, but never so much that no colour is left. The
     old fixed 1 mm was exactly MIN_ROUTE_FLOOR, so a flat through route -- which follows the
     LOWEST ground by nature -- had its bed trimmed to nothing at the DEFAULT base, and a
     1 mm base lost its colour everywhere the ground sat near the model minimum. Trim just
     under the lowest surface that actually has to carry colour instead. */
  const lowestSurface = Math.min(g.baseMM, g.routeFloorZ > 0 ? g.routeFloorZ : Infinity);
  const skinFloorZ = Math.max(0.2, Math.min(1, lowestSurface - 0.2));
  /* One field for the whole model: the shear only depends on the height grid, and every
     piece reads the same grid. The trim above is what keeps a deep drop harmless, so the
     ceiling here is only a stop against absurd coordinates. */
  const skinDrop = skinDropField(g, SKIN_MM, model.maxZ + 1);
  const grow = model.opts?.landGrowCells;
  const rounds = Array.from({ length: OTHER + 1 }, (_, c) => (c <= CODE.water || c >= OTHER) ? 0
    : Math.max(0, Math.min(MAX_GROW, (typeof grow === 'number' ? grow : grow?.[CATEGORIES[c]]) | 0)));
  const growing = rounds.some(v => v > 0);
  let colored = null;
  if (growing) {
    growCategories(cells, g.W, g.D, rounds, g.cellShape, CODE, OTHER);
    colored = 0;
    for (let k = 0; k < cells.length; k++) {
      if (g.cellShape[k] && cells[k] !== OTHER && cells[k] !== CODE.water) colored++;
    }
  }
  model.landcoverInfo = { status: data.status, invalid: data.invalid,
    vegetationPercent: pct(counts[CODE.forest] + counts[CODE.grass]),
    snowPercent: pct(counts[CODE.snow]), hasSnow: counts[CODE.snow] > 0, snowLineM: snowLine,
    mappedPercent: pct(mapped), coloredPercent: growing ? pct(colored) : null, skinFloorZ,
    growCells: Object.fromEntries(CATEGORIES.slice(1, OTHER).map(c => [c, rounds[CODE[c]]])),
    missing: data.missing || 0, tiles: data.tiles || 1 };
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
          const fused = solidOf(piece.pos);
          const lowered = solidOf(loweredSoup(terrainPieces[piece.id], skinDrop, g));
          // Use the fused top surface, whose vertices have already made the city's
          // float32 round trip, so the skin and remainder share exactly that top.
          let shell = keep(keep(fused.subtract(lowered)).trimByPlane([0, 0, 1], skinFloorZ));
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
