# TopoPuzzle

Generate printable terrain puzzles and neighborhood models in your browser.

Run `python server.py`, then open <http://localhost:5177>. Runtime dependencies for
solid city geometry are included in `vendor/`; installing Node packages is only
needed for development and tests. Leaflet, Three.js, and JSZip retain the existing
CDN loading behavior.

## Terrain and buildings

- Select **Free — AWS Terrarium**, or select **MapTiler** and enter your own API key.
  Keys remain in the current tab's memory, are sent directly to MapTiler, and are
  excluded from models, downloads, and application logs. Configure allowed website
  origins and manage usage/billing in your MapTiler account.
- Standard, High (default), and Ultra use 200, 400, and 800 terrain cells per side.
  The custom slider supports up to 1000. The Model panel reports tile and mesh
  spacing separately; neither measures survey accuracy. MapTiler's documented
  coverage is 30 m globally and 5 m in selected areas, so switching providers does
  not guarantee more detail for every location.
- For cities, choose an area as small as 0.25 km. **Include buildings** is on by
  default. Flat-roof building footprints, courtyards, and mapped parts are fused
  into the terrain and included in individual/combined STL and Bambu 3MF exports.
  Heights use mapped measurements, then 3 m per floor, then a 9 m estimate.
  The building height multiplier is independent of terrain exaggeration.
- Building foundations extend to the model base for printable attachment; elevated
  floors, roof shapes, façades, roads, and photorealistic textures are not modeled.
  Buildings crossing puzzle boundaries are split with their terrain pieces, and
  route clearance remains open. Buildings use the existing elevation colors.
- Automatic building requests are limited to 100 km² and 10,000 normalized building
  features per model. Larger selections still generate terrain with an explanatory
  message. Failed lookups are retryable and distinct from areas without mapped
  buildings. Invalid/unclosed OSM polygons are reported as skipped.
- Geometry runs in a cancellable worker. Required elevation failures stop generation
  instead of creating artificial pits. Tile downloads have six concurrent requests,
  up to two transient retries, a 36-tile selection budget, and a 64 MiB tile cache.

Terrain and city data remain limited by source coverage. Tiny buildings at large
geographic scales may be too small for a particular printer; use a neighborhood
selection and suitable slicer settings to make their dimensions visible.

## Development and validation

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

Set `TOPO_CHROMIUM` to an existing Chromium executable if desired. Browser tests use
fixtures for repeatable geometry, provider failures, cancellation, and exports.
Set `TOPO_LIVE=1` to enable the additional public-service mountain/city smoke test.
Live MapTiler validation requires your own key; normal tests use a dummy key and
intercepted TileJSON/images without billable requests.

`npm run vendor` copies the pinned `manifold-3d` 3.5.1 JavaScript, WebAssembly,
license, and version marker into `vendor/manifold-3d`. Commit these assets together
when intentionally changing that version. No application build step is needed.

## Data and dependency credits

- [Mapzen / AWS terrain tiles](https://github.com/tilezen/joerd/blob/master/docs/use-service.md)
- [MapTiler Terrain RGB v2](https://docs.maptiler.com/schema-raster/terrain-rgb/)
- [OpenStreetMap contributors — ODbL](https://www.openstreetmap.org/copyright)
- [OSM simple building conventions](https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings)
- [Manifold — Apache 2.0](https://github.com/elalish/manifold), license included in `vendor/manifold-3d/LICENSE`

Exported ZIP documentation records the terrain source and estimated-building count.
The existing lead capture endpoint and print-profile settings are retained.
