require('../terrain.js');
require('../buildings.js');
require('../geometry-core.js');

function feature(id, ring, tags = {}) {
  const points = [...ring, ring[0]];
  return { type: 'way', id, tags: { building: 'yes', ...tags }, geometry: points.map(([lon, lat]) => ({ lon, lat })) };
}
const bounds = [[0, 0], [0.002, 0.002]];
const rectangle = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function source({ samples = 24, slope = 0, buildings, water = false } = {}) {
  const W = samples, VW = W + 1, Hv0 = new Float32Array(VW * VW), osmWater = new Uint8Array(Hv0.length);
  for (let j = 0; j <= W; j++) for (let i = 0; i <= W; i++) {
    Hv0[j * VW + i] = 10 + i / W * slope;
    if (water && i < W / 3) osmWater[j * VW + i] = 1;
  }
  return { W, D: W, VW, VD: VW, Hv0, osmWater, bounds, samples, minE0: 10, maxE0: 10 + slope, zoom: 15,
    buildings: buildings || TopoBuildings.normalize([feature(1, rectangle(0.0006, 0.0006, 0.0014, 0.0014), { height: '20' })]),
    terrainInfo: { provider: 'terrarium', source: 'Fixture terrain', tileSpacing: 4.77, meshSpacing: 222.39 / W, limited: false } };
}
function options(overrides = {}) {
  return { bounds, samples: 24, nx: 1, ny: 1, vex: 2.5, widthMM: 180, baseMM: 3,
    waterLevelM: 0.3, autoFallback: true, flattenWater: false, routeMode: 'off', routePath: null,
    frameStyle: 'none', includeBuildings: true, buildingScale: 1, terrainProvider: 'terrarium', ...overrides };
}
module.exports = { bounds, rectangle, feature, source, options };
