const { test, expect } = require('@playwright/test');
const { source, options } = require('../fixtures.cjs');

async function setup(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Map imagery isn't needed for the geometry fixtures.
  await page.route(/https:\/\/.*(?:tile\.openstreetmap\.org|tile\.opentopomap\.org)\//, route => route.abort());
  await page.goto('/?lang=en');
  await expect(page.locator('#generate')).toBeEnabled();
  return errors;
}
async function installFixture(page, opts = {}) {
  const src = source({ samples: opts.samples || 24, slope: 4, water: !!opts.water });
  const serial = { ...src, Hv0: Array.from(src.Hv0), osmWater: Array.from(src.osmWater) };
  await page.evaluate(({ src, opts }) => {
    src.Hv0 = new Float32Array(src.Hv0); src.osmWater = new Uint8Array(src.osmWater);
    window.fixtureSrc = src;
    getTerrainSources = async (input, progress, signal) => {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      return { ...src, buildings: input.includeBuildings ? src.buildings : { features: [], status: 'off' } };
    };
    $('nx').value = opts.nx || 1;
  }, { src: serial, opts });
}

test('controls, city generation, water rebuild, language, STL ZIP and 3MF exports', async ({ page }) => {
  const errors = await setup(page);
  await expect(page.locator('#res')).toHaveValue('400');
  await page.selectOption('#detailPreset', '800'); await expect(page.locator('#res')).toHaveValue('800');
  await page.locator('#areaExact').fill('0.25'); await page.locator('#areaExact').dispatchEvent('change');
  expect(await page.evaluate(() => state.areaKm)).toBe(0.25);
  await installFixture(page, { nx: 2, water: true });
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();
  await expect(page.locator('#buildingStat')).toContainText('1');
  expect(await page.evaluate(() => state.model.cityInfo.count)).toBe(1);
  await page.locator('#waterFlatten').check();
  await expect.poll(() => page.evaluate(() => !rebuildController && !!state.model.flatWater)).toBe(true);
  expect(await page.evaluate(() => state.model.cityInfo.count)).toBe(1);
  await page.click('#langTh'); await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expect(page.locator('#buildingStat')).toContainText('ประมาณ');
  await page.click('#langEn');
  const result = await page.evaluate(async () => {
    const model = state.model;
    const stl = combinedBinarySTL(model), count = new DataView(stl).getUint32(80, true);
    const zip = new JSZip(); addModelStls(zip, model);
    const readme = await zip.file('README.txt').async('string');
    const files = await buildBambuFiles(model), archive = await JSZip.loadAsync(files.terrainBlob);
    const xml = await archive.file('3D/3dmodel.model').async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    return { count, expected: model.pieces.reduce((n, p) => n + p.pos.length / 9, 0), readme,
      stls: Object.keys(zip.files).filter(n => n.endsWith('.stl')).length,
      xmlErrors: doc.querySelectorAll('parsererror').length,
      maxZ: Math.max(...[...doc.querySelectorAll('vertex')].map(v => +v.getAttribute('z'))), modelMaxZ: model.maxZ,
      profile: JSON.parse(await archive.file('Metadata/project_settings.config').async('string')) };
  });
  expect(result.count).toBe(result.expected); expect(result.stls).toBe(2);
  expect(result.readme).toContain('Buildings: 1'); expect(result.xmlErrors).toBe(0);
  expect(result.maxZ).toBeCloseTo(result.modelMaxZ, 2); expect(result.profile.top_shell_layers).toBe('6');
  expect(errors).toEqual([]);
});

test('provider selection, missing key, cancellation and stale inputs', async ({ page }) => {
  const errors = await setup(page);
  await page.selectOption('#terrainSource', 'maptiler');
  await expect(page.locator('#terrainKey')).toBeVisible();
  await page.click('#generate');
  await expect(page.locator('#status')).toContainText('Enter your MapTiler API key');
  await page.selectOption('#terrainSource', 'terrarium');
  await installFixture(page);
  await page.click('#generate'); await expect(page.locator('#exportOne')).toBeEnabled();
  await page.evaluate(() => {
    window.previousModel = state.model;
    getTerrainSources = (_opts, _progress, signal) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
    });
  });
  await page.click('#generate'); await page.click('#cancelGeneration');
  await expect(page.locator('#generate')).toBeEnabled();
  expect(await page.evaluate(() => state.model === window.previousModel)).toBe(true);
  await page.click('#generate');
  await page.locator('#res').fill('600');
  await expect(page.locator('#generate')).toBeEnabled();
  expect(await page.evaluate(() => state.model === window.previousModel)).toBe(true);
  expect(errors).toEqual([]);
});

test('worker remains cancellable during a high-detail build', async ({ page }) => {
  await setup(page); await installFixture(page, { samples: 800 });
  await page.click('#generate');
  await expect(page.locator('#cancelGeneration')).toBeVisible();
  await page.click('#cancelGeneration');
  await expect(page.locator('#generate')).toBeEnabled({ timeout: 10000 });
  await expect(page.locator('#status')).toContainText('Cancelled');
});

test('real image decoding, provider cache isolation, retries and authentication errors', async ({ page }) => {
  await setup(page);
  const images = await page.evaluate(() => {
    const encode = (size, rgb) => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = `rgb(${rgb.join(',')})`; ctx.fillRect(0, 0, size, size);
      return canvas.toDataURL().split(',')[1];
    };
    return { free: encode(256, [131, 232, 0]), paid: encode(512, [1, 173, 176]) }; // 1000 and 1000 m
  });
  let freeCalls = 0, paidCalls = 0, metadataCalls = 0;
  await page.route('https://s3.amazonaws.com/elevation-tiles-prod/**', async route => {
    freeCalls++;
    if (freeCalls <= 2) await route.fulfill({ status: 503, body: '' });
    else await route.fulfill({ contentType: 'image/png', body: Buffer.from(images.free, 'base64') });
  });
  await page.route('https://api.maptiler.com/**', async route => {
    if (route.request().url().includes('tiles.json')) {
      metadataCalls++;
      if (route.request().url().includes('bad-key')) { await route.fulfill({ status: 403, body: '' }); return; }
      await route.fulfill({ json: { minzoom: 0, maxzoom: 14, tiles: ['https://api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.webp'] } });
    } else { paidCalls++; await route.fulfill({ contentType: 'image/png', body: Buffer.from(images.paid, 'base64') }); }
  });
  const result = await page.evaluate(async () => {
    const bounds = [[1, 1], [1.002, 1.002]];
    const free = await TopoTerrain.elevation(bounds, 60);
    const again = await TopoTerrain.elevation(bounds, 60);
    const paid = await TopoTerrain.elevation(bounds, 60, { id: 'maptiler', key: 'fixture-key' });
    let error;
    try { await TopoTerrain.elevation(bounds, 60, { id: 'maptiler', key: 'bad-key' }); } catch (e) { error = e.code; }
    return { free: free.minE0, again: again.maxE0, paid: paid.minE0, info: paid.terrainInfo, error,
      stored: Object.keys(localStorage).filter(k => /key|terrain/i.test(k)), secretInSource: JSON.stringify(paid).includes('fixture-key') };
  });
  expect(result.free).toBe(1000); expect(result.again).toBe(1000); expect(result.paid).toBeCloseTo(1000);
  expect(freeCalls).toBeGreaterThanOrEqual(3); expect(paidCalls).toBeGreaterThan(0); expect(metadataCalls).toBe(2);
  expect(result.error).toBe('errTerrainAuth'); expect(result.stored).toEqual([]); expect(result.secretInSource).toBe(false);
});

test('separate regions include buildings in every exported model and download works', async ({ page }) => {
  const errors = await setup(page); await installFixture(page);
  await page.evaluate(() => {
    state.selectedRegions = [1, 2].map(id => ({ id: String(id), name: `District ${id}`, color: '#4dd0a7', bounds: fixtureSrc.bounds,
      polygons: [{ bbox: [0, 0, 0.002, 0.002], rings: [[[0, 0], [0.002, 0], [0.002, 0.002], [0, 0.002]]] }] }));
    state.regionOutputMode = 'separate';
  });
  await page.click('#generate'); await expect(page.locator('#exportOne')).toBeEnabled();
  expect(await page.evaluate(() => state.models.map(m => m.cityInfo.count))).toEqual([1, 1]);
  // Exercise the download handlers directly without submitting a test lead.
  const download = page.waitForEvent('download');
  await page.evaluate(() => exportZip());
  // Exports are named after the regions they contain, not a fixed product name.
  expect((await download).suggestedFilename()).toBe('district_1_district_2_pieces.zip');
  const result = await page.evaluate(async () => {
    const maxes = [];
    for (const model of state.models) {
      const files = await buildBambuFiles(model), zip = await JSZip.loadAsync(files.terrainBlob);
      const xml = new DOMParser().parseFromString(await zip.file('3D/3dmodel.model').async('string'), 'application/xml');
      maxes.push(Math.max(...[...xml.querySelectorAll('vertex')].map(v => +v.getAttribute('z'))));
    }
    return maxes;
  });
  expect(result.every(z => z > 10)).toBe(true); expect(errors).toEqual([]);
});

test('building lookup outcomes remain visible and camera fits a narrow preview', async ({ page }) => {
  const errors = await setup(page); await installFixture(page);
  for (const [status, text] of [['empty', 'No mapped buildings'], ['failed', 'lookup failed'], ['area', 'maximum 100 km²'], ['limit', '10,000']]) {
    await page.evaluate(status => { fixtureSrc.buildings = { features: [], status, invalid: 0 }; }, status);
    await page.click('#generate'); await expect(page.locator('#exportOne')).toBeEnabled();
    await expect(page.locator('#detailNotes')).toContainText(text);
  }
  await installFixture(page);
  await page.click('#generate'); await expect(page.locator('#exportOne')).toBeEnabled();
  const fits = await page.evaluate(() => {
    camera.updateMatrixWorld(); modelGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(modelGroup);
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new THREE.Vector3(x, y, z).project(camera);
      if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1 || p.z > 1) return false;
    }
    return true;
  });
  expect(fits).toBe(true); expect(errors).toEqual([]);
});

test('exports carry the searched place name and drop it when the centre moves', async ({ page }) => {
  const errors = await setup(page);
  await page.route(/nominatim\.openstreetmap\.org\/search/, route => route.fulfill({
    json: [{ lat: '18.7883', lon: '98.9853', display_name: 'Chiang Mai, Chiang Mai Province, Thailand' }],
  }));
  await page.fill('#search', 'Chiang Mai');
  await page.click('#searchBtn');
  await expect(page.locator('#status')).toContainText('Found: Chiang Mai');
  await installFixture(page);
  await page.click('#generate'); await expect(page.locator('#exportOne')).toBeEnabled();
  // Exercise the download handler directly without submitting a test lead.
  const stl = page.waitForEvent('download');
  await page.evaluate(() => exportOne());
  expect((await stl).suggestedFilename()).toBe('chiang_mai_chiang_mai_province_combined.stl');
  // A route can be saved before any model exists, so it names itself.
  const gpx = page.waitForEvent('download');
  await page.evaluate(() => { route.pts = [[18.78, 98.98], [18.79, 98.99]]; $('routeSave').click(); });
  expect((await gpx).suggestedFilename()).toBe('chiang_mai_chiang_mai_province_route.gpx');
  // Typed coordinates are a move elsewhere, so the name goes stale.
  await page.evaluate(() => { $('lat').value = '10'; $('lat').dispatchEvent(new Event('change')); });
  expect(await page.evaluate(() => placeSlug())).toBe('topopuzzle');
  // The built model keeps the place it was generated for until it is replaced.
  expect(await page.evaluate(() => exportPrefix())).toBe('chiang_mai_chiang_mai_province');
  expect(errors).toEqual([]);
});
