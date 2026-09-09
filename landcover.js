/* Geographic land-cover sources stay independent of print size and grid detail. */
(function (root) {
  'use strict';
  const MAX_AREA = 1000e6, LIMIT = 10000, MAX_VERTICES = 200000;
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
  function normalize(elements) {
    const features = [], consumed = new Set(); let invalid = 0, vertices = 0;
    // Check the input budget too, before copying or stitching potentially huge rings.
    let inputVertices = 0;
    for (const e of elements) {
      inputVertices += e.geometry?.length || 0;
      for (const m of e.members || []) inputVertices += m.geometry?.length || 0;
      if (inputVertices > MAX_VERTICES) throw fail('errLandcoverLimit');
    }
    const candidates = elements.filter(e => e.type === 'relation').concat(elements.filter(e => e.type === 'way'));
    for (const el of candidates) {
      const kind = category(el.tags);
      if (kind === OTHER || consumed.has(`${el.type}/${el.id}`)) continue;
      try {
        let polygons;
        if (el.type === 'relation') {
          if (el.tags?.type !== 'multipolygon') continue;
          const members = (el.members || []).filter(m => m.type === 'way');
          const outer = stitch(members.filter(m => !m.role || m.role === 'outer').map(m => m.geometry));
          const inner = stitch(members.filter(m => m.role === 'inner').map(m => m.geometry));
          if (!outer.length) throw fail('invalid');
          polygons = outer.map(r => [r]);
          for (const hole of inner) {
            const owner = polygons.find(p => root.TopoBuildings.inPolygon(hole[0], p));
            if (!owner) throw fail('invalid');
            owner.push(hole);
          }
          for (const m of members) consumed.add(`way/${m.ref}`);
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
  async function fetchLandcover(bounds, { signal, enabled = true, fetcher = fetch } = {}) {
    abort(signal);
    if (!enabled) return { features: [], invalid: 0, status: 'off' };
    const [w, h] = root.TopoTerrain.dimensions(bounds);
    if (w * h > MAX_AREA) throw fail('errLandcoverArea');
    const key = bounds.flat().map(n => n.toFixed(7)).join(',');
    if (cache.has(key)) return cache.get(key);
    const [[s, west], [n, east]] = bounds, bbox = `${s},${west},${n},${east}`;
    const filters = ['natural~"^(wood|grassland|scrub|heath|glacier|snowfield)$"', 'landuse~"^(forest|grass|meadow|farmland|orchard|vineyard|allotments)$"'];
    const query = `[out:json][timeout:25];(${filters.flatMap(f => ['way', 'relation'].map(type => `${type}[${f}](${bbox});`)).join('')});out geom;`;
    try {
      const response = await fetcher('https://overpass-api.de/api/interpreter', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(35000)]),
      });
      if (!response.ok) throw fail('errLandcoverFetch');
      const data = await response.json(); abort(signal);
      if (data.remark || !Array.isArray(data.elements)) throw fail('errLandcoverFetch');
      const result = normalize(data.elements); abort(signal);
      if (cache.size >= 8) cache.delete(cache.keys().next().value);
      cache.set(key, result); return result;
    } catch (e) { abort(signal); throw fail(e.code === 'errLandcoverLimit' ? e.code : 'errLandcoverFetch'); }
  }
  // Scanline fill evaluates cell centers; holes use even/odd parity per polygon.
  function classify(data, bounds, W, D) {
    const cells = new Uint8Array(W * D).fill(OTHER);
    const [[s, w], [n, e]] = bounds, dx = (e - w) / W, dy = (n - s) / D;
    for (const f of data.features) for (const poly of f.polygons) {
      let lo = Infinity, hi = -Infinity;
      for (const ring of poly) for (const p of ring) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
      const j0 = Math.max(0, Math.ceil((n - hi) / dy - 0.5)), j1 = Math.min(D - 1, Math.floor((n - lo) / dy - 0.5));
      for (let j = j0; j <= j1; j++) {
        const y = n - (j + 0.5) * dy, crossings = [];
        for (const ring of poly) for (let k = 0, prev = ring.length - 1; k < ring.length; prev = k++) {
          const a = ring[prev], b = ring[k];
          if ((a[1] > y) !== (b[1] > y)) crossings.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
        }
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
  root.TopoLandcover = { CATEGORIES, CODE, OTHER, MAX_AREA, LIMIT, MAX_VERTICES, category, normalize, fetchLandcover, classify };
})(globalThis);
