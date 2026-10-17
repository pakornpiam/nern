import './geometry-core.js';
import { fuseCity, exportSolids } from './geometry-city.mjs';
import { buildLandcover } from './geometry-landcover.mjs';

self.onmessage = async ({ data }) => {
  const { action, src, opts, model } = data;
  const progress = (key, params) => self.postMessage({ progress: { key, params } });
  try {
    let result;
    if (action === 'build') {
      result = TopoGeometry.buildGeometry(src, opts, progress);
      const terrain = opts.colorMode === 'landcover' ? result.pieces.map(p => p.pos) : null;
      result = await fuseCity(result, progress);
      if (terrain) result = await buildLandcover(result, terrain, progress);
      delete result.src; // The page retains the authoritative source cache.
    } else if (action === 'export') result = await exportSolids(model, progress);
    else throw new Error('errCityGeometry');
    self.postMessage({ result });
  } catch (e) {
    /* Every failure that is not one of the two diagnosable ones reaches the user as the
       same generic errGeometryWorker, which says nothing about what actually broke. Log
       the real error and stack here first: a worker's console reaches DevTools like any
       other, so a bug report can name the cause instead of the catch-all. */
    const known = ['errCityGeometry', 'errLandcoverFetch'].includes(e.message);
    if (!known) console.error('[nern worker]', action, e && e.stack || e);
    self.postMessage({ error: known ? e.message : 'errGeometryWorker' });
  }
};
