const { test, expect } = require('@playwright/test');

test('live free mountain terrain and city neighborhood', async ({ page }) => {
  test.skip(!process.env.TOPO_LIVE, 'Opt-in: exercises public terrain and Overpass services.');
  test.setTimeout(180000);
  await page.route(/https:\/\/.*(?:tile\.openstreetmap\.org|tile\.opentopomap\.org)\//, route => route.abort());
  await page.goto('/?lang=en');
  const mountain = await page.evaluate(async () => {
    const b = boundsFromCenter(35.3606, 138.7274, 24);
    const standard = await TopoTerrain.elevation(b, 200), high = await TopoTerrain.elevation(b, 400);
    return { standard: standard.terrainInfo, high: high.terrainInfo, min: high.minE0, max: high.maxE0 };
  });
  expect(mountain.max).toBeGreaterThan(3000); expect(mountain.min).toBeLessThan(1000);
  expect(mountain.high.meshSpacing).toBeLessThan(mountain.standard.meshSpacing);
  console.log('Live mountain:', JSON.stringify(mountain));
  await page.evaluate(() => { setArea(1.29, 103.85, 0.5); $('res').value = 200; $('res').dispatchEvent(new Event('input')); });
  await page.click('#generate');
  await expect(page.locator('#generate')).toBeEnabled({ timeout: 120000 });
  const city = await page.evaluate(() => ({ city: state.model?.cityInfo, status: $('status').textContent, triangles: state.model?.triCount }));
  console.log('Live city:', JSON.stringify(city));
  expect(city.city?.status).toBe('ok'); expect(city.city.count).toBeGreaterThan(0);
  const exportResult = await page.evaluate(async () => {
    const files = await buildBambuFiles(state.model), zip = await JSZip.loadAsync(files.terrainBlob);
    const xml = new DOMParser().parseFromString(await zip.file('3D/3dmodel.model').async('string'), 'application/xml');
    const { kernel, fromSoup } = await import('/geometry-city.mjs'), api = await kernel();
    const volumes = [];
    for (const mesh of xml.querySelectorAll('mesh')) {
      const vertices = [...mesh.querySelectorAll('vertex')].map(v => ['x', 'y', 'z'].map(k => +v.getAttribute(k)));
      const pos = [];
      for (const tri of mesh.querySelectorAll('triangle')) for (const k of ['v1', 'v2', 'v3']) pos.push(...vertices[+tri.getAttribute(k)]);
      const solid = fromSoup(api, pos); volumes.push(solid.volume()); solid.delete();
    }
    return { bytes: files.terrainBlob.size, volumes };
  });
  console.log('Live city 3MF:', JSON.stringify(exportResult));
  expect(exportResult.volumes.every(v => v > 0)).toBe(true);
  await page.evaluate(() => overlay(false));
  await page.screenshot({ path: 'test-results/live-city.png', fullPage: true });
});
