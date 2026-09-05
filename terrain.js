/* Provider-independent elevation sampling. Keys live only in request closures. */
(function (root) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const decoders = {
    terrarium: (r, g, b) => r * 256 + g + b / 256 - 32768,
    maptiler: (r, g, b) => -10000 + (r * 65536 + g * 256 + b) * 0.1,
  };
  const tileCache = new Map();
  let cachedBytes = 0;
  const CACHE_BYTES = 64 * 1024 * 1024;
  const xAt = (lon, z) => (lon + 180) / 360 * 2 ** z;
  const yAt = (lat, z) => {
    const r = clamp(lat, -85.05112878, 85.05112878) * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z;
  };
  function dimensions(bounds) {
    const [[s, w], [n, e]] = bounds, rad = Math.PI / 180, R = 6371000;
    return [2 * R * Math.asin(Math.abs(Math.cos((s + n) / 2 * rad) * Math.sin((e - w) / 2 * rad))), R * Math.abs(n - s) * rad];
  }
  function coded(code) { const e = new Error(code); e.code = code; return e; }
  function abort(signal) { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); }
  async function request(url, { signal, fetcher = fetch, ...options } = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      abort(signal);
      try {
        const response = await fetcher(url, { ...options, signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(20000)]) });
        if (response.status === 401 || response.status === 403) throw coded('errTerrainAuth');
        if (!response.ok || response.status === 204) {
          const e = coded(response.status === 429 ? 'errTerrainQuota' : 'errTerrainTile');
          e.retryable = response.status === 429 || response.status >= 500;
          throw e;
        }
        return response;
      } catch (e) {
        abort(signal);
        if (e.code === 'errTerrainAuth' || e.retryable === false || attempt === 2) throw coded(e.code || 'errTerrainTile');
        await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
  }
  async function provider(id, key, signal) {
    if (id === 'terrarium') return {
      id, name: 'AWS Terrarium', minZoom: 1, maxZoom: 15, tileSize: 256,
      attribution: 'Elevation: Mapzen / AWS Open Data terrain tiles',
      url: (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
    };
    if (id !== 'maptiler') throw coded('errTerrainProvider');
    if (!key?.trim()) throw coded('errTerrainKey');
    const auth = key.trim();
    const meta = await (await request(`https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${encodeURIComponent(auth)}`, { signal })).json();
    const template = meta.tiles?.[0];
    if (!template || !Number.isFinite(meta.maxzoom)) throw coded('errTerrainMetadata');
    // Only send the key to the selected provider, never an arbitrary metadata host.
    if (new URL(template).origin !== 'https://api.maptiler.com') throw coded('errTerrainMetadata');
    return {
      id, name: 'MapTiler Terrain RGB', minZoom: meta.minzoom ?? 0, maxZoom: meta.maxzoom,
      tileSize: meta.tileSize || meta.tilesize || 512,
      attribution: 'Elevation: MapTiler Terrain RGB v2 (https://www.maptiler.com/copyright/)',
      url: (z, x, y) => {
        const url = new URL(template.replace('{z}', z).replace('{x}', x).replace('{y}', y));
        url.searchParams.set('key', auth); return url.href;
      },
    };
  }
  function tileRect(bounds, z, size) {
    const [[s, w], [n, e]] = bounds, last = 2 ** z - 1;
    // Include both pixels needed by interpolation, including adjacent tiles.
    return {
      x0: clamp(Math.floor((xAt(w, z) * size - 0.5) / size), 0, last),
      x1: clamp(Math.floor((xAt(e, z) * size + 0.5) / size), 0, last),
      y0: clamp(Math.floor((yAt(n, z) * size - 0.5) / size), 0, last),
      y1: clamp(Math.floor((yAt(s, z) * size + 0.5) / size), 0, last),
    };
  }
  function choose(bounds, samples, p, budget = 36) {
    const [[s, w], [n, e]] = bounds;
    if (!(s < n && w < e && s >= -85.05112878 && n <= 85.05112878 && w >= -180 && e <= 180)) throw coded('errTerrainBounds');
    const dims = dimensions(bounds), spacing = Math.max(...dims) / samples;
    const base = 40075016.686 * Math.cos((s + n) / 2 * Math.PI / 180) / p.tileSize;
    const requested = clamp(Math.ceil(Math.log2(base / spacing)), p.minZoom, p.maxZoom);
    let zoom = requested, rect;
    for (;;) {
      rect = tileRect(bounds, zoom, p.tileSize);
      if ((rect.x1 - rect.x0 + 1) * (rect.y1 - rect.y0 + 1) <= budget || zoom === p.minZoom) break;
      zoom--;
    }
    return { zoom, rect, limited: zoom < requested, tileSpacing: base / 2 ** zoom, meshSpacing: spacing, dimensions: dims };
  }
  async function decode(blob, p) {
    const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    try {
      if (bitmap.width !== p.tileSize || bitmap.height !== p.tileSize) throw coded('errTerrainMetadata');
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const heights = new Float32Array(bitmap.width * bitmap.height);
      for (let i = 0; i < heights.length; i++) heights[i] = pixels[i * 4 + 3] === 255
        ? decoders[p.id](pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]) : NaN;
      return heights;
    } finally { bitmap.close(); }
  }
  async function tile(p, z, x, y, signal) {
    const cacheKey = `${p.id}:${p.tileSize}:${z}:${x}:${y}`;
    if (tileCache.has(cacheKey)) {
      const hit = tileCache.get(cacheKey); tileCache.delete(cacheKey); tileCache.set(cacheKey, hit); return hit;
    }
    const response = await request(p.url(z, x, y), { signal });
    let heights;
    try { heights = await decode(await response.blob(), p); }
    catch (e) { throw coded(e.code || 'errTerrainTile'); }
    abort(signal);
    while (cachedBytes + heights.byteLength > CACHE_BYTES && tileCache.size) {
      const oldest = tileCache.keys().next().value;
      cachedBytes -= tileCache.get(oldest).byteLength; tileCache.delete(oldest);
    }
    tileCache.set(cacheKey, heights); cachedBytes += heights.byteLength;
    return heights;
  }
  async function pool(jobs, work, signal, concurrency = 6) {
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
      while (cursor < jobs.length) { abort(signal); const job = jobs[cursor++]; await work(job); }
    }));
  }
  function sampler(tiles, p, zoom, rect) {
    const size = p.tileSize;
    const pixel = (x, y) => {
      x = clamp(x, rect.x0 * size, (rect.x1 + 1) * size - 1);
      y = clamp(y, rect.y0 * size, (rect.y1 + 1) * size - 1);
      return tiles.get(`${Math.floor(x / size)},${Math.floor(y / size)}`)[(y % size) * size + x % size];
    };
    return (lat, lon) => {
      const gx = xAt(lon, zoom) * size - 0.5, gy = yAt(lat, zoom) * size - 0.5;
      const x = Math.floor(gx), y = Math.floor(gy), fx = gx - x, fy = gy - y;
      const h = [pixel(x, y), pixel(x + 1, y), pixel(x, y + 1), pixel(x + 1, y + 1)];
      if (h.some(v => !Number.isFinite(v))) throw coded('errTerrainTile');
      return (h[0] * (1 - fx) + h[1] * fx) * (1 - fy) + (h[2] * (1 - fx) + h[3] * fx) * fy;
    };
  }
  async function elevation(bounds, samples, { id = 'terrarium', key = '', signal, onProgress = () => {} } = {}) {
    const p = await provider(id, key, signal), choice = choose(bounds, samples, p);
    const { zoom, rect } = choice, jobs = [], tiles = new Map();
    for (let y = rect.y0; y <= rect.y1; y++) for (let x = rect.x0; x <= rect.x1; x++) jobs.push([x, y]);
    let done = 0;
    const downloads = new AbortController();
    const downloadSignal = AbortSignal.any([...(signal ? [signal] : []), downloads.signal]);
    try {
      await pool(jobs, async ([x, y]) => {
        tiles.set(`${x},${y}`, await tile(p, zoom, x, y, downloadSignal));
        abort(downloadSignal); onProgress(++done, jobs.length);
      }, downloadSignal);
    } catch (e) { downloads.abort(); throw e; }
    const sample = sampler(tiles, p, zoom, rect), W = samples, D = samples, VW = W + 1, VD = D + 1;
    const Hv0 = new Float32Array(VW * VD), [[s, w], [n, e]] = bounds;
    let minE0 = Infinity, maxE0 = -Infinity;
    for (let j = 0; j <= D; j++) {
      abort(signal);
      for (let i = 0; i <= W; i++) {
        const h = sample(n + j / D * (s - n), w + i / W * (e - w));
        Hv0[j * VW + i] = h; minE0 = Math.min(minE0, h); maxE0 = Math.max(maxE0, h);
      }
    }
    return { Hv0, W, D, VW, VD, bounds, samples, minE0, maxE0, zoom,
      terrainInfo: { provider: id, source: p.name, attribution: p.attribution, tileSpacing: choice.tileSpacing,
        meshSpacing: choice.meshSpacing, limited: choice.limited, tiles: jobs.length } };
  }
  root.TopoTerrain = { elevation, dimensions, decoders, choose, provider, request, pool, sampler, tileRect };
})(globalThis);
