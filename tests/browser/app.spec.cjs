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
        buildings: input.includeBuildings ? src.buildings : { features: [], status: 'off' } };
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
