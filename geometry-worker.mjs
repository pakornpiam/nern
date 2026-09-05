import './geometry-core.js';
import { fuseCity, exportSolids } from './geometry-city.mjs';

self.onmessage = async ({ data }) => {
  const { action, src, opts, model } = data;
  const progress = (key, params) => self.postMessage({ progress: { key, params } });
  try {
    let result;
    if (action === 'build') {
      result = await fuseCity(TopoGeometry.buildGeometry(src, opts, progress), progress);
      delete result.src; // The page retains the authoritative source cache.
    } else if (action === 'export') result = await exportSolids(model, progress);
    else throw new Error('errCityGeometry');
    self.postMessage({ result });
  } catch (e) { self.postMessage({ error: e.message === 'errCityGeometry' ? e.message : 'errGeometryWorker' }); }
};
