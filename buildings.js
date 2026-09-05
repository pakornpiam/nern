/* OSM normalization keeps geographic vectors independent of the terrain grid. */
(function (root) {
  'use strict';
  const LIMIT = 10000, MAX_AREA = 100e6;
  const cache = new Map();
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  function metres(value) {
    if (value == null) return null;
    const text = String(value).trim();
    let match = text.match(/^(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)?$/i);
    if (match) return +match[1] > 0 ? +match[1] : null;
    match = text.match(/^(\d+(?:\.\d+)?)\s*(?:ft|feet|')\s*(?:(\d+(?:\.\d+)?)\s*(?:in|"))?$/i);
    return match && +match[1] > 0 ? +match[1] * 0.3048 + +(match[2] || 0) * 0.0254 : null;
  }
  function height(tags = {}) {
    const exact = metres(tags.height) || metres(tags['building:height']);
    if (exact) return { heightM: exact, heightSource: 'height' };
    const levels = Number(tags['building:levels']);
    if (Number.isFinite(levels) && levels > 0 && levels <= 500) return { heightM: levels * 3, heightSource: 'levels' };
    return { heightM: 9, heightSource: 'default' };
  }
  function inRing(p, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  const inPolygon = (p, rings) => inRing(p, rings[0]) && !rings.slice(1).some(r => inRing(p, r));
  function stitch(segments) {
    const todo = segments.filter(Boolean).map(g => g.filter(p => Number.isFinite(p.lon) && Number.isFinite(p.lat)).map(p => [p.lon, p.lat]));
    const rings = []; let invalid = 0;
    while (todo.length) {
      let ring = todo.pop();
      if (ring.length < 2) { invalid++; continue; }
      while (!same(ring[0], ring.at(-1))) {
        const i = todo.findIndex(r => r.length && (same(r[0], ring.at(-1)) || same(r.at(-1), ring.at(-1))));
        if (i < 0) break;
        let tail = todo.splice(i, 1)[0];
        if (!same(tail[0], ring.at(-1))) tail.reverse();
        ring = ring.concat(tail.slice(1));
      }
      ring = ring.filter((p, i) => !i || !same(p, ring[i - 1]));
      if (ring.length >= 4 && same(ring[0], ring.at(-1))) rings.push(ring.slice(0, -1));
      else invalid++;
    }
    return { rings, invalid };
  }
  function normalize(elements) {
    const isFeature = e => ['way', 'relation'].includes(e.type) &&
      ((e.tags?.building && e.tags.building !== 'no') || (e.tags?.['building:part'] && e.tags['building:part'] !== 'no'));
    const features = [], consumed = new Set(); let invalid = 0;
    // Relations first: only suppress member ways after a valid relation is built.
    const candidates = [...elements.filter(e => e.type === 'relation'), ...elements.filter(e => e.type === 'way')];
    for (const el of candidates) {
      if (!isFeature(el) || consumed.has(`${el.type}/${el.id}`)) continue;
      let polygons;
      if (el.type === 'relation') {
        if (el.tags.type !== 'multipolygon') continue;
        const members = el.members || [];
        const outer = stitch(members.filter(m => !m.role || m.role === 'outer').map(m => m.geometry));
        const inner = stitch(members.filter(m => m.role === 'inner').map(m => m.geometry));
        if (outer.invalid || inner.invalid || !outer.rings.length) { invalid++; continue; }
        polygons = outer.rings.map(r => [r]);
        for (const hole of inner.rings) {
          const owner = polygons.find(p => inRing(hole[0], p[0]));
          if (owner) owner.push(hole); else invalid++;
        }
        for (const m of members) if (m.type === 'way') consumed.add(`way/${m.ref}`);
      } else {
        const result = stitch([el.geometry]);
        if (result.invalid || !result.rings.length) { invalid++; continue; }
        polygons = result.rings.map(r => [r]);
      }
      const points = polygons.flat(2), xs = points.map(p => p[0]), ys = points.map(p => p[1]);
      const bbox = [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = 0; i < xs.length; i++) { bbox[0] = Math.min(bbox[0], xs[i]); bbox[1] = Math.min(bbox[1], ys[i]); bbox[2] = Math.max(bbox[2], xs[i]); bbox[3] = Math.max(bbox[3], ys[i]); }
      features.push({ id: `${el.type}/${el.id}`, polygons, bbox, part: !!el.tags['building:part'] && el.tags['building:part'] !== 'no', ...height(el.tags) });
      if (features.length > LIMIT) return { features: [], status: 'limit', invalid: 0 };
    }
    // A spatial bucket index keeps part/outline matching bounded for dense cities.
    const buckets = new Map(), size = 0.005;
    for (const part of features.filter(f => f.part)) {
      const p = part.polygons[0][0][0], key = `${Math.floor(p[0] / size)},${Math.floor(p[1] / size)}`;
      if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(part);
    }
    const explicit = new Set();
    for (const e of elements) if (e.type === 'relation' && e.tags?.type === 'building') {
      const members = e.members || [];
      if (members.some(m => m.role === 'part' && features.some(f => f.id === `${m.type}/${m.ref}`)))
        for (const m of members) if (m.role === 'outline') explicit.add(`${m.type}/${m.ref}`);
    }
    const filtered = features.filter(f => {
      if (f.part) return true;
      if (explicit.has(f.id)) return false;
      const [w, s, e, n] = f.bbox;
      for (let x = Math.floor(w / size); x <= Math.floor(e / size); x++) for (let y = Math.floor(s / size); y <= Math.floor(n / size); y++) {
        if ((buckets.get(`${x},${y}`) || []).some(p => {
          if (p.bbox[0] < w - 1e-7 || p.bbox[1] < s - 1e-7 || p.bbox[2] > e + 1e-7 || p.bbox[3] > n + 1e-7) return false;
          const center = [(p.bbox[0] + p.bbox[2]) / 2, (p.bbox[1] + p.bbox[3]) / 2];
          return f.polygons.some(poly => inPolygon(center, poly) || p.polygons[0][0].some(v => inPolygon(v, poly)));
        })) return false;
      }
      return true;
    });
    return { features: filtered, status: filtered.length ? 'ok' : 'empty', invalid };
  }
  async function fetchBuildings(bounds, { signal, enabled = true } = {}) {
    if (!enabled) return { features: [], status: 'off', invalid: 0 };
    const [w, h] = root.TopoTerrain.dimensions(bounds);
    if (w * h > MAX_AREA) return { features: [], status: 'area', invalid: 0 };
    const key = bounds.flat().map(n => n.toFixed(7)).join(',');
    if (cache.has(key)) return cache.get(key);
    const [[s, west], [n, east]] = bounds, bbox = `${s},${west},${n},${east}`;
    const query = `[out:json][timeout:25];(way[building][building!=no](${bbox});relation[building][building!=no](${bbox});way["building:part"]["building:part"!=no](${bbox});relation["building:part"]["building:part"!=no](${bbox});relation[type=building](${bbox}););out geom;`;
    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(35000)]),
      });
      if (!response.ok) throw new Error('lookup');
      const data = await response.json();
      if (data.remark || !Array.isArray(data.elements)) throw new Error('incomplete');
      const normalized = normalize(data.elements);
      if (cache.size >= 8) cache.delete(cache.keys().next().value);
      cache.set(key, normalized); return normalized;
    } catch (e) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      return { features: [], status: 'failed', invalid: 0 };
    }
  }
  root.TopoBuildings = { metres, height, normalize, fetchBuildings, inPolygon, LIMIT, MAX_AREA };
})(globalThis);
