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
      // Mirror the real one: with the water layer off no rings are fetched, so the
      // source carries an empty mask and records that it has no water data.
      const wantWater = input.waterEnabled !== false;
      return { ...src, waterFetched: wantWater,
        osmWater: wantWater ? src.osmWater : new Uint8Array(src.osmWater.length),
        buildings: input.includeBuildings ? src.buildings : { features: [], status: 'off' },
        // Land types are fetched exactly as the real one does, so the Overpass route
        // installed by a test is what decides whether a request happens at all.
        landcover: await TopoLandcover.fetchLandcover(src.bounds, { signal, enabled: input.colorMode === 'landcover' }) };
    };
    $('nx').value = opts.nx || 1;
  }, { src: serial, opts });
}

test('controls, city generation, water rebuild, language, STL ZIP and 3MF exports', async ({ page }) => {
  const errors = await setup(page);
  await expect(page.locator('#res')).toHaveValue('400');
  await page.selectOption('#detailPreset', '800'); await expect(page.locator('#res')).toHaveValue('800');
  await page.locator('#areaX').fill('0.25'); await page.locator('#areaX').dispatchEvent('change');
  expect(await page.evaluate(() => [state.areaKmX, state.areaKmY])).toEqual([0.25, 24]);
  await page.locator('#areaY').fill('0.25'); await page.locator('#areaY').dispatchEvent('change');
  expect(await page.evaluate(() => [state.areaKmX, state.areaKmY])).toEqual([0.25, 0.25]);
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

test('an X/Y rectangle drives the bounds, a proportional grid and every readout', async ({ page }) => {
  const errors = await setup(page);
  await page.locator('#areaX').fill('20'); await page.locator('#areaX').dispatchEvent('change');
  await page.locator('#areaY').fill('5'); await page.locator('#areaY').dispatchEvent('change');
  expect(await page.evaluate(() => [state.areaKmX, state.areaKmY])).toEqual([20, 5]);
  // The box really is 4:1 on the ground, not just in the inputs.
  const dims = await page.evaluate(() => TopoTerrain.dimensions(currentAreaBounds()));
  expect(dims[0] / dims[1]).toBeCloseTo(4, 1);
  // Detail sets the long axis; the short one scales so cells stay square.
  expect(await page.evaluate(() => gridSamples(currentAreaBounds(), 400))).toEqual([400, 100]);
  await expect(page.locator('#areaVal')).toHaveText('20 × 5 km');
  await expect(page.locator('#resVal')).toHaveText('400 × 100');
  expect(await page.evaluate(() => boxHandleMarkers.length)).toBe(8);
  // The slider scales both axes and keeps the shape.
  await page.locator('#area').fill('40'); await page.locator('#area').dispatchEvent('input');
  expect(await page.evaluate(() => [state.areaKmX, state.areaKmY])).toEqual([40, 10]);
  // Thai keeps the numbers and translates the unit.
  await page.click('#langTh');
  await expect(page.locator('#areaVal')).toHaveText('40 × 10 กม.');
  await page.click('#langEn');
  expect(errors).toEqual([]);
});

test('an edge handle stretches one axis and a corner moves both', async ({ page }) => {
  const errors = await setup(page);
  await page.evaluate(() => setArea(35.36, 138.72, 20, 5));
  const drag = async (index, dx, dy) => {
    const box = await page.evaluate(i => boxHandleMarkers[i].getElement().getBoundingClientRect().toJSON(), index);
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
    await page.mouse.move(cx, cy); await page.mouse.down();
    await page.mouse.move(cx + dx, cy + dy, { steps: 5 }); await page.mouse.up();
    return page.evaluate(() => [state.areaKmX, state.areaKmY]);
  };
  // Handle 5 is the EAST edge midpoint: X grows, Y must not move at all.
  const afterEdge = await drag(5, 60, 0);
  expect(afterEdge[0]).toBeGreaterThan(20);
  expect(afterEdge[1]).toBe(5);
  // Handle 1 is the NE corner: both axes respond.
  const beforeCorner = afterEdge, afterCorner = await drag(1, 40, -40);
  expect(afterCorner[0]).toBeGreaterThan(beforeCorner[0]);
  expect(afterCorner[1]).toBeGreaterThan(beforeCorner[1]);
  expect(errors).toEqual([]);
});

test('route dimension sliders restamp the model from the cached source', async ({ page }) => {
  const errors = await setup(page);
  // 100 samples across a 180 mm model keeps vertices 1.8 mm apart, so the grid floor
  // lands at 1.27 mm — under the 1.6 mm half-width below, which therefore stands.
  await installFixture(page, { samples: 100 });
  // The fixture source spans [[0,0],[0.002,0.002]]; sit the area and route on it so
  // the post-generate "route outside the area" check stays quiet.
  await page.evaluate(() => {
    setArea(0.001, 0.001, 0.2, 0.2);
    route.pts = [[0.0002, 0.001], [0.0018, 0.001]];
    redrawRoute();
  });
  await page.selectOption('#routeMode', 'through');
  await expect(page.locator('#throughRouteOpts')).toBeVisible();
  // A full-depth route reaches the bottom, so depth is meaningless there.
  await expect(page.locator('#routeDepth')).toBeDisabled();
  // The hint interpolates the live numbers instead of quoting fixed ones.
  await expect(page.locator('#routeHint')).toContainText('3.2 mm route');
  await expect(page.locator('#routeHint')).toContainText('3.6 mm wide');

  // Count source fetches: the whole point of the rebuild path is that there are none.
  await page.evaluate(() => {
    const original = getTerrainSources;
    window.srcCalls = 0;
    getTerrainSources = async (...args) => { window.srcCalls++; return original(...args); };
  });
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();
  expect(await page.evaluate(() => window.srcCalls)).toBe(1);
  expect(await page.evaluate(() => state.model.grid.routeHalf)).toBe(1.6);

  await page.locator('#routeWidth').fill('8');
  await page.locator('#routeWidth').dispatchEvent('input');
  await expect(page.locator('#routeWidthVal')).toHaveText('8.0');
  await expect.poll(() => page.evaluate(() => !rebuildController && state.model.grid.routeHalf), { timeout: 20000 }).toBe(4);
  // Restamped from old.src — no tile or Overpass round-trip.
  expect(await page.evaluate(() => window.srcCalls)).toBe(1);
  await expect(page.locator('#routeHint')).toContainText('8.0 mm route');

  await page.locator('#routeClearance').fill('0.5');
  await page.locator('#routeClearance').dispatchEvent('input');
  await expect.poll(() => page.evaluate(() => !rebuildController && state.model.grid.channelHalf), { timeout: 20000 }).toBe(4.5);
  await expect(page.locator('#routeHint')).toContainText('9.0 mm wide');
  expect(await page.evaluate(() => window.srcCalls)).toBe(1);

  // The depth label names what the mode actually does, in either language.
  await page.selectOption('#routeMode', 'emboss');
  await expect(page.locator('#routeDepth')).toBeEnabled();
  await expect(page.locator('#routeDepthLbl')).toHaveText('Ridge height');
  await page.selectOption('#routeMode', 'engrave');
  await expect(page.locator('#routeDepthLbl')).toHaveText('Groove depth');
  await page.selectOption('#routeMode', 'off');
  await expect(page.locator('#routeWidth')).toBeDisabled();
  await page.click('#langTh');
  await expect(page.locator('#routeDepthLbl')).toHaveText('ความลึกร่อง');
  await page.click('#langEn');
  expect(errors).toEqual([]);
});

test('the flat route profile restamps from the cached source and frees the depth slider', async ({ page }) => {
  const errors = await setup(page);
  await installFixture(page, { samples: 100 });
  await page.evaluate(() => {
    setArea(0.001, 0.001, 0.2, 0.2);
    route.pts = [[0.0002, 0.001], [0.0018, 0.001]];
    redrawRoute();
  });
  await page.selectOption('#routeMode', 'through');
  // Rounded is the default, and a full-depth route reaches the bottom by definition.
  await expect(page.locator('#routeProfile')).toHaveValue('round');
  await expect(page.locator('#routeDepth')).toBeDisabled();
  await expect(page.locator('#routeProfileHint')).toContainText('cuts all the way through');

  // Count source fetches: switching profile must restamp from the cached source.
  await page.evaluate(() => {
    const original = getTerrainSources;
    window.srcCalls = 0;
    getTerrainSources = async (...args) => { window.srcCalls++; return original(...args); };
  });
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();
  expect(await page.evaluate(() => window.srcCalls)).toBe(1);
  expect(await page.evaluate(() => state.model.grid.routeFloorZ)).toBe(0);

  await page.selectOption('#routeProfile', 'flat');
  await expect(page.locator('#routeDepth')).toBeEnabled();
  await expect(page.locator('#routeDepthLbl')).toHaveText('Plug depth');
  await expect.poll(() => page.evaluate(() => !rebuildController && state.model.grid.routeFloorZ > 0),
    { timeout: 20000 }).toBe(true);
  expect(await page.evaluate(() => window.srcCalls)).toBe(1);
  await expect(page.locator('#routeHint')).toContainText('instead of cutting through');

  // Depth now drives how far the plug sinks; a shallower one leaves a higher floor.
  const deep = await page.evaluate(() => state.model.grid.routeFloorZ);
  await page.locator('#routeDepth').fill('0.4');
  await page.locator('#routeDepth').dispatchEvent('input');
  await expect.poll(() => page.evaluate(() => !rebuildController && state.model.grid.routeFloorZ),
    { timeout: 20000 }).toBeGreaterThan(deep);
  expect(await page.evaluate(() => window.srcCalls)).toBe(1);

  // The sliced 3MF asserts what the option promises, rather than leaving it to a preset.
  expect(await page.evaluate(() => topoPrintProfile(state.model).enable_support)).toBe('0');
  expect(await page.evaluate(() => topoPrintProfile({ routeProfile: 'round' }).enable_support)).toBeUndefined();

  // Shallow modes keep their own wording, in either language.
  await page.selectOption('#routeMode', 'inlay');
  await expect(page.locator('#routeProfileHint')).toContainText('flat-side down');
  await page.click('#langTh');
  await expect(page.locator('#routeDepthLbl')).toHaveText('ความลึกร่อง');
  await page.click('#langEn');
  await page.selectOption('#routeMode', 'off');
  await expect(page.locator('#routeProfile')).toBeDisabled();
  await expect(page.locator('#routeProfileHint')).toHaveText('');
  expect(errors).toEqual([]);
});

test('a route too thin for the grid still reaches the print, and says so', async ({ page }) => {
  const errors = await setup(page);
  await installFixture(page, { samples: 60 });
  // 60 samples across a 180 mm model puts vertices every 3 mm. Run the route at
  // x = 91.5 mm, exactly between two columns, where it used to touch no vertex at
  // all and vanish: no route part, no route file, and no warning either, because
  // its coordinates are inside the area.
  await page.evaluate(() => {
    setArea(0.001, 0.001, 0.2, 0.2);
    const lon = 91.5 * 0.002 / 180;
    route.pts = [[0.0002, lon], [0.0018, lon]];
    redrawRoute();
  });
  await page.locator('#routeWidth').fill('1.2');
  await page.locator('#routeWidth').dispatchEvent('change');
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();

  // The print keeps its route part, and the export keeps its route file.
  expect(await page.evaluate(() => state.model.routeParts?.length)).toBe(1);
  const files = await page.evaluate(() => {
    const zip = new JSZip(); addModelStls(zip, state.model);
    return Object.keys(zip.files).filter(n => n.includes('route'));
  });
  expect(files).toEqual(['route_red_r1_c1.stl']);
  // The slider is not what was cut, so the status says which number won.
  await expect(page.locator('#status')).toHaveClass('warn');
  await expect(page.locator('#status')).toContainText('1.2 mm route');
  await expect(page.locator('#status')).toContainText('widened to 4.2 mm');
  expect(errors).toEqual([]);
});

test('the Bambu export delivers terrain and route in a single download', async ({ page }) => {
  /* Chrome allows a page ONE programmatic download and gates any further one behind
     the "Automatic downloads" permission, which defaults to ask. This export builds
     its blobs over seconds of CSG, so the gesture is long expired by the time any
     a.click() fires — a second download was silently dropped and the route file
     never arrived. The invariant is therefore one download, carrying both parts. */
  const errors = await setup(page);
  await installFixture(page, { samples: 100, water: true });
  const downloads = [];
  page.on('download', d => downloads.push(d));
  await page.evaluate(() => {
    setArea(0.001, 0.001, 0.2, 0.2);
    route.pts = [[0.0002, 0.001], [0.0018, 0.001]];
    redrawRoute();
    try { localStorage.setItem('tp_lead', '1'); } catch (e) { /* private mode */ }
  });
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();
  expect(await page.evaluate(() => !!state.model.routeParts?.length)).toBe(true);

  await page.click('#exportBambu');
  await expect(page.locator('#generate')).toBeEnabled({ timeout: 30000 });
  await expect(page.locator('#status')).toContainText('topopuzzle_bambu.zip');
  expect(downloads.map(d => d.suggestedFilename())).toEqual(['topopuzzle_bambu.zip']);
  const [download] = downloads;

  // Both parts are really in the archive the browser received. Zip stores entry names
  // uncompressed in each local file header, so the raw bytes are proof enough.
  const bytes = require('fs').readFileSync(await download.path());
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  const text = bytes.toString('latin1');
  expect(text).toContain('topopuzzle_bambu_4color.3mf');
  expect(text).toContain('topopuzzle_bambu_route.3mf');
  expect(errors).toEqual([]);
});

test('disabling the water layer hands its slot to a fourth adjustable band', async ({ page }) => {
  const errors = await setup(page);
  await installFixture(page, { water: true });
  // Count source fetches: turning the layer off must restamp from the cached source.
  await page.evaluate(() => {
    const original = getTerrainSources;
    window.srcCalls = 0;
    getTerrainSources = async (...args) => { window.srcCalls++; return original(...args); };
  });
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();
  await expect(page.locator('#waterRow')).toBeVisible();
  expect(await page.evaluate(() => [state.bands.nb, state.model.hasWater])).toEqual([3, true]);
  // Band 1 is the blue slot's understudy: hidden while water holds the slot.
  await expect(page.locator('#bandRow0')).toBeHidden();

  await page.locator('#waterEnabled').uncheck();
  await expect.poll(() => page.evaluate(() => state.bands.nb)).toBe(4);
  // Everything that only describes water is gone...
  await expect(page.locator('#waterOpts')).toBeHidden();
  await expect(page.locator('#waterAutoRow')).toBeHidden();
  await expect(page.locator('#waterRow')).toBeHidden();
  // ...and the freed slot is a normal band: own colour, own editable altitude.
  await expect(page.locator('#bandRow0')).toBeVisible();
  await expect(page.locator('#col0')).toBeVisible();
  await expect(page.locator('#cut0')).toBeVisible();
  expect(await page.evaluate(() => state.model.hasWater)).toBe(false);
  // The legend drops its fixed 14% blue slice and splits four ways instead.
  const gradient = await page.evaluate(() => $('legend').style.background);
  expect(gradient).not.toContain('rgb(59, 123, 212)');   // #3b7bd4, the water colour
  expect(await page.evaluate(() => state.bands.cutsM.length)).toBe(3);
  // Restamped in place — no tile or Overpass round-trip.
  expect(await page.evaluate(() => window.srcCalls)).toBe(1);

  // The altitude really is adjustable, and editing it recolours without a rebuild.
  await page.locator('#cut0').fill('11.5');
  await page.locator('#cut0').dispatchEvent('change');
  expect(await page.evaluate(() => state.bands.cutsM[0])).toBeCloseTo(11.5, 5);
  expect(await page.evaluate(() => state.model.zCuts.length)).toBe(3);
  expect(await page.evaluate(() => window.srcCalls)).toBe(1);

  // Turning it back on is equally cheap: the source still carries its OSM mask.
  await page.locator('#waterEnabled').check();
  await expect.poll(() => page.evaluate(() => state.bands.nb)).toBe(3);
  await expect(page.locator('#waterRow')).toBeVisible();
  await expect(page.locator('#waterOpts')).toBeVisible();
  expect(await page.evaluate(() => window.srcCalls)).toBe(1);
  expect(errors).toEqual([]);
});

test('re-enabling water on a model generated without it asks for a regenerate', async ({ page }) => {
  // Generating with the layer off skips the Overpass call entirely, so that source
  // has no rings to fall back on. This is the one direction the cheap path cannot
  // serve, and it has to say so rather than appear to do nothing.
  const errors = await setup(page);
  await installFixture(page, { water: true });
  await page.locator('#waterEnabled').uncheck();
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();
  expect(await page.evaluate(() => state.model.src.waterFetched)).toBe(false);
  expect(await page.evaluate(() => state.model.grid.osmWater.some(v => v === 1))).toBe(false);
  expect(await page.evaluate(() => state.bands.nb)).toBe(4);

  await page.locator('#waterEnabled').check();
  await expect(page.locator('#status')).toHaveClass('warn');
  await expect(page.locator('#status')).toContainText('Press Generate');
  // The stale model is left alone rather than half-updated.
  expect(await page.evaluate(() => [state.bands.nb, state.model.hasWater])).toEqual([4, false]);

  // Generating now fetches the water and the blue slot comes back.
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();
  expect(await page.evaluate(() => state.model.src.waterFetched)).toBe(true);
  expect(await page.evaluate(() => [state.bands.nb, state.model.hasWater])).toEqual([3, true]);
  await expect(page.locator('#waterRow')).toBeVisible();
  expect(errors).toEqual([]);
});

/* Land cover replaces the elevation bands with mapped materials. The fixture paints
   the west half wood and the east half farmland; the source's own water mask already
   claims the western third. Deliberately GLACIER-FREE: that is what makes the four-
   material assertions a guard that an ordinary print still fits one AMS unit. */
const asWay = ({ bbox: [x0, y0, x1, y1], ...rest }) => ({ ...rest,
  geometry: [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([lon, lat]) => ({ lon, lat })) });
const LAND_PATCHES = [
  { type: 'way', id: 1, tags: { natural: 'wood' }, bbox: [0, 0, 0.001, 0.002] },
  { type: 'way', id: 2, tags: { landuse: 'farmland' }, bbox: [0.001, 0, 0.002, 0.002] },
].map(asWay);
/* Small patches with real unmapped ground around them, east of the water the fixture
   source already claims -- LAND_PATCHES tiles the whole box, so nothing could grow. */
const SPARSE_PATCHES = [
  { type: 'way', id: 11, tags: { natural: 'wood' }, bbox: [0.0008, 0.0008, 0.0012, 0.0012] },
  { type: 'way', id: 12, tags: { landuse: 'farmland' }, bbox: [0.0014, 0.0014, 0.0018, 0.0018] },
].map(asWay);
// The glacier covers the northern half of both, and outranks them where they overlap.
const SNOW_PATCHES = LAND_PATCHES.concat(
  [{ type: 'way', id: 3, tags: { natural: 'glacier' }, bbox: [0, 0.001, 0.002, 0.002] }].map(asWay));

async function routeLandcover(page, counter = {}, elements = LAND_PATCHES) {
  counter.calls = 0;
  await page.route('https://overpass-api.de/api/interpreter', async route => {
    counter.calls++;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ elements }) });
  });
  return counter;
}

test('real land types replace the elevation bands with mapped materials', async ({ page }) => {
  const errors = await setup(page);
  const overpass = await routeLandcover(page);
  await installFixture(page, { water: true });

  // Before any model exists the panel says where the data will come from.
  await page.selectOption('#colorMode', 'landcover');
  await expect(page.locator('#landcoverColors')).toBeVisible();
  await expect(page.locator('#elevationColors')).toBeHidden();
  await expect(page.locator('#waterAutoRow')).toBeHidden();
  await expect(page.locator('#landcoverStatus')).toContainText('Generate or select this mode');
  // Four even quarters rather than the band gradient's water slice plus cuts.
  expect(await page.evaluate(() => $('legend').style.background)).toContain('25%');

  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();
  expect(overpass.calls).toBe(1);
  const built = await page.evaluate(() => ({
    categories: Object.keys(state.model.materialMeshes[0].materials),
    filled: Object.entries(state.model.materialMeshes[0].materials).filter(([, m]) => m.pos.length).map(([c]) => c),
    info: state.model.landcoverInfo,
    // The terrain mesh itself is untouched: STL exports still carry whole pieces.
    pieceTris: state.model.pieces[0].pos.length / 9,
  }));
  expect(built.categories).toEqual(['water', 'snow', 'forest', 'grass', 'other']);
  // No glacier in this fixture and no snow line, so snow earns no mesh and no slot:
  // the four assertions below are the guard that ordinary prints stay at one AMS unit.
  expect(built.filled).toEqual(['water', 'forest', 'grass', 'other']);
  await expect(page.locator('#landSnowRow')).toBeHidden();
  expect(built.info.status).toBe('ok');
  expect(built.info.vegetationPercent).toBeGreaterThan(0);
  expect(built.pieceTris).toBeGreaterThan(0);
  await expect(page.locator('#landcoverStatus')).toContainText('OSM mapped vegetation');
  await expect(page.locator('#detailNotes')).toContainText('OSM mapped vegetation');

  // Recolouring is a preview repaint, not a rebuild: no worker run, no fetch.
  await page.evaluate(() => { window.buildsBefore = state.model; });
  await page.locator('#landForest').fill('#123456');
  await page.locator('#landForest').dispatchEvent('input');
  expect(await page.evaluate(() => state.model === window.buildsBefore)).toBe(true);
  expect(await page.evaluate(() => state.model.materialColors.forest)).toBe('#123456');
  expect(overpass.calls).toBe(1);

  // The Bambu terrain plate carries the four materials, one object per category.
  const bambu = await page.evaluate(async () => {
    const files = await buildBambuFiles(state.model);
    const archive = await JSZip.loadAsync(files.terrainBlob);
    const xml = await archive.file('3D/3dmodel.model').async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const settings = JSON.parse(await archive.file('Metadata/project_settings.config').async('string'));
    return { xmlErrors: doc.querySelectorAll('parsererror').length,
      materials: [...doc.querySelectorAll('base')].map(b => b.getAttribute('name')),
      colors: [...doc.querySelectorAll('base')].map(b => b.getAttribute('displaycolor')),
      filaments: settings.filament_colour,
      readme: await (async () => { const zip = new JSZip(); addModelStls(zip, state.model);
        return zip.file('README.txt').async('string'); })() };
  });
  expect(bambu.xmlErrors).toBe(0);
  expect(bambu.materials).toEqual(['water', 'forest', 'grass', 'other']);
  expect(bambu.filaments).toHaveLength(4);
  expect(bambu.colors[1]).toBe('#123456FF');
  expect(bambu.readme).toContain('OpenStreetMap contributors');

  // Switching back restores the bands, and the cached source needs no new request.
  await page.selectOption('#colorMode', 'elevation');
  await expect(page.locator('#elevationColors')).toBeVisible();
  await expect(page.locator('#landcoverColors')).toBeHidden();
  await expect.poll(() => page.evaluate(() => !!state.model?.zCuts && !state.model.materialMeshes)).toBe(true);
  await expect(page.locator('#waterRow')).toBeVisible();
  expect(overpass.calls).toBe(1);
  expect(errors).toEqual([]);
});

test('a land-type lookup that fails keeps the previous model and can be retried', async ({ page }) => {
  const errors = await setup(page);
  const overpass = { calls: 0 };
  let fail = true;
  await page.route('https://overpass-api.de/api/interpreter', async route => {
    overpass.calls++;
    if (fail) return route.fulfill({ status: 504, contentType: 'text/plain', body: 'gateway timeout' });
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ elements: LAND_PATCHES }) });
  });
  await installFixture(page, { water: true });
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();
  await page.evaluate(() => { window.bandModel = state.model; });

  await page.selectOption('#colorMode', 'landcover');
  await expect(page.locator('#status')).toHaveClass('err');
  await expect(page.locator('#status')).toContainText('Press Generate to retry');
  // The banded model is left intact rather than half-converted.
  expect(await page.evaluate(() => state.model === window.bandModel)).toBe(true);
  expect(await page.evaluate(() => !!state.model.materialMeshes)).toBe(false);

  fail = false;
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();
  expect(await page.evaluate(() => state.model.landcoverInfo.status)).toBe('ok');
  expect(overpass.calls).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('switching to land types on a water-free source fetches the rings it now needs', async ({ page }) => {
  // Land types restores its own water settings, which default to the layer ON. A
  // source generated with water off carries no rings, so the rebuild has to go and
  // get them rather than colouring the lake as ordinary ground.
  const errors = await setup(page);
  const calls = { land: 0, water: 0 };
  await page.route('https://overpass-api.de/api/interpreter', async route => {
    const body = decodeURIComponent(route.request().postData() || '');
    if (body.includes('landuse')) {
      calls.land++;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ elements: LAND_PATCHES }) });
    }
    calls.water++;
    // Cover the western third of whatever bbox was actually asked for.
    const [, s, w, n, e] = body.match(/\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)/).map(Number);
    const lonE = w + (e - w) / 3;
    const ring = [[w, s], [lonE, s], [lonE, n], [w, n], [w, s]].map(([lon, lat]) => ({ lon, lat }));
    return route.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ elements: [{ type: 'way', id: 7, tags: { natural: 'water' }, geometry: ring }] }) });
  });
  await installFixture(page, { water: true });
  await page.locator('#waterEnabled').uncheck();
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();
  expect(await page.evaluate(() => state.model.src.waterFetched)).toBe(false);
  expect(calls.water).toBe(0);

  await page.selectOption('#colorMode', 'landcover');
  await expect.poll(() => page.evaluate(() => !!state.model.materialMeshes)).toBe(true);
  expect(await page.evaluate(() => $('waterEnabled').checked)).toBe(true);
  expect(await page.evaluate(() => state.model.src.waterFetched)).toBe(true);
  expect(calls.water).toBe(1);
  // The lake reached the print as its own material rather than as other ground.
  expect(await page.evaluate(() => state.model.materialMeshes[0].materials.water.pos.length)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('an area past the land-type ceiling hands the colour picker back to the bands', async ({ page }) => {
  // Area and vertex ceilings cannot be retried away, so the picker must not stay on
  // a mode the model can never reach — it would block every later Generate too.
  const errors = await setup(page);
  const overpass = await routeLandcover(page);
  await installFixture(page, { water: true });
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();
  await page.evaluate(() => { window.bandModel = state.model; });
  /* The ceiling now sits above anything the area box can draw, so it is only reachable
     through an unclamped region selection. What this test is really about is the UI's
     reaction to a closed error, so raise one directly; the ceiling arithmetic itself is
     covered in tests/landcover.test.cjs. */
  await page.evaluate(() => {
    window.realFetchLandcover = TopoLandcover.fetchLandcover;
    TopoLandcover.fetchLandcover = async (bounds, opts = {}) => {
      if (opts.enabled === false) return window.realFetchLandcover(bounds, opts);
      const e = new Error('errLandcoverArea'); e.code = 'errLandcoverArea'; throw e;
    };
  });

  await page.selectOption('#colorMode', 'landcover');
  await expect(page.locator('#status')).toContainText('up to 15,000 km²');
  // Refused before any request went out, and the picker is back on the bands.
  expect(overpass.calls).toBe(0);
  await expect(page.locator('#colorMode')).toHaveValue('elevation');
  await expect(page.locator('#elevationColors')).toBeVisible();
  await expect(page.locator('#landcoverColors')).toBeHidden();
  await expect(page.locator('#waterRow')).toBeVisible();
  expect(await page.evaluate(() => state.colorMode)).toBe('elevation');
  // The legend describes the banded model on screen, not four land types.
  expect(await page.evaluate(() => $('legend').style.background)).toContain('rgb(59, 123, 212)');
  expect(await page.evaluate(() => state.model === window.bandModel)).toBe(true);

  // And Generate still works, rather than repeating the same refusal forever.
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();
  await expect(page.locator('#status')).not.toContainText('up to 15,000 km²');
  expect(await page.evaluate(() => state.model.opts.colorMode)).toBe('elevation');

  // With the ceiling out of the way the mode is available again, with its own settings.
  await page.evaluate(() => { TopoLandcover.fetchLandcover = window.realFetchLandcover; });
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();
  await page.selectOption('#colorMode', 'landcover');
  await expect.poll(() => page.evaluate(() => !!state.model.materialMeshes)).toBe(true);
  await expect(page.locator('#colorMode')).toHaveValue('landcover');
  expect(overpass.calls).toBe(1);
  expect(errors).toEqual([]);
});

test('a mapped glacier adds a fifth material and its own filament slot', async ({ page }) => {
  const errors = await setup(page);
  await routeLandcover(page, {}, SNOW_PATCHES);
  await installFixture(page, { water: true });
  await page.selectOption('#colorMode', 'landcover');
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();

  expect(await page.evaluate(() => Object.entries(state.model.materialMeshes[0].materials)
    .filter(([, m]) => m.pos.length).map(([c]) => c))).toEqual(['water', 'snow', 'forest', 'grass', 'other']);
  expect(await page.evaluate(() => state.model.landcoverInfo.hasSnow)).toBe(true);
  expect(await page.evaluate(() => state.model.landcoverInfo.snowPercent)).toBeGreaterThan(0);
  // The colour picker and the legend both admit the fifth material.
  await expect(page.locator('#landSnowRow')).toBeVisible();
  expect(await page.evaluate(() => $('legend').style.background)).toContain('20%');
  await expect(page.locator('#landcoverStatus')).toContainText('Snow and ice');
  await expect(page.locator('#hintLandcoverSlots')).toContainText('5 materials');

  const bambu = await page.evaluate(async () => {
    const files = await buildBambuFiles(state.model);
    const archive = await JSZip.loadAsync(files.terrainBlob);
    const doc = new DOMParser().parseFromString(await archive.file('3D/3dmodel.model').async('string'), 'application/xml');
    const sidecar = await archive.file('Metadata/model_settings.config').async('string');
    return {
      materials: [...doc.querySelectorAll('base')].map(b => b.getAttribute('name')),
      filaments: JSON.parse(await archive.file('Metadata/project_settings.config').async('string')).filament_colour,
      extruders: [...sidecar.matchAll(/key="extruder" value="(\d+)"/g)].map(m => +m[1]),
    };
  });
  expect(bambu.materials).toEqual(['water', 'snow', 'forest', 'grass', 'other']);
  expect(bambu.filaments).toHaveLength(5);
  // The numbering contract: 1-based, dense, and never past the filament list.
  expect(Math.min(...bambu.extruders)).toBe(1);
  expect(Math.max(...bambu.extruders)).toBeLessThanOrEqual(bambu.filaments.length);
  expect([...new Set(bambu.extruders)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  expect(errors).toEqual([]);
});

test('the snow line paints by altitude without going back to the network', async ({ page }) => {
  // The fixture ramps 10-14 m, so a 13 m line takes the eastern quarter. No glacier
  // in this patch set, so any snow that appears came from the altitude alone.
  const errors = await setup(page);
  const overpass = await routeLandcover(page);
  await installFixture(page, { water: true });
  await page.selectOption('#colorMode', 'landcover');
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();
  expect(await page.evaluate(() => state.model.materialMeshes[0].materials.snow.pos.length)).toBe(0);
  await expect(page.locator('#snowLineOpts')).toBeHidden();
  expect(overpass.calls).toBe(1);

  await page.locator('#snowLineEnabled').check();
  await expect(page.locator('#snowLineOpts')).toBeVisible();
  await page.locator('#snowLine').fill('13');
  await page.locator('#snowLine').dispatchEvent('change');
  await expect.poll(() => page.evaluate(() => state.model.materialMeshes[0].materials.snow.pos.length)).toBeGreaterThan(0);
  // Restamped from the cached source: the altitude is applied in the geometry, not the fetch.
  expect(overpass.calls).toBe(1);
  expect(await page.evaluate(() => state.model.opts.snowLineM)).toBe(13);
  expect(await page.evaluate(() => state.model.landcoverInfo.snowPercent)).toBeGreaterThan(0);
  await expect(page.locator('#landSnowRow')).toBeVisible();
  expect(await page.evaluate(() => $('legend').style.background)).toContain('20%');
  // The exported README owns up: this is an altitude someone typed, not measured snow.
  const readme = await page.evaluate(async () => {
    const zip = new JSZip(); addModelStls(zip, state.model);
    return zip.file('README.txt').async('string');
  });
  expect(readme).toContain('at or above 13 m');
  expect(readme).toContain('not measured snow cover');

  // Off again and the fifth material goes with it, still with no request.
  await page.locator('#snowLineEnabled').uncheck();
  await expect.poll(() => page.evaluate(() => state.model.materialMeshes[0].materials.snow.pos.length)).toBe(0);
  await expect(page.locator('#landSnowRow')).toBeHidden();
  expect(await page.evaluate(() => state.model.opts.snowLineM)).toBe(null);
  expect(overpass.calls).toBe(1);
  expect(errors).toEqual([]);
});

test('a selection far past the old ceiling fans out into tiled requests', async ({ page }) => {
  // 120 x 120 km is the largest box the area controls allow; it used to be refused
  // outright at 1,000 km2. The fixture source stays small, so what this pins is the
  // request fan-out and that the build survives it.
  const errors = await setup(page);
  const overpass = await routeLandcover(page);
  await installFixture(page, { water: true });
  await page.locator('#areaX').fill('120'); await page.locator('#areaX').dispatchEvent('change');
  await page.locator('#areaY').fill('120'); await page.locator('#areaY').dispatchEvent('change');
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();

  await page.selectOption('#colorMode', 'landcover');
  await expect.poll(() => page.evaluate(() => !!state.model?.materialMeshes)).toBe(true);
  await expect(page.locator('#colorMode')).toHaveValue('landcover');
  await expect(page.locator('#status')).not.toContainText('km²');
  const expected = await page.evaluate(() => TopoLandcover.tileBoxes(state.model.opts.bounds).length);
  expect(expected).toBeGreaterThan(1);
  expect(expected).toBeLessThanOrEqual(25);
  expect(overpass.calls).toBe(expected);
  expect(await page.evaluate(() => state.model.landcoverInfo.tiles)).toBe(expected);
  expect(await page.evaluate(() => state.model.landcoverInfo.missing)).toBe(0);
  expect(errors).toEqual([]);
});

test('a tile that fails leaves a gap the details panel names, not a dead build', async ({ page }) => {
  const errors = await setup(page);
  let calls = 0, dead = null, mode = 'dead';
  const seen = new Map();
  const down = route => route.fulfill({ status: 504, contentType: 'text/plain', body: 'gateway timeout' });
  await page.route('https://overpass-api.de/api/interpreter', async route => {
    calls++;
    const body = decodeURIComponent(route.request().postData() || '');
    const bbox = (body.match(/\((-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)\)/) || [''])[0];
    if (mode === 'dead') {
      // One tile is down for good. A merely transient one would now be retried away.
      if (dead === null) dead = bbox;
      if (bbox === dead) return down(route);
    } else {
      const n = (seen.get(bbox) || 0) + 1; seen.set(bbox, n);
      if (n === 1) return down(route);   // every tile stumbles once
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ elements: LAND_PATCHES }) });
  });
  await installFixture(page, { water: true });
  await page.locator('#areaX').fill('120'); await page.locator('#areaX').dispatchEvent('change');
  await page.locator('#areaY').fill('120'); await page.locator('#areaY').dispatchEvent('change');
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();

  await page.selectOption('#colorMode', 'landcover');
  await expect.poll(() => page.evaluate(() => !!state.model?.materialMeshes)).toBe(true);
  // The tiles that answered still produced a model, and the shortfall is stated.
  expect(await page.evaluate(() => state.model.landcoverInfo.missing)).toBe(1);
  expect(await page.evaluate(() => state.model.landcoverInfo.status)).toBe('partial');
  await expect(page.locator('#detailNotes')).toContainText('Land-type data is incomplete');
  await expect(page.locator('#detailNotes')).toContainText('1 of');
  // A gap is not cached, so the next Generate really does go back for it -- and this time
  // every tile only stumbles, which the retry now carries through instead of losing land.
  const before = calls;
  mode = 'flaky';
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();
  expect(calls).toBeGreaterThan(before);
  await expect.poll(() => page.evaluate(() => state.model.landcoverInfo.missing)).toBe(0);
  expect(await page.evaluate(() => state.model.landcoverInfo.status)).toBe('ok');
  await expect(page.locator('#detailNotes')).not.toContainText('Land-type data is incomplete');
  expect(errors).toEqual([]);
});

test('each land type spreads on its own, from cached data, without moving the water', async ({ page }) => {
  const errors = await setup(page);
  const overpass = await routeLandcover(page, {}, SPARSE_PATCHES);
  await installFixture(page, { water: true });
  // Land types only: elevation bands already cover every cell, so there is nothing to grow into.
  await expect(page.locator('#landGrowForest')).toBeHidden();
  await page.selectOption('#colorMode', 'landcover');
  for (const id of ['landGrowSnow', 'landGrowForest', 'landGrowGrass']) {
    await expect(page.locator('#' + id)).toBeVisible();
  }
  await page.click('#generate');
  await expect(page.locator('#exportOne')).toBeEnabled();
  const before = await page.evaluate(() => ({
    veg: state.model.landcoverInfo.vegetationPercent,
    mapped: state.model.landcoverInfo.mappedPercent,
    water: state.model.materialMeshes[0].materials.water.pos.length,
    grow: state.model.landcoverInfo.growCells,
  }));
  expect(before.grow).toEqual({ snow: 0, forest: 0, grass: 0 });
  expect(overpass.calls).toBe(1);

  // Move forest alone; snow and grass must stay exactly where they were.
  await page.locator('#landGrowForest').fill('2');
  await page.locator('#landGrowForest').dispatchEvent('input');
  await expect.poll(() => page.evaluate(() => state.model.landcoverInfo.growCells.forest)).toBe(2);
  await expect(page.locator('#landGrowForestVal')).toHaveText('2');
  expect(await page.evaluate(() => state.model.landcoverInfo.growCells)).toEqual({ snow: 0, forest: 2, grass: 0 });
  expect(await page.evaluate(() => state.model.opts.landGrowCells)).toEqual({ snow: 0, forest: 2, grass: 0 });
  // Restamped from the cached response: spreading is geometry, not a new lookup.
  expect(overpass.calls).toBe(1);

  const after = await page.evaluate(() => ({
    veg: state.model.landcoverInfo.vegetationPercent,
    colored: state.model.landcoverInfo.coloredPercent,
    water: state.model.materialMeshes[0].materials.water.pos.length,
  }));
  // The OSM figure still reports what OSM mapped; only the painted share moves.
  expect(after.veg).toBeCloseTo(before.veg, 6);
  expect(after.colored).toBeGreaterThan(before.mapped);
  // Growth writes into unmapped ground only, so the shoreline is untouched.
  expect(after.water).toBe(before.water);
  // The note names the one type that moved, not the two that did not.
  await expect(page.locator('#detailNotes')).toContainText('Forest 2');
  await expect(page.locator('#detailNotes')).not.toContainText('Grass');

  // Spreading grass as well reaches strictly more ground.
  await page.locator('#landGrowGrass').fill('2');
  await page.locator('#landGrowGrass').dispatchEvent('input');
  await expect.poll(() => page.evaluate(() => state.model.landcoverInfo.growCells.grass)).toBe(2);
  expect(await page.evaluate(() => state.model.landcoverInfo.coloredPercent)).toBeGreaterThan(after.colored);
  await expect(page.locator('#detailNotes')).toContainText('Grass');

  // Back to zero everywhere and the note goes with it.
  for (const id of ['landGrowForest', 'landGrowGrass']) {
    await page.locator('#' + id).fill('0');
    await page.locator('#' + id).dispatchEvent('input');
  }
  await expect.poll(() => page.evaluate(() => state.model.landcoverInfo.coloredPercent)).toBe(null);
  await expect(page.locator('#detailNotes')).not.toContainText('Spread by');
  expect(overpass.calls).toBe(1);
  expect(errors).toEqual([]);
});
