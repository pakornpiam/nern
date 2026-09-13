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

Puzzle tabs scale to the shorter side of each piece and leave room between
neighboring tabs. This keeps the tabs and corners attached when the preview
spreads the pieces apart, including stretched selections and low-detail grids.
Regenerate existing models to use the corrected seams; exported pieces use the
same boundaries as the preview.

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

## Colour mode

**Elevation bands** is the default and is unchanged: height decides colour. **Real
land types** throws that away and colours by what is actually on the ground, from
OpenStreetMap: water, snow, forest, grass/farmland, and other ground, instead of a
water slice plus altitude bands. Four of those print in an ordinary scene, so it
still fits one AMS unit — snow only claims a fifth slot where there is snow, and
the panel says so when it does.

`natural=glacier` and `natural=snowfield` become snow. `natural=wood` and
`landuse=forest` become forest. `natural=grassland|scrub|heath` and
`landuse=grass|meadow|farmland|orchard|vineyard|allotments` become grass/farmland.
Everything else — streets, bare rock, roofs, and every square metre nobody has
tagged — is other ground. `landuse=winter_sports` is deliberately *not* snow: a ski
resort boundary is a business, not a surface, and routinely contains forest.

Where polygons overlap, the order decides: **water beats snow beats forest beats
grass**. So a glacier drawn across a wood prints as ice. Water is not looked up
separately — it reuses the mask the water layer already builds, so turning the water
layer off drops the blue and hands those cells to whatever land type covers them,
and the water level still moves the shoreline.

### The snow line

OpenStreetMap holds **permanent** ice only: glaciers and permanent snowfields. There
is no seasonal-snow tag anywhere in the data, so a peak that is white five months a
year is not white here. **Add a snow line** fills that gap — everything at or above
an altitude you type prints as snow, over the top of any glaciers that were mapped.

Be clear about what that is: an altitude you chose, not measured snow. It is written
into the exported README as such. The altitude is metres above sea level, the same
units as the water level, and the model panel reports the range the selection spans
so you have something to aim at. Cells are judged at their centre — the same point
the OSM polygons are tested against — and the line overwrites mapped vegetation
rather than yielding to it, because a snow cap a treeline could veto comes out
moth-eaten wherever the treeline was drawn inconsistently.

Changing it restamps from cached data, with no Overpass round-trip: the altitude is
applied to the geometry, not to the request.

This is mapped data, not imagery. A hillside with no forest polygon prints as other
ground because nobody drew it, not because it is bare, and the coverage note under
the colour pickers reports the mapped share so you can judge that before printing.
Rural areas outside Europe are frequently blank. Glacier coverage is good in the
Alps, Himalaya, Andes, Alaska and Iceland and thin elsewhere; `natural=snowfield` is
a real tag but a rare one, and adds little in practice.

The colours are a 0.8 mm skin on top of an other-ground body, cut from the finished
piece so buildings, routes, and jigsaw seams stay exactly where they were. That
0.8 mm is measured **perpendicular to the ground**, not straight down, and on steep
terrain the difference is the whole print. A skin 0.8 mm thick *vertically* leaves a
coloured ribbon only 0.8 mm ÷ slope wide at each slicing layer, and a model's slope is
the real slope times the vertical exaggeration — so at the default 2.5× a 39° hillside
came out as a single 0.4 mm extrusion and anything steeper fell below one extrusion
width and was dropped by the slicer outright. Snow paid for that, since a snow line
puts snow on the highest and steepest ground in the model by definition: it looked
right in the preview and printed in the ground colour. Measuring the thickness along
the surface normal keeps the ribbon at 0.8 mm or wider on any slope at any
exaggeration, and leaves level ground with exactly the geometry it always had.

Three further consequences are worth knowing. The skin never eats into the last 1 mm
above the build plate, so on a model whose lowest ground sits under 1.8 mm the colour
layer there is thinner than 0.8 mm, or absent. Buildings print in the other-ground
colour: the skin is cut away from their footprints so the walls stay one solid material
rather than gaining a coloured cap. And a colour region narrower than one cell is still
narrower than one extrusion however thick the skin is — that is the grid's resolution
rather than the skin's, and **Spread** is the control for it.

### Spreading

**Spread mapped areas** grows every mapped land type outward by a number of grid cells,
closing the gaps between fragments the grid is too coarse to hold. It is the natural
companion to a large selection: land types are decided at cell centres, so a wood that
covers most of a 300 m cell but misses its centre disappears entirely, and a scattering
of survivors reads as noise. A spread of one or two usually turns that back into
recognisable country.

Each land type has its own value, because they are not mapped to the same standard.
Forest is drawn carefully in most of the world and farmland barely at all in much of it,
so the spread that rescues a fragmented wood will smear farmland across ground that has
none — and a glacier, mapped from survey data, usually wants no spread whatever. Set them
independently and watch the preview.

It is measured in cells rather than metres because the growth is per cell either way —
a metre value would round to nothing at exactly the coarse detail this exists for. The
details panel reports the cell size, so read the two together.

Where two types would claim the same cell the lower one in the list wins, the same
precedence overlapping polygons get, so a larger number does not always reach further.

Two things it deliberately will not do. It never spreads water, because the water mask is
measured rather than guessed and growing it would move a real shoreline; growth only ever
writes into unmapped ground. And it does not invent anything: where OpenStreetMap has
mapped nothing at all, spreading changes nothing. The coverage note keeps reporting what
was actually mapped and adds what the spread painted beside it, so the two never blur.

Boundaries snap to terrain cells, so **Terrain detail** sets the smallest patch that
can appear — at detail 400 on a 180 mm print a cell is 0.45 mm, and a copse narrower
than that either disappears or claims a whole cell. Raise detail before blaming the
data.

Glaciers are large, vertex-dense multipolygons, so an alpine selection pulls far more
geometry than the same box did before snow existed.

### Large selections

Land types are available for anything the area box can draw, up to 15,000 km². A single
Overpass request cannot answer a box that size — it exceeds the server's own query
timeout and comes back empty about 25 seconds later — so the request is split into tiles
of roughly 1,000 km² and run two at a time, which is what the public service allows per
address. A full 120 × 120 km selection is sixteen requests and takes appreciably longer
than a small one; the progress overlay counts them off.

A tile that is rate-limited or stumbles is retried twice with a growing pause, since
public Overpass turns requests away as a matter of course and one lost tile would take a
whole rectangle of ground with it. A tile that hits the server's own query timeout still
returns most of what it gathered, and that part is kept. If a tile genuinely does not
finish, its ground is simply missing rather than the whole build dying: the model is made
from what arrived and the details panel says how many requests fell short. Gaps are never
cached, so pressing Generate again really does go back for them.

Two things get dropped at scale, both deliberately. Mapped areas smaller than one
terrain cell cannot be drawn at any detail setting, so they are discarded before they
are ever loaded — which is what keeps the budgets below reachable. And because land
types are sampled at cell centres, a wood smaller than a cell either claims the whole
cell or vanishes: at 15,000 km² and the default detail 400 a cell is about 300 m across,
so the result is coarse. The details panel reports the cell size; raise **Terrain
detail** for finer land types, at the cost of a slower build.

Requests are capped at 15,000 km² per model, 40,000 features, and 800,000 vertices.
Past any of those the mode is not available for that selection at all, so the app names
the ceiling you hit and puts the colour picker back on elevation bands. Retrying cannot
shrink a selection, and a picker left on land types would go on failing every Generate
after it — terrain included — while the panel advertised colours the model did not have.
Shrink the box and the mode is available again — in practice only a selected region can
exceed the ceiling, since the area box stops below it. A lookup that *fails* is the opposite
case: the area was fine and the network was not, so land types stays selected, your
existing model is kept rather than replaced with a half-coloured one, and Generate
retries. Results are cached per selection, so switching modes back and forth restamps
from cached data without another Overpass round-trip.

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

## The flat route part

Every route part above has a curved face somewhere. The inlay ribbon rides the grooved
terrain on one side and the original terrain on the other; the through plug gets a flat
bottom only from the flat profile, and its top follows the ground either way. **Export
flat route** is the part that has neither: the route corridor as a plain plate, top and
bottom both planar, so it prints face-down on a real contact patch with supports off. It
is the shape you want as a keepsake, a glue-on marker, or a two-colour overlay rather
than something that seats in the print.

**Flat route thickness** sizes it, 0.4–10 mm, and that slider does nothing else. The
plate is built from the model when you press the button, so it is in no preview, no
piece, no `_pieces.zip` and no Bambu 3MF, and dragging the thickness neither regenerates
nor rebuilds anything. Its width is the route width — the *stamped* one, so a route
widened to what the grid can carry gives a plate widened to match, and the part is
always as wide as the route on the print. It is clipped to the printed outline the same
way, so a circle or hex frame cuts the plate short exactly where it cuts the terrain.

It is offered in every mode, **Off included**, because it depends on nothing the terrain
stamp did — only on the path, the width and the print outline. That makes Off the useful
case rather than a degenerate one: a clean unmarked terrain, with the route as a separate
flat piece beside it.

For the same reason it is the one export that follows the route on the *map* rather than
the one baked into the model: draw or import a track after generating and the button arms
immediately, with no rebuild, because nothing about the plate depends on what was stamped.
Clear the route and it falls back to the one the model was built with, so the part you
just had does not vanish. It still needs a model — the grid, the route width and the
printed outline all come from there — so Generate at least once first.

## Export names

Downloads take the name of the place you searched, so `Chiang Mai` yields
`chiang_mai_chiang_mai_province_combined.stl` alongside its pieces, Bambu, frame,
and route counterparts — `_route_flat.stl` among them. Selected regions name themselves, and an archive holding
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
