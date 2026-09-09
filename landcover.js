/* Geographic land-cover sources stay independent of print size and grid detail. */
(function (root) {
  'use strict';
  // 15,000 rather than the area box's own 14,400 km2 ceiling: setArea clamps in
  // kilometres while this measures with spherical math, so the headroom guarantees
  // every box the user can actually draw gets through. Region selections are not
  // clamped at all and can still land above this.
  const MAX_AREA = 15000e6, LIMIT = 40000, MAX_VERTICES = 800000;
  const MAX_DETAIL = 1000;   // mirrors the #res slider ceiling in index.html
  /* One Overpass request per TILE_AREA of ground. A single request covering a whole
     large selection does not survive [timeout:25]: it returns HTTP 200 carrying a
     remark, which reads as an ordinary failure ~25 s later. Concurrency 2 because
     overpass-api.de allows about two slots per IP -- this is the only place in the app
     that issues concurrent Overpass calls. */
  const TILE_AREA = 1000e6, MAX_TILES = 25, TILE_CONCURRENCY = 2;
  const CATEGORIES = ['water', 'snow', 'forest', 'grass', 'other'];
  /* The code IS the index into CATEGORIES, and the order IS the precedence: classify()
     keeps the LOWEST code where polygons overlap, so a glacier beats a wood it sits
     inside. OTHER is simultaneously the unmapped return, classify()'s fill sentinel and
     that Math.min ceiling, so it has to stay last. */
  const CODE = Object.freeze(Object.fromEntries(CATEGORIES.map((c, i) => [c, i])));
  const OTHER = CATEGORIES.length - 1;
  const cache = new Map();
  const fail = code => { const error = new Error(code); error.code = code; return error; };
  const abort = signal => { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); };
  function category(tags = {}) {
    /* OSM records PERMANENT ice only. There is no seasonal-snow tag at all, and
       landuse=winter_sports is a ski-resort boundary rather than snow -- it routinely
       contains forest -- so it is deliberately left unmapped. */
    if (tags.natural === 'glacier' || tags.natural === 'snowfield') return CODE.snow;
    if (tags.natural === 'wood' || tags.landuse === 'forest') return CODE.forest;
    if (['grassland', 'scrub', 'heath'].includes(tags.natural) ||
      ['grass', 'meadow', 'farmland', 'orchard', 'vineyard', 'allotments'].includes(tags.landuse)) return CODE.grass;
    return OTHER;
  }
  function stitch(segments) {
    const same = (a, b) => a[0] === b[0] && a[1] === b[1];
    const todo = segments.map(g => {
      if (!Array.isArray(g) || g.some(p => !Number.isFinite(p.lon) || !Number.isFinite(p.lat))) throw fail('invalid');
      return g.map(p => [p.lon, p.lat]);
    });
    const rings = [];
    while (todo.length) {
      let ring = todo.pop();
      if (ring.length < 2) throw fail('invalid');
      while (!same(ring[0], ring.at(-1))) {
        const i = todo.findIndex(r => r.length && (same(r[0], ring.at(-1)) || same(r.at(-1), ring.at(-1))));
        if (i < 0) throw fail('invalid');
        const tail = todo.splice(i, 1)[0];
        if (!same(tail[0], ring.at(-1))) tail.reverse();
        ring = ring.concat(tail.slice(1));
      }
      ring = ring.filter((p, i) => !i || !same(p, ring[i - 1]));
      if (ring.length < 4) throw fail('invalid');
      rings.push(ring.slice(0, -1));
    }
    return rings;
  }
  /* The finest cell this selection could EVER resolve, in degrees per axis: the grid
     pins its long side to the detail slider, which stops at MAX_DETAIL. A feature smaller
     than that in both axes cannot be drawn at any detail setting, so dropping it costs
     nothing and saves the stitching. Deriving the threshold from the BOUNDS rather than
     the chosen detail is what keeps this file's promise that its data is independent of
     print size and grid detail -- and so keeps one cache entry valid across detail
     changes. Both axes, like rasterizeWaterRings: a long thin strip still counts. */
  function cellSpan(bounds) {
    if (!bounds) return null;
    const [[s, w], [n, e]] = bounds, [wM, hM] = root.TopoTerrain.dimensions(bounds);
    if (!(wM > 0 && hM > 0)) return null;
    const cell = Math.max(wM, hM) / MAX_DETAIL;
    return [cell * (e - w) / wM, cell * (n - s) / hM];
  }
  function normalize(elements, minSpan) {
    const features = [], consumed = new Set(); let invalid = 0, vertices = 0;
    // Check the input budget too, before copying or stitching potentially huge rings,
    // and count only what survives the size filter.
    const kept = []; let inputVertices = 0;
    for (const e of elements) {
      const geometries = e.geometry ? [e.geometry] : (e.members || []).map(m => m.geometry).filter(Boolean);
      if (minSpan && geometries.length) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const g of geometries) for (const p of g) {
          x0 = Math.min(x0, p.lon); x1 = Math.max(x1, p.lon);
          y0 = Math.min(y0, p.lat); y1 = Math.max(y1, p.lat);
        }
        if (x1 - x0 < minSpan[0] && y1 - y0 < minSpan[1]) continue;
      }
      kept.push(e);
      for (const g of geometries) inputVertices += g.length;
      if (inputVertices > MAX_VERTICES) throw fail('errLandcoverLimit');
    }
    const candidates = kept.filter(e => e.type === 'relation').concat(kept.filter(e => e.type === 'way'));
    for (const el of candidates) {
      const kind = category(el.tags);
      if (kind === OTHER || consumed.has(`${el.type}/${el.id}`)) continue;
      try {
        let polygons;
        if (el.type === 'relation') {
          if (el.tags?.type !== 'multipolygon') continue;
          const members = (el.members || []).filter(m => m.type === 'way');
          const outer = stitch(members.filter(m => !m.role || m.role === 'outer').map(m => m.geometry));
          if (!outer.length) throw fail('invalid');
          polygons = outer.map(r => [r]);
          // A bad hole is not worth the whole feature -- one unclosable inner ring used to
          // discard every outer ring with it, losing a forest to a clearing. Same tolerance
          // buildings.js already applies to its own orphan holes.
          let inner = [];
          try { inner = stitch(members.filter(m => m.role === 'inner').map(m => m.geometry)); }
          catch (e) { if (e.code !== 'invalid') throw e; invalid++; }
          for (const hole of inner) {
            const owner = polygons.find(p => root.TopoBuildings.inPolygon(hole[0], p));
            if (owner) owner.push(hole); else invalid++;
          }
          /* Only the outer ring is this relation's own outline. An inner member is a hole,
             and in the standard OSM idiom it carries its own tag -- a meadow or scrub
             clearing inside a wood -- so consuming it left that ground painted by nobody:
             punched out of the forest and then skipped in its own right. An untagged inner
             way needs no protection, since it is dropped anyway when its turn comes. */
          for (const m of members) if (!m.role || m.role === 'outer') consumed.add(`way/${m.ref}`);
        } else polygons = stitch([el.geometry]).map(r => [r]);
        const bbox = [Infinity, Infinity, -Infinity, -Infinity];
        for (const poly of polygons) for (const ring of poly) for (const [x, y] of ring) {
          vertices++; bbox[0] = Math.min(bbox[0], x); bbox[1] = Math.min(bbox[1], y);
          bbox[2] = Math.max(bbox[2], x); bbox[3] = Math.max(bbox[3], y);
        }
        features.push({ id: `${el.type}/${el.id}`, category: kind, polygons, bbox });
      } catch (e) { if (e.code !== 'invalid') throw e; invalid++; }
      if (features.length > LIMIT || vertices > MAX_VERTICES) throw fail('errLandcoverLimit');
    }
    return { features, invalid, status: features.length ? 'ok' : 'empty' };
  }
  // Even lat/lon subdivision, sized so each request stays near the area one Overpass
  // query reliably answers. An elongated selection splits along its long axis alone.
  function tileBoxes(bounds) {
    const [[s, w], [n, e]] = bounds, [wM, hM] = root.TopoTerrain.dimensions(bounds);
    const side = Math.sqrt(TILE_AREA);
    const nx = Math.max(1, Math.ceil(wM / side)), ny = Math.max(1, Math.ceil(hM / side));
    const boxes = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) boxes.push([
      [s + (n - s) * j / ny, w + (e - w) * i / nx],
      [s + (n - s) * (j + 1) / ny, w + (e - w) * (i + 1) / nx],
    ]);
    return boxes;
  }
  const backoff = attempt => new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
  /* Public Overpass rate-limits and times out as a matter of course, and one tile lost to a
     transient 429 takes a whole rectangle of ground with it -- half the map on a two-tile
     selection, and nothing about the result says which half. Same retry ladder as
     TopoTerrain.request, with a longer wait: these are queue slots, not static tiles. */
  async function requestBox(box, fetcher, signal) {
    const [[s, west], [n, east]] = box, bbox = `${s},${west},${n},${east}`;
    const filters = ['natural~"^(wood|grassland|scrub|heath|glacier|snowfield)$"', 'landuse~"^(forest|grass|meadow|farmland|orchard|vineyard|allotments)$"'];
    const query = `[out:json][timeout:25];(${filters.flatMap(f => ['way', 'relation'].map(type => `${type}[${f}](${bbox});`)).join('')});out geom;`;
    for (let attempt = 0; ; attempt++) {
      abort(signal);
      const last = attempt >= 2;
      let data;
      try {
        const response = await fetcher('https://overpass-api.de/api/interpreter', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query),
          signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(35000)]),
        });
        // 429 is a busy slot and 5xx a stumble; a 400 means the query itself is wrong and
        // will be just as wrong next time.
        if (!response.ok) {
          if (last || !(response.status === 429 || response.status >= 500)) throw fail('errLandcoverFetch');
          await backoff(attempt); continue;
        }
        data = await response.json();
      } catch (e) {
        abort(signal);
        if (last || e.code === 'errLandcoverFetch') throw fail('errLandcoverFetch');
        await backoff(attempt); continue;   // network error or client timeout
      }
      if (!Array.isArray(data.elements)) throw fail('errLandcoverFetch');
      /* A server-side timeout answers 200 with a remark AND the elements it did manage to
         collect -- often most of them. Discarding that was throwing away a usable answer.
         Keep it and let the caller report the tile as incomplete; only retry when the
         remark came with nothing at all. */
      if (data.remark && !data.elements.length) {
        if (last) throw fail('errLandcoverFetch');
        await backoff(attempt); continue;
      }
      return { elements: data.elements, complete: !data.remark };
    }
  }
  async function fetchLandcover(bounds, { signal, enabled = true, fetcher = fetch, onProgress } = {}) {
    abort(signal);
    if (!enabled) return { features: [], invalid: 0, status: 'off' };
    const [[s, w], [n, e]] = bounds;
    // dimensions() takes sin((e-w)/2), so a bounds that wraps the date line measures as
    // nearly zero and would sail through the area guard. Reject it here: land cover is
    // fetched before the elevation grid, so it meets bad bounds first.
    if (!(s < n && w < e)) throw fail('errLandcoverArea');
    const [wM, hM] = root.TopoTerrain.dimensions(bounds);
    if (wM * hM > MAX_AREA) throw fail('errLandcoverArea');
    const key = bounds.flat().map(v => v.toFixed(7)).join(',');
    if (cache.has(key)) return cache.get(key);
    const boxes = tileBoxes(bounds);
    if (boxes.length > MAX_TILES) throw fail('errLandcoverArea');
    /* A bbox selects everything INTERSECTING it and out geom returns that whole, so an
       element straddling tiles arrives complete from each of them. Dedupe by identity,
       then normalize ONCE over the merged set: run per tile, its consumed set would let
       one tile emit a multipolygon's member ways standalone while another emits the
       relation, painting the same ground twice. */
    const merged = new Map();
    // Separate counts: a tile that answered partially still contributed ground, so it must
    // not count towards "every tile failed", but the user is still owed the warning.
    let failed = 0, truncated = 0, done = 0;
    try {
      await root.TopoTerrain.pool(boxes, async box => {
        try {
          const { elements, complete } = await requestBox(box, fetcher, signal);
          for (const el of elements) merged.set(`${el.type}/${el.id}`, el);
          if (!complete) truncated++;
        } catch (e) {
          abort(signal);   // a cancelled build is not a missing tile
          failed++;
        }
        onProgress?.(++done, boxes.length);
      }, signal, TILE_CONCURRENCY);
      abort(signal);
      const missing = failed + truncated;
      if (failed === boxes.length) throw fail('errLandcoverFetch');
      const result = normalize([...merged.values()], cellSpan(bounds));
      abort(signal);
      result.tiles = boxes.length; result.missing = missing;
      // A hole is not a result to remember: leaving it uncached is what lets Generate
      // go back for the tiles that failed.
      if (missing) { result.status = 'partial'; return result; }
      if (cache.size >= 8) cache.delete(cache.keys().next().value);
      cache.set(key, result); return result;
    } catch (e) { abort(signal); throw fail(e.code === 'errLandcoverLimit' ? e.code : 'errLandcoverFetch'); }
  }
  /* Scanline fill evaluates cell centers; holes use even/odd parity per polygon.
     Each edge is bucketed once by the first row it can cross and retired when its last
     row passes, so the cost is the edge count plus the crossings actually produced.
     Re-walking every edge for every row the polygon spans -- which is what this used to
     do -- costs edges x rows, and at the vertex budget above one large forest spanning
     the selection would be hundreds of millions of tests. The edge set per row is
     identical either way, so the raster is unchanged. */
  function classify(data, bounds, W, D) {
    const cells = new Uint8Array(W * D).fill(OTHER);
    const [[s, w], [n, e]] = bounds, dx = (e - w) / W, dy = (n - s) / D;
    const rowAt = y => (n - y) / dy - 0.5;   // the fractional row whose center sits at y
    for (const f of data.features) for (const poly of f.polygons) {
      // An edge spans the rows whose center y satisfies ylo <= y < yhi, and y falls as
      // the row index rises -- hence yhi giving the FIRST row and ylo the last.
      const edges = []; let j0 = Infinity, j1 = -Infinity;
      for (const ring of poly) for (let k = 0, prev = ring.length - 1; k < ring.length; prev = k++) {
        const a = ring[prev], b = ring[k];
        const ylo = Math.min(a[1], b[1]), yhi = Math.max(a[1], b[1]);
        if (ylo === yhi) continue;             // horizontal: crosses no cell center
        const lo = Math.max(0, Math.floor(rowAt(yhi)) + 1), hi = Math.min(D - 1, Math.floor(rowAt(ylo)));
        if (lo > hi) continue;
        edges.push({ a, b, lo, hi });
        if (lo < j0) j0 = lo;
        if (hi > j1) j1 = hi;
      }
      if (!edges.length) continue;
      const starts = Array.from({ length: j1 - j0 + 1 }, () => []);
      for (const edge of edges) starts[edge.lo - j0].push(edge);
      let active = [];
      for (let j = j0; j <= j1; j++) {
        if (starts[j - j0].length) active = active.concat(starts[j - j0]);
        if (active.some(edge => edge.hi < j)) active = active.filter(edge => edge.hi >= j);
        if (!active.length) continue;
        const y = n - (j + 0.5) * dy, crossings = [];
        for (const { a, b } of active) crossings.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
        crossings.sort((a, b) => a - b);
        for (let k = 0; k + 1 < crossings.length; k += 2) {
          const i0 = Math.max(0, Math.ceil((crossings[k] - w) / dx - 0.5));
          const i1 = Math.min(W, Math.ceil((crossings[k + 1] - w) / dx - 0.5));
          for (let i = i0; i < i1; i++) cells[j * W + i] = Math.min(cells[j * W + i], f.category);
        }
      }
    }
    return cells;
  }
  root.TopoLandcover = { CATEGORIES, CODE, OTHER, MAX_AREA, LIMIT, MAX_VERTICES, MAX_DETAIL,
    TILE_AREA, MAX_TILES, category, cellSpan, tileBoxes, normalize, fetchLandcover, classify };
})(globalThis);
