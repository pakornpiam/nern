/* Pure geometry shared by the page, worker, and fixture tests. */
(function(root) {
'use strict';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const t = key => key;
const normLevel = L => (isFinite(L) ? L : 0.3);
const levelF32 = L => Math.fround(normLevel(L));
const WATER_CAP_MM = 0.8; // thickness of the blue water skin in the 3MF

const CLIP_EPS = 1e-7;

const THROUGH_ROUTE_RAISE = 0.6; // routeTop:'raised' lift, a finish choice, not a dimension

// Route dimension defaults (mm): full width, groove depth / ridge height, and the
// through-route's per-side assembly clearance. These are the numbers the fixed
// THROUGH_ROUTE_HALF/THROUGH_CHANNEL_HALF constants carried, so a route left at the
// slider defaults prints exactly as it always did.
const ROUTE_W = 3.2, ROUTE_D = 1.2, ROUTE_C = 0.2;

/* Resolved once per build, then carried on model.grid: buildBandSolidMesh and
   buildWaterCapMesh re-cut the same channel for the banded and water-skin exports
   but only ever receive `model`, and fuseCity needs the shallow half-width to keep
   buildings off the route. All of them must agree with the terrain that was cut.
   The fields are optional on purpose — the worker takes arbitrary opts, and the
   fixture options() in the tests passes none of them. */
function resolveRouteDims(opts = {}, cellDiagonal = 0) {
  const n = (v, d) => (Number.isFinite(+v) ? +v : d);
  const width = clamp(n(opts.routeWidthMM, ROUTE_W), 0.6, 12);
  /* The route is only ever tested at grid VERTICES, so one thinner than the vertex
     spacing can pass cleanly between two columns and touch nothing: no groove, no
     insert, no route part, and no warning either, since its coordinates are inside
     the area. Floor the stamp at what the grid can actually carry. Half the cell
     diagonal is the worst case over every route orientation. */
  const asked = width / 2;
  const halfW = Math.max(asked, cellDiagonal / 2);
  return {
    halfW,                                                // shallow stamp + through route
    askedHalfW: asked,                                    // caller reports the difference
    depth: clamp(n(opts.routeDepthMM, ROUTE_D), 0.2, 3),  // magnitude; the mode picks the sign
    channelHalf: halfW + clamp(n(opts.routeClearMM, ROUTE_C), 0, 0.8)
  };
}
const DEFAULT_CHANNEL_HALF = ROUTE_W / 2 + ROUTE_C; // fallback for models built before route dims

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > lat) !== (b[1] > lat) &&
        lon < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function pointInRegion(lon, lat, polygons) {
  for (const p of polygons || []) {
    const [w, s, e, n] = p.bbox;
    if (lon < w || lon > e || lat < s || lat > n || !pointInRing(lon, lat, p.rings[0])) continue;
    let inHole = false;
    for (let r = 1; r < p.rings.length; r++) if (pointInRing(lon, lat, p.rings[r])) { inHole = true; break; }
    if (!inHole) return true;
  }
  return false;
}

function haversine(la1, lo1, la2, lo2) {
  const R = 6371000, toR = Math.PI / 180;
  const dLa = (la2 - la1) * toR, dLo = (lo2 - lo1) * toR;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * toR) * Math.cos(la2 * toR) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* Rasterize lat/lon rings onto the vertex grid. All rings share one crossing
   list per row and one global parity — that is what makes islands and abutting
   riverbanks come out right, so they must not be filled ring by ring. */
function rasterizeWaterRings(latLonRings, bounds, W, D, VW, VD, water) {
  const [[latS, lonW], [latN, lonE]] = bounds;
  const toGX = lon => (lon - lonW) / (lonE - lonW) * W;
  const toGY = lat => (latN - lat) / (latN - latS) * D;
  const rings = [];
  for (const ll of latLonRings || []) {
    const ring = ll.map(pt => [toGX(pt[0]), toGY(pt[1])]);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of ring) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    if (x1 - x0 < 0.7 && y1 - y0 < 0.7) continue; // smaller than a grid cell
    rings.push(ring);
  }
  if (!rings.length) return false;

  let any = false;
  for (let jv = 0; jv < VD; jv++) {
    const xs = [];
    for (const ring of rings) {
      for (let k = 0; k + 1 < ring.length; k++) {
        const [ax, ay] = ring[k], [bx, by] = ring[k + 1];
        if ((ay <= jv && by > jv) || (by <= jv && ay > jv)) {
          xs.push(ax + (jv - ay) * (bx - ax) / (by - ay));
        }
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(xs[k])), i1 = Math.min(W, Math.floor(xs[k + 1]));
      for (let i = i0; i <= i1; i++) { water[jv * VW + i] = 1; any = true; }
    }
  }
  return any;
}

/* Inside test for the print/plate shapes, centered at origin, half-extents
   hw × hh. 'circle' is an ellipse when the footprint isn't square; 'hex' is
   flat-top, inscribed. Anything else = full rectangle. */
function shapeInsideFn(style, hw, hh) {
  if (style === 'circle') return (x, y) => (x * x) / (hw * hw) + (y * y) / (hh * hh) <= 1;
  if (style === 'hex') {
    const s3 = Math.sqrt(3), R = Math.min(hw, 2 * hh / s3);
    return (x, y) => Math.abs(y) <= s3 * R / 2 && s3 * Math.abs(x) + Math.abs(y) <= s3 * R;
  }
  if (style === 'square') {
    const s = Math.min(hw, hh); // true square, centered
    return (x, y) => Math.abs(x) <= s && Math.abs(y) <= s;
  }
  return (x, y) => Math.abs(x) <= hw && Math.abs(y) <= hh; // rectangle
}

/* ============================================================================
   JIGSAW PARTITION
   Assign each grid cell (i,j) to a puzzle piece. Straight piece boundaries are
   perturbed by mushroom-shaped tabs so neighboring pieces interlock. Because
   both pieces evaluate the SAME tab, one piece's tab is exactly the other's
   cavity → guaranteed fit.
   ============================================================================ */
function buildPartition(W, D, nx, ny) {
  const cwC = W / nx, chC = D / ny;               // cells per piece
  const neckHalf = 0.10, headR = 0.185, neckLen = 0.16, headOff = 0.24; // fractions of cell-block

  // Tab that straddles a vertical boundary (between columns) at bx, centered cy.
  function inColTab(x, y, bx, cy, dir, seg) {
    const nh = neckHalf * seg, hr = headR * seg, nl = neckLen * cwC, ho = headOff * cwC;
    const dx = (x - bx) * dir; // >0 means on the "into neighbor" side
    const inNeck = dx >= -0.001 && dx <= nl && Math.abs(y - cy) <= nh;
    const hcx = bx + dir * ho;
    const inHead = dx >= -0.001 && ((x - hcx) ** 2 + (y - cy) ** 2) <= hr * hr;
    return inNeck || inHead;
  }
  function inRowTab(x, y, by, cx, dir, seg) {
    const nh = neckHalf * seg, hr = headR * seg, nl = neckLen * chC, ho = headOff * chC;
    const dy = (y - by) * dir;
    const inNeck = dy >= -0.001 && dy <= nl && Math.abs(x - cx) <= nh;
    const hcy = by + dir * ho;
    const inHead = dy >= -0.001 && ((y - hcy) ** 2 + (x - cx) ** 2) <= hr * hr;
    return inNeck || inHead;
  }

  const piece = new Int16Array(W * D);
  for (let j = 0; j < D; j++) {
    for (let i = 0; i < W; i++) {
      const x = i + 0.5, y = j + 0.5;
      let px = clamp(Math.floor(x / cwC), 0, nx - 1);
      let py = clamp(Math.floor(y / chC), 0, ny - 1);

      // Vertical boundaries: perturb column.
      for (let k = 1; k < nx; k++) {
        const bx = k * cwC;
        if (Math.abs(x - bx) > cwC) continue;
        const rSeg = clamp(Math.floor(y / chC), 0, ny - 1);
        const cy = (rSeg + 0.5) * chC;
        // owner: alternate which side the tab pokes from
        const ownerLeft = ((k + rSeg) & 1) === 0;
        const dir = ownerLeft ? 1 : -1;      // poke direction from owner into other
        if (inColTab(x, y, bx, cy, dir, chC)) px = ownerLeft ? k - 1 : k;
        else px = x < bx ? k - 1 : k;
      }
      // Horizontal boundaries: perturb row.
      for (let k = 1; k < ny; k++) {
        const by = k * chC;
        if (Math.abs(y - by) > chC) continue;
        const cSeg = clamp(Math.floor(x / cwC), 0, nx - 1);
        const cx = (cSeg + 0.5) * cwC;
        const ownerTop = ((k + cSeg) & 1) === 0;
        const dir = ownerTop ? 1 : -1;
        if (inRowTab(x, y, by, cx, dir, cwC)) py = ownerTop ? k - 1 : k;
        else py = y < by ? k - 1 : k;
      }
      piece[j * W + i] = py * nx + px;
    }
  }
  return piece;
}

function meshTri(mesh, a, b, c) {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-10) return;
  nx /= len; ny /= len; nz /= len;
  mesh.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  if (mesh.nrm) mesh.nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
}

function lerpClipVertex(a, b, t) {
  const v = {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    d: a.d + (b.d - a.d) * t,
  };
  if (a.bottom !== undefined && b.bottom !== undefined)
    v.bottom = a.bottom + (b.bottom - a.bottom) * t;
  return v;
}

function clipScalarPolygon(vertices, threshold, keepInside) {
  const keep = v => keepInside ? v.d <= threshold + CLIP_EPS : v.d >= threshold - CLIP_EPS;
  const out = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    const aIn = keep(a), bIn = keep(b);
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const den = b.d - a.d;
      const t = Math.abs(den) < CLIP_EPS ? 0.5 : clamp((threshold - a.d) / den, 0, 1);
      out.push(lerpClipVertex(a, b, t));
    }
  }
  return out.filter((v, i) => {
    const p = out[(i + out.length - 1) % out.length];
    return !p || Math.hypot(v.x - p.x, v.y - p.y, v.z - p.z) > CLIP_EPS;
  });
}

function clipScalarSegment(a, b, threshold, keepInside) {
  const keep = v => keepInside ? v.d <= threshold + CLIP_EPS : v.d >= threshold - CLIP_EPS;
  const aIn = keep(a), bIn = keep(b);
  if (aIn && bIn) return [a, b];
  if (!aIn && !bIn) return null;
  const den = b.d - a.d;
  const t = Math.abs(den) < CLIP_EPS ? 0.5 : clamp((threshold - a.d) / den, 0, 1);
  const cut = lerpClipVertex(a, b, t);
  return aIn ? [a, cut] : [cut, b];
}

function addVerticalWall(mesh, a, b, bottomOf) {
  const ab = { x: a.x, y: a.y, z: bottomOf(a) };
  const bb = { x: b.x, y: b.y, z: bottomOf(b) };
  meshTri(mesh, a, ab, b);
  meshTri(mesh, b, ab, bb);
}

function addClippedPrismTriangle(mesh, triangle, threshold, keepInside, bottomOf) {
  const poly = clipScalarPolygon(triangle, threshold, keepInside);
  if (poly.length < 3) return;
  for (let k = 1; k + 1 < poly.length; k++) {
    meshTri(mesh, poly[0], poly[k], poly[k + 1]);
    const a = { ...poly[0], z: bottomOf(poly[0]) };
    const b = { ...poly[k + 1], z: bottomOf(poly[k + 1]) };
    const c = { ...poly[k], z: bottomOf(poly[k]) };
    meshTri(mesh, a, b, c);
  }
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k], b = poly[(k + 1) % poly.length];
    if (Math.abs(a.d - threshold) <= CLIP_EPS && Math.abs(b.d - threshold) <= CLIP_EPS)
      addVerticalWall(mesh, a, b, bottomOf);
  }
}

function addClippedBoundaryWall(mesh, a, b, threshold, keepInside, bottomOf) {
  const edge = clipScalarSegment(a, b, threshold, keepInside);
  if (edge && Math.hypot(edge[1].x - edge[0].x, edge[1].y - edge[0].y) > CLIP_EPS)
    addVerticalWall(mesh, edge[0], edge[1], bottomOf);
}

/* Pure CPU and synchronous. onStep defaults to a no-op and the live rebuild path
   passes nothing, so that path can never flash the progress overlay; only the
   Generate path wires it up.
   INVARIANT: nothing outside this function may write model.grid.Hv. */
function buildGeometry(src, opts, onStep = () => {}) {
  const { nx, ny, vex, widthMM, baseMM } = opts;
  const { osmWater, bounds, W, D, VW, VD } = src;
  const [[latS, lonW], [latN, lonE]] = bounds;

  // a copy, so the pristine grid survives a destructive flatten
  const Hv = src.Hv0.slice();
  let minE = src.minE0, maxE = src.maxE0;
  if (!isFinite(minE)) { minE = 0; maxE = 1; }
  if (maxE - minE < 1) maxE = minE + 1;

  const water = new Uint8Array(VW * VD);
  const piece = buildPartition(W, D, nx, ny);
  const waterOn = opts.waterEnabled !== false;   // absent means on, as it always was

  // --- physical scaling ---
  const boxWidthM = haversine((latN + latS) / 2, lonW, (latN + latS) / 2, lonE);
  const boxHeightM = haversine(latN, (lonW + lonE) / 2, latS, (lonW + lonE) / 2);
  // A province, or a hand-drawn rectangle, can be much taller than it is wide.
  // widthMM is the LONGEST side, matching its "Maximum model size" label: binding
  // it to X alone would print a 5x20 km selection 720 mm deep.
  const mmPerMeter = widthMM / Math.max(boxWidthM, boxHeightM, 1);
  const modelWidth = boxWidthM * mmPerMeter;
  const modelDepth = boxHeightM * mmPerMeter;
  const dx = modelWidth / W, dy = modelDepth / D;

  // --- clip the print to the frame-plate shape (circle / square / hex) ---
  const cellShape = new Uint8Array(W * D);
  {
    if (opts.regionPolygons && opts.regionPolygons.length) {
      // Sample the administrative polygon at cell centres. The existing
      // inPiece boundary-wall path then closes the stair-stepped outline into
      // a printable solid, exactly as it does for circle/hex clipping.
      for (let j = 0; j < D; j++) {
        const lat = latN + ((j + 0.5) / D) * (latS - latN);
        for (let i = 0; i < W; i++) {
          const lon = lonW + ((i + 0.5) / W) * (lonE - lonW);
          cellShape[j * W + i] = pointInRegion(lon, lat, opts.regionPolygons) ? 1 : 0;
        }
      }
    } else {
      const ins = shapeInsideFn(opts.frameStyle || 'none', modelWidth / 2, modelDepth / 2);
      for (let j = 0; j < D; j++) {
        const y = modelDepth - (j + 0.5) * dy - modelDepth / 2;
        for (let i = 0; i < W; i++) {
          cellShape[j * W + i] = ins((i + 0.5) * dx - modelWidth / 2, y) ? 1 : 0;
        }
      }
    }
  }

  // --- flatten the water, before the route is stamped ---
  // Running this after the emboss would erase any route crossing water — a river
  // route, the likeliest case, would vanish. Before it, the groove is cut into
  // the flat plane and the inlay's undo record still reconstructs it correctly.
  // With the water layer switched off this must not run at all: it rewrites Hv in
  // place and re-derives minE/maxE, so it would move the elevation range for a
  // print that is not showing water anyway.
  if (opts.flattenWater && waterOn) {
    flattenWaterHeights(Hv, osmWater, opts.waterLevelM, VW, VD);
    minE = Infinity; maxE = -Infinity;
    for (let k = 0; k < Hv.length; k++) { const e = Hv[k]; if (e < minE) minE = e; if (e > maxE) maxE = e; }
    // a fully flooded area collapses the range to zero, so re-apply the guards
    if (!isFinite(minE)) { minE = 0; maxE = 1; }
    if (maxE - minE < 1) maxE = minE + 1;
  }

  // --- stamp shallow modes, or build a distance field for the through-route ---
  const throughRoute = opts.routeMode === 'through';
  const routeDims = resolveRouteDims(opts, Math.hypot(dx, dy));
  let rd = null;        // shallow inlay: per-vertex groove depth (m)
  let routeDist = null; // through route: distance to route centerline (model mm)
  if (opts.routePath && opts.routePath.length > 1 && opts.routeMode !== 'off') {
    onStep(t(throughRoute ? 'pgRouteThrough' : 'pgRoute'));
    const zSc = mmPerMeter * vex;
    const inlay = opts.routeMode === 'inlay';
    if (inlay) rd = new Float32Array(VW * VD);
    if (throughRoute) routeDist = new Float32Array(VW * VD);
    const halfW = routeDims.halfW;                            // shallow-mode half-width (mm)
    // emboss stands proud, inlay and engrave cut in; the slider carries the magnitude
    const dMM = (opts.routeMode === 'emboss' ? 1 : -1) * routeDims.depth;
    // route lat/lon → model mm (same mapping as vertex X/Y below)
    const seg = opts.routePath.map(([la, lo]) => [
      (lo - lonW) / (lonE - lonW) * modelWidth,
      (la - latS) / (latN - latS) * modelDepth
    ]);
    const distToSeg = (px, py, ax, ay, bx, by) => {
      const vx = bx - ax, vy = by - ay;
      const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1), 0, 1);
      return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
    };
    for (let j = 0; j < VD; j++) {
      const yv = modelDepth - j * dy;
      for (let i = 0; i < VW; i++) {
        const xv = i * dx;
        let d = Infinity;
        for (let s = 0; s + 1 < seg.length && d > 0; s++) {
          d = Math.min(d, distToSeg(xv, yv, seg[s][0], seg[s][1], seg[s + 1][0], seg[s + 1][1]));
        }
        if (throughRoute) {
          routeDist[j * VW + i] = d;
        } else if (d < halfW) {
          const f = 1 - (d / halfW) ** 2;                     // rounded cross-section
          const dE = (dMM * f) / zSc;
          Hv[j * VW + i] += dE;
          if (rd) rd[j * VW + i] = -dE;                       // groove depth (m, positive)
        }
      }
    }
    if (!throughRoute) {
      // heights changed → refresh range so base offset and color bands stay aligned
      minE = Infinity; maxE = -Infinity;
      for (let k = 0; k < Hv.length; k++) { const e = Hv[k]; if (e < minE) minE = e; if (e > maxE) maxE = e; }
      // this recompute omits the degenerate-range guards; with a flat water
      // plane the range really can collapse, so restore them
      if (opts.flattenWater) {
        if (!isFinite(minE)) { minE = 0; maxE = 1; }
        if (maxE - minE < 1) maxE = minE + 1;
      }
    }
  }

  const zOf = e => baseMM + (e - minE) * mmPerMeter * vex;

  // model X/Y helpers
  const X = i => i * dx;
  const Y = j => modelDepth - j * dy;      // flip so north is +Y
  const H = (i, j) => Hv[j * VW + i];

  const nPieces = nx * ny;
  const pieces = [];
  for (let p = 0; p < nPieces; p++) pieces.push({ pos: [], nrm: [], col: [], id: p });

  const inPiece = (i, j, p) => (i >= 0 && j >= 0 && i < W && j < D && piece[j * W + i] === p && !!cellShape[j * W + i]);

  function tri(P, ax, ay, az, bx, by, bz, cx, cy, cz) {
    // Y(j) flips the grid's j axis, which mirrors orientation — emit as
    // (a, c, b) so faces wind outward.
    const ux = cx - ax, uy = cy - ay, uz = cz - az;
    const vx = bx - ax, vy = by - ay, vz = bz - az;
    let nxn = uy * vz - uz * vy, nyn = uz * vx - ux * vz, nzn = ux * vy - uy * vx;
    const L = Math.hypot(nxn, nyn, nzn) || 1; nxn /= L; nyn /= L; nzn /= L;
    P.pos.push(ax, ay, az, cx, cy, cz, bx, by, bz);
    P.nrm.push(nxn, nyn, nzn, nxn, nyn, nzn, nxn, nyn, nzn);
  }

  let triCount = 0;
  for (let j = 0; j < D; j++) {
    for (let i = 0; i < W; i++) {
      if (!cellShape[j * W + i]) continue;
      const p = piece[j * W + i];
      const P = pieces[p];
      // corner coords
      const x0 = X(i), x1 = X(i + 1), y0 = Y(j), y1 = Y(j + 1);
      const h00 = zOf(H(i, j)), h10 = zOf(H(i + 1, j)), h11 = zOf(H(i + 1, j + 1)), h01 = zOf(H(i, j + 1));
      if (throughRoute && routeDist) {
        const v00 = { x: x0, y: y0, z: h00, d: routeDist[j * VW + i] };
        const v10 = { x: x1, y: y0, z: h10, d: routeDist[j * VW + i + 1] };
        const v11 = { x: x1, y: y1, z: h11, d: routeDist[(j + 1) * VW + i + 1] };
        const v01 = { x: x0, y: y1, z: h01, d: routeDist[(j + 1) * VW + i] };
        const bottom = () => 0;
        // Actual CCW top triangles; retain only terrain outside the channel.
        addClippedPrismTriangle(P, [v00, v11, v10], routeDims.channelHalf, false, bottom);
        addClippedPrismTriangle(P, [v00, v01, v11], routeDims.channelHalf, false, bottom);
        // Cell perimeter in CCW order, with the cell interior on the left.
        if (!inPiece(i - 1, j, p)) addClippedBoundaryWall(P, v00, v01, routeDims.channelHalf, false, bottom);
        if (!inPiece(i, j + 1, p)) addClippedBoundaryWall(P, v01, v11, routeDims.channelHalf, false, bottom);
        if (!inPiece(i + 1, j, p)) addClippedBoundaryWall(P, v11, v10, routeDims.channelHalf, false, bottom);
        if (!inPiece(i, j - 1, p)) addClippedBoundaryWall(P, v10, v00, routeDims.channelHalf, false, bottom);
      } else {
        // TOP surface (two tris, normals up)
        tri(P, x0, y0, h00, x1, y0, h10, x1, y1, h11);
        tri(P, x0, y0, h00, x1, y1, h11, x0, y1, h01);
        // BOTTOM (flat z=0, reversed winding)
        tri(P, x0, y0, 0, x1, y1, 0, x1, y0, 0);
        tri(P, x0, y0, 0, x0, y1, 0, x1, y1, 0);

        // WALLS where neighbor is not same piece
        if (!inPiece(i + 1, j, p)) {
          tri(P, x1, y0, h10, x1, y0, 0, x1, y1, h11);
          tri(P, x1, y1, h11, x1, y0, 0, x1, y1, 0);
        }
        if (!inPiece(i - 1, j, p)) {
          tri(P, x0, y0, h00, x0, y1, h01, x0, y0, 0);
          tri(P, x0, y1, h01, x0, y1, 0, x0, y0, 0);
        }
        if (!inPiece(i, j - 1, p)) {
          tri(P, x0, y0, h00, x0, y0, 0, x1, y0, h10);
          tri(P, x1, y0, h10, x0, y0, 0, x1, y0, 0);
        }
        if (!inPiece(i, j + 1, p)) {
          tri(P, x0, y1, h01, x1, y1, h11, x0, y1, 0);
          tri(P, x1, y1, h11, x1, y1, 0, x0, y1, 0);
        }
      }
    }
  }
  for (const P of pieces) triCount += P.pos.length / 9;

  // --- red route inserts (inlay mode), one closed solid per puzzle piece ---
  // Bottom follows the grooved terrain (mates with the channel); top follows
  // the ORIGINAL terrain + PROUD, so each strip sits in its piece's groove
  // and stands slightly proud of the surface.
  let routeParts = null;
  if (rd) {
    const PROUD = 0.6; // mm above the original surface
    const bZ = (i, j) => zOf(H(i, j));                              // grooved surface
    const tZ = (i, j) => zOf(H(i, j) + rd[j * VW + i]) + PROUD;     // original + proud
    const inR = (i, j) => i >= 0 && j >= 0 && i < W && j < D && !!cellShape[j * W + i] &&
      (rd[j * VW + i] > 0 || rd[j * VW + i + 1] > 0 || rd[(j + 1) * VW + i] > 0 || rd[(j + 1) * VW + i + 1] > 0);
    // wall wherever the neighbor cell is outside the route OR in another piece,
    // so each piece's chunk is a closed solid ending exactly at the jigsaw cut
    const inRP = (i, j, p) => inR(i, j) && piece[j * W + i] === p;
    const parts = new Map(); // pieceId → {pos, nrm}
    for (let j = 0; j < D; j++) {
      for (let i = 0; i < W; i++) {
        if (!inR(i, j)) continue;
        const p = piece[j * W + i];
        let R = parts.get(p);
        if (!R) { R = { pos: [], nrm: [], pid: p }; parts.set(p, R); }
        const x0 = X(i), x1 = X(i + 1), y0 = Y(j), y1 = Y(j + 1);
        const b00 = bZ(i, j), b10 = bZ(i + 1, j), b01 = bZ(i, j + 1), b11 = bZ(i + 1, j + 1);
        const t00 = tZ(i, j), t10 = tZ(i + 1, j), t01 = tZ(i, j + 1), t11 = tZ(i + 1, j + 1);
        // top
        tri(R, x0, y0, t00, x1, y0, t10, x1, y1, t11);
        tri(R, x0, y0, t00, x1, y1, t11, x0, y1, t01);
        // bottom (reversed)
        tri(R, x0, y0, b00, x1, y1, b11, x1, y0, b10);
        tri(R, x0, y0, b00, x0, y1, b01, x1, y1, b11);
        // side walls where the strip (or this piece's part of it) ends
        if (!inRP(i + 1, j, p)) {
          tri(R, x1, y0, t10, x1, y0, b10, x1, y1, t11);
          tri(R, x1, y1, t11, x1, y0, b10, x1, y1, b11);
        }
        if (!inRP(i - 1, j, p)) {
          tri(R, x0, y0, t00, x0, y1, t01, x0, y0, b00);
          tri(R, x0, y1, t01, x0, y1, b01, x0, y0, b00);
        }
        if (!inRP(i, j - 1, p)) {
          tri(R, x0, y0, t00, x0, y0, b00, x1, y0, t10);
          tri(R, x1, y0, t10, x0, y0, b00, x1, y0, b10);
        }
        if (!inRP(i, j + 1, p)) {
          tri(R, x0, y1, t01, x1, y1, t11, x0, y1, b01);
          tri(R, x1, y1, t11, x1, y1, b11, x0, y1, b01);
        }
      }
    }
    routeParts = [...parts.values()].filter(R => R.pos.length);
    if (!routeParts.length) routeParts = null;
    else for (const R of routeParts) triCount += R.pos.length / 9;
  } else if (throughRoute && routeDist) {
    const continuous = opts.routeJoin === 'continuous';
    const raise = opts.routeTop === 'raised' ? THROUGH_ROUTE_RAISE : 0;
    const parts = new Map();
    const active = (i, j) => i >= 0 && j >= 0 && i < W && j < D && !!cellShape[j * W + i];
    const sameRoutePart = (i, j, p) => active(i, j) && (continuous || piece[j * W + i] === p);
    for (let j = 0; j < D; j++) {
      for (let i = 0; i < W; i++) {
        if (!active(i, j)) continue;
        const p = piece[j * W + i];
        const key = continuous ? -1 : p;
        let R = parts.get(key);
        if (!R) { R = { pos: [], nrm: [], pid: continuous ? null : p }; parts.set(key, R); }
        const x0 = X(i), x1 = X(i + 1), y0 = Y(j), y1 = Y(j + 1);
        const v00 = { x: x0, y: y0, z: zOf(H(i, j)) + raise, d: routeDist[j * VW + i] };
        const v10 = { x: x1, y: y0, z: zOf(H(i + 1, j)) + raise, d: routeDist[j * VW + i + 1] };
        const v11 = { x: x1, y: y1, z: zOf(H(i + 1, j + 1)) + raise, d: routeDist[(j + 1) * VW + i + 1] };
        const v01 = { x: x0, y: y1, z: zOf(H(i, j + 1)) + raise, d: routeDist[(j + 1) * VW + i] };
        const bottom = () => 0;
        addClippedPrismTriangle(R, [v00, v11, v10], routeDims.halfW, true, bottom);
        addClippedPrismTriangle(R, [v00, v01, v11], routeDims.halfW, true, bottom);
        if (!sameRoutePart(i - 1, j, p)) addClippedBoundaryWall(R, v00, v01, routeDims.halfW, true, bottom);
        if (!sameRoutePart(i, j + 1, p)) addClippedBoundaryWall(R, v01, v11, routeDims.halfW, true, bottom);
        if (!sameRoutePart(i + 1, j, p)) addClippedBoundaryWall(R, v11, v10, routeDims.halfW, true, bottom);
        if (!sameRoutePart(i, j - 1, p)) addClippedBoundaryWall(R, v10, v00, routeDims.halfW, true, bottom);
      }
    }
    routeParts = [...parts.values()].filter(R => R.pos.length);
    if (!routeParts.length) routeParts = null;
    else for (const R of routeParts) triCount += R.pos.length / 9;
  }

  // piece centroids (for exploded preview); clipped-away pieces may be empty
  for (const P of pieces) {
    let sx = 0, sy = 0, n = P.pos.length / 3;
    for (let k = 0; k < P.pos.length; k += 3) { sx += P.pos[k]; sy += P.pos[k + 1]; }
    P.cx = n ? sx / n : modelWidth / 2; P.cy = n ? sy / n : modelDepth / 2;
  }

  const zScale = mmPerMeter * vex;
  const maxZ = baseMM + (maxE - minE) * zScale;

  const model = {
    pieces, routeParts, nx, ny, W, D, minE, maxE, triCount, src, opts,
    flatWater: !!opts.flattenWater,
    // The water layer is off entirely: no mask, no blue slot, no flatten. Carried on
    // the model so the page's cheap recolour path can flip it without a rebuild.
    waterOff: !waterOn,
    routeMode: opts.routeMode, routeTop: opts.routeTop || 'flush', routeJoin: opts.routeJoin || 'piece',
    // What the grid could carry, and what was asked for — equal unless the route was
    // too thin to survive sampling at this detail.
    routeStampedWidthMM: routeDims.halfW * 2, routeAskedWidthMM: routeDims.askedHalfW * 2,
    modelWidth, modelDepth,
    pieceW: modelWidth / nx, pieceH: modelDepth / ny,
    zoom: src.zoom,
    maxZ,
    // filled in by applyWaterLevel + syncBandsToModel below
    hasWater: false, NB: 4, landMin: minE, waterLevelM: 0, bandCutsM: [], zCuts: [],
    // routeHalf/channelHalf ride along with routeDist because the band and
    // water-cap mesh builders re-cut this channel from `model` alone.
    grid: { Hv, piece, water, osmWater, cellShape, routeDist, routeHalf: routeDims.halfW,
      channelHalf: routeDims.channelHalf, W, D, VW, dx, dy, baseMM, zScale, modelDepth }
  };
  // Flood to the requested level now that the emboss (if any) has settled the heights.
  applyWaterLevel(model, opts.waterLevelM, opts.autoFallback);
  return model;
}

/* 4-connected components of a vertex-grid mask. Explicit stack, marked on PUSH,
   so each vertex is queued exactly once and the stack can never exceed N —
   recursion would overflow on a large lake. The column guards are load-bearing:
   without them v±1 wraps across rows and merges a west-edge lake into an
   unrelated east-edge one. */
function labelBodies(mask, VW, VD) {
  const N = VW * VD;
  const label = new Int32Array(N).fill(-1);
  const stack = new Int32Array(N);
  const sizes = [];
  for (let seed = 0; seed < N; seed++) {
    if (!mask[seed] || label[seed] >= 0) continue;
    const id = sizes.length;
    let sp = 0, n = 0;
    stack[sp++] = seed; label[seed] = id;
    while (sp) {
      const v = stack[--sp]; n++;
      const i = v % VW;
      if (i > 0      && mask[v - 1]  && label[v - 1]  < 0) { label[v - 1]  = id; stack[sp++] = v - 1; }
      if (i < VW - 1 && mask[v + 1]  && label[v + 1]  < 0) { label[v + 1]  = id; stack[sp++] = v + 1; }
      if (v >= VW    && mask[v - VW] && label[v - VW] < 0) { label[v - VW] = id; stack[sp++] = v - VW; }
      if (v < N - VW && mask[v + VW] && label[v + VW] < 0) { label[v + VW] = id; stack[sp++] = v + VW; }
    }
    sizes.push(n);
  }
  return { label, sizes };
}

/* Lower median elevation per body, via CSR bucketing so the whole thing costs
   one sort of the water set rather than a sort per lookup. The median (not the
   mean) shrugs off a polygon that bleeds a few pixels onto the shore or catches
   one anomalously deep sample; the LOWER median (not the midpoint of two) keeps
   the result an actually-observed elevation, so a rebuild reproduces it exactly.
   `vals` must stay a Float32Array — typed-array sort is numeric, Array sort is
   lexicographic. */
function bodyMedians(Hv, label, sizes) {
  const nb = sizes.length;
  const off = new Int32Array(nb + 1);
  for (let b = 0; b < nb; b++) off[b + 1] = off[b] + sizes[b];
  const cur = off.slice(0, nb);
  const vals = new Float32Array(off[nb]);
  for (let v = 0; v < label.length; v++) { const b = label[v]; if (b >= 0) vals[cur[b]++] = Hv[v]; }
  const med = new Float32Array(nb);
  for (let b = 0; b < nb; b++) {
    const slice = vals.subarray(off[b], off[b + 1]);
    slice.sort();
    med[b] = slice[(slice.length - 1) >> 1];
  }
  return med;
}

/* Level each OSM body to its own median, then raise everything at or below the
   water level onto one plane. Order matters and does the overlap reasoning for
   free: a body whose median sits below the level is lifted by pass B and merges
   into the flood plane; one above it stands proud as a perched lake; a body
   straddling both is a single component, so a reservoir with a deep hole is not
   carved in two.

   It also leaves the water mask untouched: a vertex set to exactly lv still
   satisfies `<= lv`, and OSM vertices match on the first disjunct either way —
   so applyWaterLevel stays idempotent against the flattened grid, and landMin
   (which skips water vertices) is unchanged. */
function flattenWaterHeights(Hv, osmWater, level, VW, VD) {
  const lv = levelF32(level);
  const { label, sizes } = labelBodies(osmWater, VW, VD);
  if (sizes.length) {
    const med = bodyMedians(Hv, label, sizes);
    for (let v = 0; v < Hv.length; v++) { const b = label[v]; if (b >= 0) Hv[v] = med[b]; }
  }
  for (let v = 0; v < Hv.length; v++) if (Hv[v] <= lv) Hv[v] = lv;
}

/* Cells whose whole quad is water. The cap and the band solids both key their
   0.8 mm depression off this, which is what turns the shore into a vertical
   step instead of a taper: a per-VERTEX depth cannot express a step on a shared
   -vertex heightfield, but both emitters are per-cell triangle soups. */
function buildCapCellMask(water, W, D, VW) {
  const all = new Uint8Array(W * D), any = new Uint8Array(W * D);
  for (let j = 0; j < D; j++) {
    for (let i = 0; i < W; i++) {
      const a = water[j * VW + i], b = water[j * VW + i + 1];
      const c = water[(j + 1) * VW + i], d = water[(j + 1) * VW + i + 1];
      const k = j * W + i;
      all[k] = (a && b && c && d) ? 1 : 0;
      any[k] = (a || b || c || d) ? 1 : 0;
    }
  }
  // A ~1-cell-wide river can have no fully-wet cell at all and would silently
  // lose its blue; keep fringe cells that have no fully-wet cell anywhere near.
  const cap = all.slice();
  for (let j = 0; j < D; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (cap[k] || !any[k]) continue;
      let near = false;
      for (let dj = -1; dj <= 1 && !near; dj++) {
        for (let di = -1; di <= 1; di++) {
          const jj = j + dj, ii = i + di;
          if (ii >= 0 && jj >= 0 && ii < W && jj < D && all[jj * W + ii]) { near = true; break; }
        }
      }
      if (!near) cap[k] = 1;
    }
  }

  /* A diagonal 2x2 checkerboard makes four shoreline walls meet along one
     vertical edge. That edge has four incident faces, so neither the cap nor
     the band below it is a 2-manifold. Bridge one of the dry cells (preferring
     one already touched by the vertex mask) and repeat because a bridge can
     expose the same ambiguity in the next block. Only 0→1 changes are made, so
     this always terminates and preserves thin water rather than eroding it. */
  let changed;
  do {
    changed = false;
    for (let j = 0; j + 1 < D; j++) {
      for (let i = 0; i + 1 < W; i++) {
        const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
        if (cap[a] && cap[d] && !cap[b] && !cap[c]) {
          cap[any[b] ? b : c] = 1; changed = true;
        } else if (cap[b] && cap[c] && !cap[a] && !cap[d]) {
          cap[any[a] ? a : d] = 1; changed = true;
        }
      }
    }
  } while (changed);
  return cap;
}

/* Lowest vertex that is NOT water — an OSM lake at 400 m must not push the split
   above a 350 m valley floor. With no water at all this is exactly minE, which is
   what keeps the no-water output identical to the old even quarter split. */
function landMinOf(Hv, water, minE, maxE, level) {
  let lm = Infinity;
  for (let v = 0; v < Hv.length; v++) if (!water[v] && Hv[v] < lm) lm = Hv[v];
  if (!isFinite(lm)) lm = Math.max(minE, level);      // every vertex is water
  lm = clamp(lm, minE, maxE);
  if (maxE - lm < 1) lm = Math.max(minE, maxE - 1);   // keep at least 1 m of span
  return lm;
}

/* Rebuild the water mask for a new level. Costs one pass over the grid — no
   Overpass call, no tile fetch, no geometry rebuild. */
function applyWaterLevel(model, level, autoFallback) {
  const g = model.grid;
  const lv = normLevel(level);
  // flatten stores the plane as a float32, so compare against the same value
  const lvc = model.flatWater ? levelF32(lv) : lv;
  let any = false;
  // The level cannot express "no water": normLevel coerces a non-finite level back
  // to 0.3, and an OSM lake short-circuits the level test below regardless. Hence
  // the explicit flag rather than an out-of-range level.
  if (model.waterOff) g.water.fill(0);
  else for (let v = 0; v < g.water.length; v++) {
    const w = (g.osmWater[v] || g.Hv[v] <= lvc) ? 1 : 0;
    g.water[v] = w; if (w) any = true;
  }
  model.waterLevelM = lv;
  model.hasWater = any;
  model.hasOsmWater = !model.waterOff && g.osmWater.some(v => v === 1);
  model.landMin = landMinOf(g.Hv, g.water, model.minE, model.maxE, lv);
  // no water → release the blue slot and go back to 4 land bands, unless the
  // user has turned that fallback off. Switching the layer off is that choice
  // made deliberately, so the freed slot is always reused.
  model.NB = model.waterOff ? 4 : (any || autoFallback === false) ? 3 : 4;
  // null here is the single gate that keeps the whole pre-flatten export path
  g.capCell = model.flatWater && !model.waterOff ? buildCapCellMask(g.water, g.W, g.D, g.VW) : null;
  return model;
}

/* A cell-based shoreline step gives adjacent cells different top Z values at
   the same grid corner. Where that step reaches an outer/piece/band wall, the
   shorter edge otherwise ends halfway along the neighbour's long vertical
   edge: a T-junction that many slicers report as non-manifold. Split every
   vertical triangle edge at the Z levels already present at its XY coordinate.
   This is linear apart from the tiny per-corner level sorts and changes no
   surface — it only gives both incident faces identical edge segmentation. */
function splitVerticalTJunctions(pos) {
  const EPS = 1e-8;
  const xyKey = (x, y) => Math.round(x * 1e9) + ',' + Math.round(y * 1e9);
  const levels = new Map();
  for (let k = 0; k < pos.length; k += 3) {
    const key = xyKey(pos[k], pos[k + 1]);
    let zs = levels.get(key);
    if (!zs) { zs = []; levels.set(key, zs); }
    const z = pos[k + 2];
    if (!zs.some(v => Math.abs(v - z) <= EPS)) zs.push(z);
  }
  for (const zs of levels.values()) zs.sort((a, b) => a - b);

  const out = [];
  const emit = (a, b, c) => out.push(...a, ...b, ...c);
  for (let k = 0; k < pos.length; k += 9) {
    const p = [pos.slice(k, k + 3), pos.slice(k + 3, k + 6), pos.slice(k + 6, k + 9)];
    let edge = -1;
    for (let e = 0; e < 3; e++) {
      const a = p[e], b = p[(e + 1) % 3];
      if (Math.abs(a[0] - b[0]) <= EPS && Math.abs(a[1] - b[1]) <= EPS && Math.abs(a[2] - b[2]) > EPS) {
        edge = e; break;
      }
    }
    if (edge < 0) { emit(p[0], p[1], p[2]); continue; }

    const a = p[edge], b = p[(edge + 1) % 3], c = p[(edge + 2) % 3];
    const lo = Math.min(a[2], b[2]), hi = Math.max(a[2], b[2]);
    let mid = levels.get(xyKey(a[0], a[1])).filter(z => z > lo + EPS && z < hi - EPS);
    if (!mid.length) { emit(p[0], p[1], p[2]); continue; }
    if (b[2] < a[2]) mid = mid.reverse();
    const chain = [a, ...mid.map(z => [a[0], a[1], z]), b];
    for (let n = 0; n + 1 < chain.length; n++) emit(chain[n], chain[n + 1], c);
  }
  return out;
}

function buildBandSolidMesh(model, pieceId, band) {
  const { Hv, piece, water, cellShape, routeDist, W, D, VW, dx, dy, baseMM, zScale, modelDepth } = model.grid;
  const channelHalf = model.grid.channelHalf ?? DEFAULT_CHANNEL_HALF;
  const minE = model.minE;
  const zOf = e => baseMM + (e - minE) * zScale;
  const cLo = band === 0 ? 0 : model.zCuts[band - 1];
  const cHi = band >= model.zCuts.length ? model.maxZ + 0.001 : model.zCuts[band];
  const MINT = 0.02; // minimum slab thickness (mm) so clipped cells stay manifold

  const X = i => i * dx, Y = j => modelDepth - j * dy;
  /* Band solids stop below the surface at water, and the cap fills the skin.
     With flatten on the depression follows the CELL (capCell) rather than the
     vertex, which is what lets the shore be a vertical step instead of a taper
     — so rawTop takes the cell (ci, cj) that owns the corner being emitted. */
  const cap = model.grid.capCell;
  const wetC = (ci, cj) => !!cap && ci >= 0 && cj >= 0 && ci < W && cj < D && !!cap[cj * W + ci];
  const drop = (i, j, ci, cj) => cap ? (wetC(ci, cj) ? WATER_CAP_MM : 0)
                                     : (water[j * VW + i] ? WATER_CAP_MM : 0);
  const rawTop = (i, j, ci, cj) => zOf(Hv[j * VW + i]) - drop(i, j, ci, cj);
  const topV = (i, j, ci, cj) => Math.max(clamp(rawTop(i, j, ci, cj), cLo, cHi), cLo + MINT);
  const inc = (i, j) => {
    if (i < 0 || j < 0 || i >= W || j >= D) return false;
    if (piece[j * W + i] !== pieceId || !cellShape[j * W + i]) return false;
    if (band === 0) return true; // band 0 includes the base slab everywhere
    return Math.max(rawTop(i, j, i, j), rawTop(i + 1, j, i, j),
                    rawTop(i, j + 1, i, j), rawTop(i + 1, j + 1, i, j)) > cLo + MINT;
  };

  const pos = [];
  const mesh = { pos };
  const cutThrough = model.routeMode === 'through' && routeDist;
  // Y(j) flips the grid's j axis, which mirrors orientation — emit as
  // (a, c, b) so faces wind outward (3MF requires CCW-outward triangles).
  const push = (ax, ay, az, bx, by, bz, cx, cy, cz) => pos.push(ax, ay, az, cx, cy, cz, bx, by, bz);
  const zb = band === 0 ? 0 : cLo;

  for (let j = 0; j < D; j++) {
    for (let i = 0; i < W; i++) {
      if (!inc(i, j)) continue;
      const x0 = X(i), x1 = X(i + 1), y0 = Y(j), y1 = Y(j + 1);
      const t00 = topV(i, j, i, j), t10 = topV(i + 1, j, i, j),
            t01 = topV(i, j + 1, i, j), t11 = topV(i + 1, j + 1, i, j);
      // a dry cell beside a wet one now sits WATER_CAP_MM proud of it; the dry
      // side (the higher one) closes that step so the solid stays watertight
      const step = (ci, cj) => cap && inc(ci, cj) && !wetC(i, j) && wetC(ci, cj);
      if (cutThrough) {
        const v00 = { x: x0, y: y0, z: t00, d: routeDist[j * VW + i] };
        const v10 = { x: x1, y: y0, z: t10, d: routeDist[j * VW + i + 1] };
        const v11 = { x: x1, y: y1, z: t11, d: routeDist[(j + 1) * VW + i + 1] };
        const v01 = { x: x0, y: y1, z: t01, d: routeDist[(j + 1) * VW + i] };
        const bottom = () => zb;
        addClippedPrismTriangle(mesh, [v00, v11, v10], channelHalf, false, bottom);
        addClippedPrismTriangle(mesh, [v00, v01, v11], channelHalf, false, bottom);
        // step walls carry the neighbour's top as their floor; lerpClipVertex
        // propagates `bottom`, so the clipped channel edge follows the step
        const stepWall = (a, b, ci, cj, za, zbb) => addClippedBoundaryWall(
          mesh, Object.assign({}, a, { bottom: za }), Object.assign({}, b, { bottom: zbb }),
          channelHalf, false, v => v.bottom);
        if (!inc(i - 1, j)) addClippedBoundaryWall(mesh, v00, v01, channelHalf, false, bottom);
        else if (step(i - 1, j)) stepWall(v00, v01, i - 1, j, topV(i, j, i - 1, j), topV(i, j + 1, i - 1, j));
        if (!inc(i, j + 1)) addClippedBoundaryWall(mesh, v01, v11, channelHalf, false, bottom);
        else if (step(i, j + 1)) stepWall(v01, v11, i, j + 1, topV(i, j + 1, i, j + 1), topV(i + 1, j + 1, i, j + 1));
        if (!inc(i + 1, j)) addClippedBoundaryWall(mesh, v11, v10, channelHalf, false, bottom);
        else if (step(i + 1, j)) stepWall(v11, v10, i + 1, j, topV(i + 1, j + 1, i + 1, j), topV(i + 1, j, i + 1, j));
        if (!inc(i, j - 1)) addClippedBoundaryWall(mesh, v10, v00, channelHalf, false, bottom);
        else if (step(i, j - 1)) stepWall(v10, v00, i, j - 1, topV(i + 1, j, i, j - 1), topV(i, j, i, j - 1));
      } else {
        // top
        push(x0, y0, t00, x1, y0, t10, x1, y1, t11);
        push(x0, y0, t00, x1, y1, t11, x0, y1, t01);
        // bottom (reversed)
        push(x0, y0, zb, x1, y1, zb, x1, y0, zb);
        push(x0, y0, zb, x0, y1, zb, x1, y1, zb);
        // walls where neighbor cell is absent from this band
        if (!inc(i + 1, j)) {
          push(x1, y0, t10, x1, y0, zb, x1, y1, t11);
          push(x1, y1, t11, x1, y0, zb, x1, y1, zb);
        } else if (step(i + 1, j)) {
          const n10 = topV(i + 1, j, i + 1, j), n11 = topV(i + 1, j + 1, i + 1, j);
          push(x1, y0, t10, x1, y0, n10, x1, y1, t11);
          push(x1, y1, t11, x1, y0, n10, x1, y1, n11);
        }
        if (!inc(i - 1, j)) {
          push(x0, y0, t00, x0, y1, t01, x0, y0, zb);
          push(x0, y1, t01, x0, y1, zb, x0, y0, zb);
        } else if (step(i - 1, j)) {
          const n00 = topV(i, j, i - 1, j), n01 = topV(i, j + 1, i - 1, j);
          push(x0, y0, t00, x0, y1, t01, x0, y0, n00);
          push(x0, y1, t01, x0, y1, n01, x0, y0, n00);
        }
        if (!inc(i, j - 1)) {
          push(x0, y0, t00, x0, y0, zb, x1, y0, t10);
          push(x1, y0, t10, x0, y0, zb, x1, y0, zb);
        } else if (step(i, j - 1)) {
          const n00 = topV(i, j, i, j - 1), n10 = topV(i + 1, j, i, j - 1);
          push(x0, y0, t00, x0, y0, n00, x1, y0, t10);
          push(x1, y0, t10, x0, y0, n00, x1, y0, n10);
        }
        if (!inc(i, j + 1)) {
          push(x0, y1, t01, x1, y1, t11, x0, y1, zb);
          push(x1, y1, t11, x1, y1, zb, x0, y1, zb);
        } else if (step(i, j + 1)) {
          const n01 = topV(i, j + 1, i, j + 1), n11 = topV(i + 1, j + 1, i, j + 1);
          push(x0, y1, t01, x1, y1, t11, x0, y1, n01);
          push(x1, y1, t11, x1, y1, n11, x0, y1, n01);
        }
      }
    }
  }
  return cap ? splitVerticalTJunctions(pos) : pos;
}

/* Blue skin over the water cells of one piece; top = terrain surface.
   Without flatten the depth is per-vertex and tapers to nothing at the shore,
   which hides the cap edge against sloping painted water. With flatten the
   depth is uniform over whole water cells, so the pane ends in a full-thickness
   vertical rim — what a genuinely flat surface needs. */
function buildWaterCapMesh(model, pieceId) {
  const { Hv, piece, water, cellShape, routeDist, W, D, VW, dx, dy, baseMM, zScale, modelDepth } = model.grid;
  const channelHalf = model.grid.channelHalf ?? DEFAULT_CHANNEL_HALF;
  const zOf = e => baseMM + (e - model.minE) * zScale;
  const X = i => i * dx, Y = j => modelDepth - j * dy;
  const cap = model.grid.capCell;
  const top = (i, j) => zOf(Hv[j * VW + i]);
  const dep = (i, j) => water[j * VW + i] ? WATER_CAP_MM : 0;
  const bot = (i, j) => cap ? top(i, j) - WATER_CAP_MM : top(i, j) - dep(i, j);
  const inc = (i, j) => {
    if (i < 0 || j < 0 || i >= W || j >= D) return false;
    if (piece[j * W + i] !== pieceId || !cellShape[j * W + i]) return false;
    if (cap) return !!cap[j * W + i];
    return dep(i, j) > 0 || dep(i + 1, j) > 0 || dep(i, j + 1) > 0 || dep(i + 1, j + 1) > 0;
  };

  const pos = [];
  const mesh = { pos };
  const cutThrough = model.routeMode === 'through' && routeDist;
  // same (a, c, b) flip as the other emitters so faces wind outward
  const push = (ax, ay, az, bx, by, bz, cx, cy, cz) => pos.push(ax, ay, az, cx, cy, cz, bx, by, bz);

  for (let j = 0; j < D; j++) {
    for (let i = 0; i < W; i++) {
      if (!inc(i, j)) continue;
      const x0 = X(i), x1 = X(i + 1), y0 = Y(j), y1 = Y(j + 1);
      const t00 = top(i, j), t10 = top(i + 1, j), t01 = top(i, j + 1), t11 = top(i + 1, j + 1);
      const b00 = bot(i, j), b10 = bot(i + 1, j), b01 = bot(i, j + 1), b11 = bot(i + 1, j + 1);
      if (cutThrough) {
        const v00 = { x: x0, y: y0, z: t00, bottom: b00, d: routeDist[j * VW + i] };
        const v10 = { x: x1, y: y0, z: t10, bottom: b10, d: routeDist[j * VW + i + 1] };
        const v11 = { x: x1, y: y1, z: t11, bottom: b11, d: routeDist[(j + 1) * VW + i + 1] };
        const v01 = { x: x0, y: y1, z: t01, bottom: b01, d: routeDist[(j + 1) * VW + i] };
        const bottom = v => v.bottom;
        addClippedPrismTriangle(mesh, [v00, v11, v10], channelHalf, false, bottom);
        addClippedPrismTriangle(mesh, [v00, v01, v11], channelHalf, false, bottom);
        if (!inc(i - 1, j)) addClippedBoundaryWall(mesh, v00, v01, channelHalf, false, bottom);
        if (!inc(i, j + 1)) addClippedBoundaryWall(mesh, v01, v11, channelHalf, false, bottom);
        if (!inc(i + 1, j)) addClippedBoundaryWall(mesh, v11, v10, channelHalf, false, bottom);
        if (!inc(i, j - 1)) addClippedBoundaryWall(mesh, v10, v00, channelHalf, false, bottom);
      } else {
        // top
        push(x0, y0, t00, x1, y0, t10, x1, y1, t11);
        push(x0, y0, t00, x1, y1, t11, x0, y1, t01);
        // bottom (reversed)
        push(x0, y0, b00, x1, y1, b11, x1, y0, b10);
        push(x0, y0, b00, x0, y1, b01, x1, y1, b11);
        // walls where the cap ends (degenerate zero-height quads get deduped away)
        if (!inc(i + 1, j)) {
          push(x1, y0, t10, x1, y0, b10, x1, y1, t11);
          push(x1, y1, t11, x1, y0, b10, x1, y1, b11);
        }
        if (!inc(i - 1, j)) {
          push(x0, y0, t00, x0, y1, t01, x0, y0, b00);
          push(x0, y1, t01, x0, y1, b01, x0, y0, b00);
        }
        if (!inc(i, j - 1)) {
          push(x0, y0, t00, x0, y0, b00, x1, y0, t10);
          push(x1, y0, t10, x0, y0, b00, x1, y0, b10);
        }
        if (!inc(i, j + 1)) {
          push(x0, y1, t01, x1, y1, t11, x0, y1, b01);
          push(x1, y1, t11, x1, y1, b11, x0, y1, b01);
        }
      }
    }
  }
  return pos;
}
root.TopoGeometry = { resolveRouteDims, pointInRing, pointInRegion, haversine, rasterizeWaterRings, shapeInsideFn, buildPartition, meshTri, lerpClipVertex, clipScalarPolygon, clipScalarSegment, addVerticalWall, addClippedPrismTriangle, addClippedBoundaryWall, buildGeometry, labelBodies, bodyMedians, flattenWaterHeights, buildCapCellMask, landMinOf, applyWaterLevel, splitVerticalTJunctions, buildBandSolidMesh, buildWaterCapMesh };
})(globalThis);
