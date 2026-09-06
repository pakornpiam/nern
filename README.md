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

## Area shape

The green box is a rectangle with independent axes. Drag a corner to resize both
sides, an edge midpoint to stretch one, or type exact kilometres into **Width X**
and **Height Y**. The **Area size** slider scales both axes at once and preserves
the shape. The centre stays pinned while resizing.

**Terrain detail** sets the grid on the longer side and scales the shorter side to
match, so cells stay square rather than stretching: a 40 × 10 km selection at
detail 400 becomes a 400 × 100 grid — even detail in both directions, and a
quarter of the triangles a forced 400 × 400 grid would cost. Past roughly a 6.7:1
ratio the short side reaches the 60-sample floor and cells stop being square.

**Maximum model size** applies to whichever side is longer, so a wide selection
prints 180 × 45 mm rather than overrunning the plate. Circle and hex print shapes
inscribe themselves in the rectangle, so a circle becomes an ellipse.

## Water layer

**Enable water layer** is on by default and behaves as it always did: everything at or
below the water level, plus the lakes and rivers OpenStreetMap knows about, prints in the
water colour, and the AMS holds 3 land bands + blue.

Turning it off does three things. No Overpass request is made at all, so a desert or an
inland city generates with one less network dependency. The water level and the flatten
option disappear, since neither means anything without a water surface. And the freed
filament slot becomes **band 1** — an ordinary elevation band with its own colour picker
and its own editable altitude, so the print still uses four colours, just all of them
terrain. Its default colour is the dark blue `#2c5c8f`; pick something else if that reads
as water to you.

Toggling restamps the preview from the cached elevation data in both directions — the
switch never discards the OSM mask, it only tells the build to ignore it. The exception is
a model *generated* with water off: that source skipped the Overpass call, so re-enabling
water asks you to press Generate rather than silently showing nothing. Note that moving
between 3 and 4 bands changes how many boundaries there are, so your typed cuts reset to
an even split and the app says so.

## Route dimensions

**Route width**, **Groove depth** / **Ridge height**, and — for the full-depth route —
**Fit clearance** size the route stamp in millimetres of print, independent of the
mode. Width runs 0.6–12 mm, depth 0.2–3 mm, and clearance 0–0.8 mm per side; values
outside those bounds are clamped by the geometry, not just the sliders. The defaults
(3.2 mm wide, 1.2 mm deep, 0.2 mm clearance) are what the modes used to hardcode.

The sliders carry one shared value across modes rather than a per-mode default, so a
route keeps its size when you switch between inlay, emboss, engrave, and full depth.
Depth is a magnitude: emboss raises the ridge by it, engrave and inlay cut down by it.
A rounded full-depth route reaches the print bottom by definition, so depth is disabled
there and clearance takes over — the channel is the route width plus twice the clearance,
which is the assembly play, and worth tuning to your printer. The flat profile below
gives depth a meaning for that mode too.

## Route profile

**Rounded groove** is the original cross-section: a parabola, deepest on the centreline
and rising to nothing at the edges. It looks right, but the red part it produces has a
curved underside, so it meets the bed along a line rather than a face — it tips, and
the flanks want supports.

**Flat floor** cuts the same depth with a flat bottom and a short chamfered wall
instead. The inlay insert needs no separate treatment for this: its underside already
follows the grooved surface, so flattening the groove makes the insert an even ribbon
with a real contact patch. Print it flat side down with supports off.

For the full-depth route the flat profile does something more: instead of cutting to
the print bottom, the channel stops at a single horizontal plane one depth below the
lowest ground the route crosses. The base slab stays solid under the route, and the
plug that drops in has a genuinely planar underside. That plane is measured over the
corners of every cell the channel touches, not just the channel's own vertices —
terrain is linear across a cell, so a cliff beside the route can put an interpolated
channel edge well below any vertex in it, and a floor above that edge would fold the
pocket wall back through itself. Where the depth would leave less than 1 mm of slab,
the route falls back to the full-depth cut rather than printing a floor too thin to
hold.

Rounded is the default, and every model built without choosing a profile is
byte-identical to what it was before the option existed. The flat profile also writes
`enable_support = 0` into the Bambu 3MF, so a preset with supports on cannot fill the
channel with the very structures the profile removes the need for.

The route is stamped by testing the elevation grid's vertices, so a route thinner than
the vertex spacing has nothing to land on. Rather than dropping it — which cost the print
its route part and its route file with no warning — the width is raised to what the grid
can carry and the status line reports both numbers. Raise **Detail** for a genuinely
thinner route: at detail 400 on a 180 mm print, vertices sit 0.45 mm apart and anything
down to about 0.64 mm survives untouched.

Changing a dimension restamps the preview from the cached elevation data, with no new
tile or Overpass request, so dragging a slider is cheap. Building footprints and the
banded 3MF and water solids all follow the width, so a widened route stays open and
its exports stay watertight.

## Export names

Downloads take the name of the place you searched, so `Chiang Mai` yields
`chiang_mai_chiang_mai_province_combined.stl` alongside its pieces, Bambu, frame,
and route counterparts. Selected regions name themselves, and an archive holding
several regions joins theirs. Typing new coordinates clears the name and falls
back to `topopuzzle`; dragging or resizing the box keeps it, since that refines
the same place. A model keeps the name it was generated for until it is rebuilt.

A Bambu export that carries a route arrives as a single `_bambu.zip` holding the
4-colour terrain and the red route part. It has to be one download: a browser grants
a page one programmatic download and puts the next behind a permission that defaults
to ask, so the second file used to disappear without an error.

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
