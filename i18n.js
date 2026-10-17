/* Nern interface translations.
 *
 * Loaded before the app's inline script so the dictionary exists by the time
 * anything paints. Two flat key -> string maps; Thai falls back to English for
 * any key it is missing, so a half-finished translation degrades gracefully
 * rather than showing raw keys.
 *
 * Strings with runtime values use {name} placeholders — never concatenation,
 * because Thai word order does not follow English.
 *
 * NOT translated by design: STL/3MF filenames and part names (slicers and
 * filesystems want ASCII), map attribution (legally required as-is), and
 * place names from Nominatim/OpenStreetMap (whatever the map data carries).
 */
(function () {
  'use strict';

  const en = {
    lblColorMode: 'Color mode', modeElevation: 'Elevation bands', modeLandcover: 'Real land types',
    landWater: 'Water', landSnow: 'Snow / ice', landForest: 'Forest', landGrass: 'Grass / farmland', landOther: 'Other ground / buildings',
    hintLandcover: 'Mapped land types — snow, forest, grass/farmland — form a 0.8 mm surface over the other-ground color. Unmapped ground and buildings use that color too. Detail controls the smallest mapped features shown.',
    lblSnowLineEnabled: 'Add a snow line', lblSnowLine: 'Snow line',
    lblLandGrowSnow: 'Spread snow / ice', lblLandGrowForest: 'Spread forest',
    lblLandGrowGrass: 'Spread grass / farmland', unitCells: 'cells',
    hintLandGrow: 'Grows each mapped land type outward by this many grid cells, closing the gaps between fragments too small for the grid to hold. It spreads the data OpenStreetMap has — it does not invent land types where nothing is mapped.',
    noteLandcoverSpread: 'Spread by {list} cells: land types cover {colored}% of the model, from {mapped}% actually mapped.',
    hintSnowLine: 'Everything at or above this altitude prints as snow, on top of any glaciers OpenStreetMap maps. This is an altitude you choose, not measured snow: OpenStreetMap records permanent ice only — glaciers and permanent snowfields — and has no seasonal snow at all.',
    landcoverSnow: 'Snow and ice: {n}% of selected cells.',
    hintLandcoverSlots: 'This print uses {n} materials, so Bambu Studio maps it to {n} AMS filament slots.',
    landcoverSnowSlots: 'Snow adds a fifth material, so this print needs more than one AMS unit or a manual swap. Turn the snow line off, or pick an area with no mapped glaciers, to stay at four.',
    readmeSnowLine: 'Snow line: cells whose center sits at or above {alt} m print as snow. That is an altitude chosen in the app, not measured snow cover.',
    landcoverPending: 'Generate or select this mode to load OpenStreetMap land areas.',
    landcoverCoverage: 'OSM mapped vegetation: {n}% of selected terrain cells (after water and snow). Invalid features skipped: {skipped}.',
    landcoverEmpty: 'No mapped vegetation was found. Unmapped ground uses the other-ground color; it is not verified bare land.',
    pgLandcover: 'Loading mapped land types…', pgLandcoverTiles: 'Loading mapped land types {done}/{total}…',
    noteLandcoverPartial: 'Land-type data is incomplete: {missing} of {total} map requests did not finish. Generate again to retry the gaps.',
    noteLandcoverCoarse: 'Land-type cells are {n} m across at this detail. Mapped areas smaller than a cell are dropped — raise Terrain detail for finer land types.', pgLandcoverGeometry: 'Building colored surfaces {done}/{total}…',
    errLandcoverFetch: 'Land-type mapping could not be loaded completely. Your previous model is kept. Press Generate to retry.',
    errLandcoverArea: 'Real land types supports up to 15,000 km² per model. Select a smaller area or use elevation bands.',
    errLandcoverLimit: 'This area has too much land-type geometry (40,000 features or 800,000 vertices). Select a smaller area or use elevation bands.',
    readmeLandcover: 'Land types: © OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright). Forest and grass/farmland are mapped areas, not satellite colors. Other ground includes unmapped areas and buildings. Colors occupy the upper 0.8 mm vertically, preserving at least 1 mm of base; low areas can have a thinner color layer. Boundaries follow terrain cells and may omit sub-cell features. Water uses the enabled water mask. Snow is OpenStreetMap permanent ice — glaciers and permanent snowfields, never seasonal cover — plus an optional snow line, an altitude chosen in the app. Terrain materials are emitted only for the categories present, in precedence order: water, snow, forest, grass, other. Routes and optional frames retain separate materials.',
    /* ---- document + brand ---- */
    appName: 'Nern',
    pageTitle: 'Nern — 3D-Printable Topographic Puzzles of Anywhere on Earth',
    tagline: 'Turn any place on Earth into an interlocking, 3D-printable topographic puzzle. Pick a spot, generate the terrain, export STL pieces.',

    /* ---- 1 · Location ---- */
    g1Title: '1 · Location',
    searchPlaceholder: 'Search a place (e.g. Mount Fuji)',
    searchGo: 'Go',
    regionSelect: '▱ Add region / province',
    regionPick: '▱ Click a region on the map…',
    regionCancel: 'Cancel boundary selection',
    regionFinish: '✓ Finish',
    regionClear: 'Clear all',
    regionOutputMode: 'Multiple-region output',
    regionCombined: 'Combined — one model',
    regionSeparate: 'Separate — one model per region',
    regionRemove: 'Remove',
    hintRegionSelect: 'Enter a region or province above and press Add, or leave the search empty and click regions on the map. Press Finish when selection is complete.',
    hintRecenter: 'Drag the green box to move the puzzle area, a corner to resize both sides, or an edge handle to stretch one side. Click anywhere else on the map to recentre.',
    gpxLoad: 'Load GPX track…',
    gpxRemove: 'Remove GPX track',
    hintGpx: 'Import a GPX route (e.g. from gpx.studio) — the puzzle area auto-fits the track.',
    routeDraw: '✏ Draw route',
    routeFinish: '✓ Finish route',
    routeGpsTitle: 'Add your current GPS location as a route point',
    routeGpsLabel: '📍 GPS',
    routeFitTitle: 'Fit puzzle area to the route',
    routeFitLabel: 'Fit area',
    routeSaveTitle: 'Download route as GPX',
    routeClearTitle: 'Delete route',
    routePtPlaceholder: 'Add point: lat, lon (e.g. 35.36, 138.72)',
    routeAdd: 'Add',
    hintDrawEdit: 'Draw: click the map to add points, type coordinates above, or 📍 for your GPS location; double-click to finish. Edit: drag a point to move it, click/drag a small midpoint to insert, right-click a point to delete.',
    lblRouteOnPrint: 'Route on print',
    optInlay: 'Red inlay — separate printable part',
    optThrough: 'Full-depth route — removable top-to-bottom piece',
    optEmboss: 'Raised ridge',
    optEngrave: 'Engraved groove',
    optOff: 'Off',
    lblRouteTop: 'Route top',
    optFlush: 'Flush with terrain',
    optRaised: 'Raised 0.6 mm',
    lblRoutePieces: 'Route pieces',
    optSplitPiece: 'Split per puzzle piece',
    optContinuous: 'One continuous route',
    lblRouteProfile: 'Route profile',
    optRouteRound: 'Rounded groove',
    optRouteFlat: 'Flat floor — prints with no support',
    lblRouteWidth: 'Route width',
    lblRouteDepth: 'Groove depth',
    lblRoutePlugDepth: 'Plug depth',
    lblRouteHeight: 'Ridge height',
    lblRouteClear: 'Fit clearance',
    hintRoundGroove: 'The groove is rounded, so the red part has a curved underside and may need supports to print.',
    hintRoundPlug: 'The route cuts all the way through. Switch to a flat floor to stop it short and keep the base solid underneath.',
    hintFlatGroove: 'The groove has a flat floor {depth} mm deep, so the red part is an even ribbon that prints flat-side down with no support.',
    hintFlatPlug: 'The route stops {depth} mm below the lowest ground it crosses, so the base stays solid underneath and the plug has a flat bottom that needs no support.',
    hintThroughRoute: 'The {route} mm route reaches the print bottom. Its channel is {channel} mm wide, leaving {clear} mm clearance on each side for assembly.',
    hintThroughPocket: 'The {route} mm route stops {depth} mm into the print instead of cutting through. Its channel is {channel} mm wide, leaving {clear} mm clearance on each side for assembly.',
    lblRouteFlatThick: 'Flat route thickness',
    hintRouteFlat: 'Its own download: the {route} mm route as a plate {thick} mm thick, flat on top and bottom, so it prints face-down with no support. Available in every mode, Off included, and shown in no preview.',
    lblAreaSize: 'Area size',
    lblCenterLat: 'Center lat',
    lblCenterLon: 'Center lon',

    /* ---- 2 · Puzzle ---- */
    g2Title: '2 · Puzzle',
    lblPiecesAcross: 'Pieces across',
    lblPiecesDown: 'Pieces down',
    hintSinglePiece: 'The 1 × 1 default is a single terrain model with no puzzle cuts.',
    lblDetail: 'Detail (grid)',
    hintTerrainDetail: 'Detail sets the grid on the longer side; the shorter side scales to match. Very high settings can take a long time and use substantial memory, especially with multiple regions.',
    lblVex: 'Vertical exaggeration',

    /* ---- 3 · Print size ---- */
    g3Title: '3 · Print size',
    lblWidth: 'Maximum model size',
    lblBase: 'Base thickness',

    /* ---- 4 · Colors ---- */
    g4Title: '4 · Colors (Bambu AMS)',
    lblWaterEnabled: 'Enable water layer',
    lblWaterLevel: 'Water level',
    hintWater: 'Everything at or below this height prints in the water colour, together with the lakes and rivers OpenStreetMap knows about. The surface keeps its relief — it is painted, not flattened.',
    lblWaterFlatten: 'Flatten the water surface',
    hintWaterFlat: 'Everything at or below this height prints in the water colour, together with the lakes and rivers OpenStreetMap knows about. Each lake is levelled to its own median height and the flooded area to the level above, so the water prints as a true flat plane with a crisp shoreline.',
    bandWater: 'Water',
    fmtWaterUpTo: '≤ {hi} m',
    fmtWaterLakes: 'lakes · ≤ {hi} m',
    bandLowest: 'Band {n} · low',
    bandMid: 'Band {n}',
    bandPeak: 'Band {n} · peak',
    unitM: 'm',
    btnBandReset: 'Reset to even',
    lblWaterAuto: '4 bands when there is no water',
    noteBandsReset: 'The elevation range changed, so the band boundaries were reset to an even split.',
    hintBands: 'Terrain is split into {n} elevation bands — type a boundary to move it. Each band exports as its own solid with a material assigned, so Bambu Studio maps this print to {total} AMS filament slots.',

    /* ---- 5 · Frame plate ---- */
    g5Title: '5 · Frame plate',
    tabNoFrame: 'No frame',
    tabWithFrame: 'With frame',
    lblFrameShape: 'Frame shape (print + plate)',
    optCircle: 'Circle',
    optSquare: 'Square',
    optHex: 'Hexagon',
    optRect: 'Rectangle',
    lblPlateMargin: 'Plate margin',
    lblRimHeight: 'Rim height (above puzzle base)',
    lblPlateColor: 'Plate color',
    lblTextColor: 'Text color',
    lblPlateText: 'Text on plate (Thai / English)',
    framePlaceholder: 'e.g. ภูเขาไฟฟูจิ · Mount Fuji',
    lblTextSize: 'Text size',
    lblTextPos: 'Text position',
    hintFrame: "Cuts the puzzle to the frame shape and adds a matching display tray (printed as its own part); the text is inlaid flush in the tray's lower rim.",
    lblPrintShape: 'Print shape',
    hintPrintShape: 'Puzzle only, cut to this shape — no display tray.',

    /* ---- actions, stats, panes ---- */
    btnGenerate: 'Generate terrain',
    gModel: 'Model',
    statElev: 'Elevation range',
    statPiece: 'Piece footprint',
    statTris: 'Triangles',
    legendLow: 'low',
    legendHigh: 'high',
    btnExportBambu: '⬇ Export Bambu 3MF — terrain + route',
    btnExportZip: '⬇ Export puzzle pieces (.zip of STL)',
    btnExportOne: '⬇ Export single combined STL',
    btnExportBambuMulti: '⬇ Export regional Bambu files (.zip)',
    btnExportZipMulti: '⬇ Export regional puzzle pieces (.zip)',
    btnExportOneMulti: '⬇ Export one combined STL per region (.zip)',
    btnExportFrame: '⬇ Export frame plate (STL)',
    btnExportRouteFlat: '⬇ Export flat route (STL)',
    btnExportRouteFlatMulti: '⬇ Export one flat route per region (.zip)',
    hintCredits: 'Elevation: AWS Terrarium terrain tiles. Basemap: OpenStreetMap. Geocoding: Nominatim. All free, no API key.',
    paneMap: 'Pick location',
    pane3d: '3D preview · drag to orbit',
    splitHint: 'Drag to resize · double-click to reset',
    overlayWorking: 'Working…',
    layerTopo: 'Topographic',
    layerStreets: 'Streets',

    /* ---- download gate ---- */
    gateTitle: 'Almost there!',
    gatePitch: 'The STL is free — leave your name and email and the download starts right away.',
    gateName: 'Name',
    gateNamePlaceholder: 'Your name',
    gateEmail: 'Email',
    gateEmailPlaceholder: 'you@example.com',
    gateGo: 'Download',
    gateCancel: 'Cancel',
    gateHint: 'We only use this to share Nern updates. No spam, ever.',
    gateBmc: '☕ Buy me a coffee',
    gateAd: 'Our sponsor ↗',
    gateErrName: 'Please enter your name.',
    gateErrEmail: 'Please enter a valid email address.',

    /* ---- runtime status ---- */
    stBoot: 'Pick a place, then “Generate terrain”. Default: Mount Fuji.',
    stSearching: 'Searching…',
    stFound: 'Found: {place}',
    stRegionPick: 'Click regions or provinces on the map, then press Finish.',
    stRegionLoading: 'Loading the administrative boundary…',
    stRegionSelected: 'Added: {place} · {n} selected',
    stRegionDuplicate: '{place} is already selected.',
    stRegionRemoved: 'Removed: {place} · {n} selected',
    stRegionCleared: 'All region boundaries cleared.',
    stGpxLoaded: 'GPX loaded: {count} points, area {x} × {y} km',
    stGpxRemoved: 'GPX track removed',
    stBadCoords: 'Enter coordinates as “lat, lon” — e.g. 35.3606, 138.7274',
    stRoutePoint: 'Route point {n} added at {lat}, {lon}',
    stGpsFix: 'Getting GPS fix…',
    stGpsAdded: 'GPS point {n} added (±{acc} m)',
    stGpsFailed: 'GPS failed: {why}{note}',
    stAreaFit: 'Area fit to route: {x} × {y} km',
    stRouteDeleted: 'Route deleted',
    stWaterNeedsGenerate: 'This model was built without water data, so there is nothing to show. Press Generate to fetch it.',
    stRouteOutside: 'The route lies outside the puzzle area, so it was not added to the print. Use Fit area, or move the box over the track.',
    stFlatRouteEmpty: 'No flat route to export: the route lies outside the printed area. Use Fit area, or move the box over the track.',
    stFlatRouteNoModel: 'Generate the terrain first — the flat route takes its size and outline from the model.',
    errFlatRoute: 'The flat route could not be built ({msg}). The browser console has the details.',
    errFlatRouteStale: 'This page is running an old cached copy of the app. Reload with Ctrl+Shift+R (Cmd+Shift+R on a Mac) and try again.',
    stRouteTooThin: 'A {asked} mm route is finer than this grid can carry, so it was widened to {used} mm. Raise Detail for a thinner route.',
    stDownloaded: 'Downloaded {file}',
    stZipping: 'Zipping STL pieces…',
    stBambuDone: 'Downloaded .3mf — Bambu Studio will load each color band as a separate AMS filament',
    stBambuDoneRoute: 'Downloaded {file} — it holds the 4-color terrain and the route as its own red part',
    stDone: 'Done · zoom {zoom} · {n} pieces',
    stDoneMulti: 'Done · {regions} regions · {n} pieces',

    /* ---- progress overlay ---- */
    pgPreparing: 'Preparing…',
    pgRegion: 'Generating region {done}/{total}: {place}',
    pgTiles: 'Fetching terrain tiles {done}/{total}…',
    pgWater: 'Fetching water areas (OSM)…',
    pgPieces: 'Cutting puzzle pieces…',
    pgRoute: 'Stamping route…',
    pgRouteThrough: 'Cutting full-depth route…',
    pgBambu: 'Building {n}-color 3MF…',

    /* ---- errors ---- */
    errSearchFailed: 'Search failed',
    errNoResults: 'No results for "{query}"',
    errNoRegionBoundary: 'No region or province boundary was found here. Try entering its full name in the search box.',
    errRegionChanged: 'The region selection changed while generating. Press Generate again.',
    errBadGpx: 'Not a valid GPX file',
    errNoGpxPoints: 'No track points found in GPX',
    errCors: 'Elevation tiles blocked by CORS. Try a different network or a CORS proxy.',
    errNoGeolocation: 'Geolocation is not supported by this browser',
    err3mf: '3MF export failed',
    errGenerate: 'Generation failed',
    gpsDenied: 'permission denied',
    gpsUnavailable: 'position unavailable',
    gpsTimeout: 'timed out',
    gpsHttpsNote: ' — browsers only allow GPS over HTTPS (or localhost)',

    /* ---- number/unit formats ---- */
    fmtRange: '{lo}–{hi} m',
    fmtMeters: '{n} m',
    fmtPieceSize: '{w}×{h} mm',
    fmtMultiModels: '{regions} models · {pieces} pieces',

    /* ---- README.txt inside the exported zip ----
       Hard-wrapped by hand; keep lines under ~78 characters. */
    readmeHead:
      'Nern export\nPieces: {nx} x {ny}\nModel size: {w} x {d} mm\n' +
      'Print all pieces, then assemble the jigsaw. Tabs interlock by design.\n',
    readmeThrough:
      'The route_red_*.stl parts run the full depth of the print. Print them in red\n' +
      '(or any contrast colour) and press them into the channels; each side has\n' +
      '{clear} mm of clearance.\n',
    readmeThroughPocket:
      'The route_red_*.stl parts drop into pockets that stop {floor} mm above the print\n' +
      'bottom, so the base stays solid under the route. They have flat undersides —\n' +
      'print them in red (or any contrast colour) with supports OFF; each side has\n' +
      '{clear} mm of clearance.\n',
    readmeContinuous:
      'route_red_continuous.stl spans every piece, so seat it only once the puzzle\n' +
      'is fully assembled.\n',
    readmeInlay:
      'The route_red_*.stl parts are shallow inlays. Print them in red and press\n' +
      'them into the grooves.\n',
    readmeInlayFlat:
      'The route_red_*.stl parts are shallow inlays with flat undersides. Print them\n' +
      'in red with supports OFF, flat side down, and press them into the grooves.\n',
  };

  /* Thai. Terminology choices worth knowing:
       route      -> เส้นทาง          piece   -> ชิ้น / ชิ้นส่วน
       band       -> แถบ              inlay   -> แถบฝัง
       frame plate-> ถาดกรอบ          terrain -> ภูมิประเทศ
       snow / ice -> หิมะ / น้ำแข็ง      glacier -> ธารน้ำแข็ง
       snow line  -> แนวหิมะ            permanent ice -> น้ำแข็งถาวร
     Units are written in Thai abbreviations (มม. = mm, กม. = km). */
  const th = {
    lblColorMode: 'โหมดสี', modeElevation: 'แถบตามระดับความสูง', modeLandcover: 'ประเภทพื้นที่จริง',
    landWater: 'น้ำ', landSnow: 'หิมะ / น้ำแข็ง', landForest: 'ป่า', landGrass: 'ทุ่งหญ้า / พื้นที่เกษตร', landOther: 'พื้นที่อื่น / อาคาร',
    hintLandcover: 'ประเภทพื้นที่บนแผนที่ ได้แก่ หิมะ ป่า และทุ่งหญ้า/พื้นที่เกษตร เป็นชั้นสีผิวหนา 0.8 มม. บนฐานสีพื้นที่อื่น พื้นที่ที่ไม่มีข้อมูลและอาคารใช้สีพื้นที่อื่นด้วย ความละเอียดกำหนดขนาดพื้นที่เล็กที่สุดที่แสดงได้',
    lblSnowLineEnabled: 'เพิ่มแนวหิมะตามระดับความสูง', lblSnowLine: 'แนวหิมะ',
    lblLandGrowSnow: 'ขยายพื้นที่หิมะ / น้ำแข็ง', lblLandGrowForest: 'ขยายพื้นที่ป่า',
    lblLandGrowGrass: 'ขยายพื้นที่ทุ่งหญ้า / พื้นที่เกษตร', unitCells: 'ช่อง',
    hintLandGrow: 'ขยายประเภทพื้นที่ที่มีข้อมูลออกไปตามจำนวนช่องที่กำหนด เพื่อปิดช่องว่างระหว่างส่วนที่เล็กเกินกว่ากริดจะแสดงได้ เป็นการขยายข้อมูลที่ OpenStreetMap มีอยู่ ไม่ได้สร้างประเภทพื้นที่ขึ้นใหม่ในบริเวณที่ไม่มีข้อมูล',
    noteLandcoverSpread: 'ขยาย {list} ช่อง: ประเภทพื้นที่ครอบคลุม {colored}% ของโมเดล จากที่มีข้อมูลจริง {mapped}%',
    hintSnowLine: 'พื้นที่ที่อยู่สูงตั้งแต่ระดับนี้ขึ้นไปจะพิมพ์เป็นสีหิมะ เพิ่มจากธารน้ำแข็งที่ OpenStreetMap มีข้อมูลอยู่แล้ว ค่านี้เป็นระดับความสูงที่คุณเลือกเอง ไม่ใช่ข้อมูลหิมะที่วัดจริง เพราะ OpenStreetMap บันทึกเฉพาะน้ำแข็งถาวร คือธารน้ำแข็งและลานหิมะถาวร และไม่มีข้อมูลหิมะตามฤดูกาลเลย',
    landcoverSnow: 'หิมะและน้ำแข็ง: {n}% ของช่องที่เลือก',
    hintLandcoverSlots: 'งานพิมพ์นี้ใช้วัสดุ {n} ชนิด Bambu Studio จึงจับคู่กับช่องเส้นใย AMS {n} ช่อง',
    landcoverSnowSlots: 'หิมะเพิ่มวัสดุเป็นชนิดที่ห้า งานพิมพ์นี้จึงต้องใช้ AMS มากกว่าหนึ่งชุดหรือเปลี่ยนเส้นใยเอง หากต้องการใช้เพียงสี่ชนิด ให้ปิดแนวหิมะหรือเลือกพื้นที่ที่ไม่มีธารน้ำแข็ง',
    readmeSnowLine: 'แนวหิมะ: ช่องที่จุดกึ่งกลางอยู่สูงตั้งแต่ {alt} ม. ขึ้นไปจะพิมพ์เป็นสีหิมะ ค่านี้เป็นระดับความสูงที่เลือกในแอป ไม่ใช่ข้อมูลหิมะที่วัดจริง',
    landcoverPending: 'สร้างโมเดลหรือเลือกโหมดนี้เพื่อโหลดประเภทพื้นที่จาก OpenStreetMap',
    landcoverCoverage: 'พืชพรรณที่มีข้อมูล OSM: {n}% ของช่องภูมิประเทศที่เลือก (หลังหักพื้นที่น้ำและหิมะ) ข้ามข้อมูลรูปทรงที่ไม่ถูกต้อง: {skipped}',
    landcoverEmpty: 'ไม่พบข้อมูลพื้นที่พืชพรรณ พื้นที่ที่ไม่มีข้อมูลใช้สีพื้นที่อื่น ไม่ได้ยืนยันว่าเป็นพื้นที่โล่ง',
    pgLandcover: 'กำลังโหลดประเภทพื้นที่…', pgLandcoverTiles: 'กำลังโหลดประเภทพื้นที่ {done}/{total}…',
    noteLandcoverPartial: 'ข้อมูลประเภทพื้นที่ไม่ครบ: โหลดไม่ครบ {missing} จาก {total} ส่วน กดสร้างอีกครั้งเพื่อโหลดส่วนที่ขาด',
    noteLandcoverCoarse: 'ช่องประเภทพื้นที่กว้าง {n} ม. ที่ความละเอียดนี้ พื้นที่ที่เล็กกว่าหนึ่งช่องจะถูกตัดออก เพิ่มความละเอียดภูมิประเทศเพื่อให้ประเภทพื้นที่ละเอียดขึ้น', pgLandcoverGeometry: 'กำลังสร้างชั้นสีผิว {done}/{total}…',
    errLandcoverFetch: 'โหลดข้อมูลประเภทพื้นที่ได้ไม่ครบ เก็บโมเดลเดิมไว้แล้ว กดสร้างเพื่อลองอีกครั้ง',
    errLandcoverArea: 'โหมดประเภทพื้นที่จริงรองรับสูงสุด 15,000 ตร.กม. ต่อโมเดล เลือกพื้นที่เล็กลงหรือใช้แถบตามระดับความสูง',
    errLandcoverLimit: 'พื้นที่นี้มีข้อมูลมากเกินไป (40,000 รูปทรง หรือ 800,000 จุด) เลือกพื้นที่เล็กลงหรือใช้แถบตามระดับความสูง',
    readmeLandcover: 'ประเภทพื้นที่: © OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright) ป่าและทุ่งหญ้า/พื้นที่เกษตรอ้างอิงแผนที่ ไม่ใช่สีภาพดาวเทียม พื้นที่อื่นรวมพื้นที่ที่ไม่มีข้อมูลและอาคาร สีอยู่บนผิวหนา 0.8 มม. ในแนวดิ่ง โดยเหลือฐานอย่างน้อย 1 มม. พื้นที่ต่ำอาจมีชั้นสีบางกว่า ขอบเขตอิงช่องภูมิประเทศและอาจไม่แสดงส่วนที่เล็กกว่าช่อง น้ำใช้ข้อมูลน้ำเมื่อเปิดใช้งาน หิมะคือน้ำแข็งถาวรจาก OpenStreetMap ได้แก่ธารน้ำแข็งและลานหิมะถาวร ไม่ใช่หิมะตามฤดูกาล ร่วมกับแนวหิมะตามระดับความสูงที่เลือกในแอป วัสดุภูมิประเทศจะสร้างเฉพาะประเภทที่มีอยู่จริง เรียงตามลำดับความสำคัญคือน้ำ หิมะ ป่า ทุ่งหญ้า และพื้นที่อื่น เส้นทางและกรอบยังใช้วัสดุแยกตามเดิม',
    appName: 'เนิน',
    pageTitle: 'เนิน — จิ๊กซอว์ภูมิประเทศ 3 มิติ พิมพ์ได้จากทุกที่บนโลก',
    tagline: 'เปลี่ยนสถานที่ใดก็ได้บนโลกให้เป็นจิ๊กซอว์ภูมิประเทศแบบต่อประกบ พิมพ์ 3 มิติได้ เลือกจุดที่ต้องการ สร้างภูมิประเทศ แล้วส่งออกเป็นชิ้นส่วน STL',

    g1Title: '1 · ตำแหน่ง',
    searchPlaceholder: 'ค้นหาสถานที่ (เช่น ภูเขาไฟฟูจิ)',
    searchGo: 'ไป',
    regionSelect: '▱ เพิ่มภูมิภาค / จังหวัด',
    regionPick: '▱ คลิกภูมิภาคบนแผนที่…',
    regionCancel: 'ยกเลิกการเลือกขอบเขต',
    regionFinish: '✓ เสร็จ',
    regionClear: 'ล้างทั้งหมด',
    regionOutputMode: 'ผลลัพธ์หลายภูมิภาค',
    regionCombined: 'รวม — โมเดลเดียว',
    regionSeparate: 'แยก — หนึ่งโมเดลต่อภูมิภาค',
    regionRemove: 'ลบ',
    hintRegionSelect: 'พิมพ์ชื่อภูมิภาคหรือจังหวัดด้านบนแล้วกดเพิ่ม หรือเว้นช่องค้นหาไว้แล้วคลิกหลายภูมิภาคบนแผนที่ กดเสร็จเมื่อเลือกครบแล้ว',
    hintRecenter: 'ลากกรอบสีเขียวเพื่อย้ายพื้นที่จิ๊กซอว์ ลากที่มุมกรอบเพื่อปรับทั้งสองด้าน หรือลากจุดกึ่งกลางขอบเพื่อยืดด้านเดียว คลิกที่อื่นบนแผนที่เพื่อย้ายจุดกึ่งกลาง',
    gpxLoad: 'โหลดเส้นทาง GPX…',
    gpxRemove: 'ลบเส้นทาง GPX',
    hintGpx: 'นำเข้าเส้นทาง GPX (เช่น จาก gpx.studio) — พื้นที่จิ๊กซอว์จะปรับให้พอดีกับเส้นทางโดยอัตโนมัติ',
    routeDraw: '✏ วาดเส้นทาง',
    routeFinish: '✓ จบเส้นทาง',
    routeGpsTitle: 'เพิ่มตำแหน่ง GPS ปัจจุบันเป็นจุดบนเส้นทาง',
    routeGpsLabel: '📍 GPS',
    routeFitTitle: 'ปรับพื้นที่จิ๊กซอว์ให้พอดีกับเส้นทาง',
    routeFitLabel: 'พอดีพื้นที่',
    routeSaveTitle: 'ดาวน์โหลดเส้นทางเป็นไฟล์ GPX',
    routeClearTitle: 'ลบเส้นทาง',
    routePtPlaceholder: 'เพิ่มจุด: lat, lon (เช่น 35.36, 138.72)',
    routeAdd: 'เพิ่ม',
    hintDrawEdit: 'วาด: คลิกบนแผนที่เพื่อเพิ่มจุด พิมพ์พิกัดในช่องด้านบน หรือกด 📍 เพื่อใช้ตำแหน่ง GPS ของคุณ ดับเบิลคลิกเพื่อจบ · แก้ไข: ลากจุดเพื่อย้าย คลิกหรือลากจุดกึ่งกลางเล็ก ๆ เพื่อแทรกจุดใหม่ คลิกขวาที่จุดเพื่อลบ',
    lblRouteOnPrint: 'เส้นทางบนชิ้นงาน',
    optInlay: 'แถบฝังสีแดง — พิมพ์แยกชิ้น',
    optThrough: 'เส้นทางทะลุ — ชิ้นถอดออกได้จากบนถึงล่าง',
    optEmboss: 'สันนูน',
    optEngrave: 'ร่องเซาะ',
    optOff: 'ปิด',
    lblRouteTop: 'ผิวบนของเส้นทาง',
    optFlush: 'เสมอผิวภูมิประเทศ',
    optRaised: 'นูนขึ้น 0.6 มม.',
    lblRoutePieces: 'การแบ่งเส้นทาง',
    optSplitPiece: 'แยกตามชิ้นจิ๊กซอว์',
    optContinuous: 'เส้นทางต่อเนื่องชิ้นเดียว',
    lblRouteProfile: 'รูปหน้าตัดเส้นทาง',
    optRouteRound: 'ร่องก้นโค้ง',
    optRouteFlat: 'ก้นแบน — พิมพ์ได้โดยไม่ต้องใช้ซัพพอร์ต',
    lblRouteWidth: 'ความกว้างเส้นทาง',
    lblRouteDepth: 'ความลึกร่อง',
    lblRoutePlugDepth: 'ความลึกชิ้นเสียบ',
    lblRouteHeight: 'ความสูงสัน',
    lblRouteClear: 'ระยะเผื่อประกอบ',
    hintRoundGroove: 'ร่องมีก้นโค้ง ชิ้นสีแดงจึงมีใต้ท้องโค้งและอาจต้องใช้ซัพพอร์ตในการพิมพ์',
    hintRoundPlug: 'เส้นทางตัดทะลุตลอดความหนา เลือกแบบก้นแบนเพื่อให้หยุดก่อนถึงก้นและคงฐานด้านล่างไว้',
    hintFlatGroove: 'ร่องมีก้นแบนลึก {depth} มม. ชิ้นสีแดงจึงเป็นแถบหนาเท่ากันตลอด วางด้านแบนลงพิมพ์ได้โดยไม่ต้องใช้ซัพพอร์ต',
    hintFlatPlug: 'เส้นทางหยุดต่ำกว่าพื้นที่ต่ำสุดที่เส้นทางพาดผ่าน {depth} มม. ฐานด้านล่างจึงยังตันอยู่ และชิ้นเสียบมีก้นแบนที่ไม่ต้องใช้ซัพพอร์ต',
    hintThroughRoute: 'เส้นทางกว้าง {route} มม. ทะลุถึงก้นชิ้นงาน ร่องรับกว้าง {channel} มม. เหลือระยะเผื่อข้างละ {clear} มม. สำหรับการประกอบ',
    hintThroughPocket: 'เส้นทางกว้าง {route} มม. ลึกลงไปในชิ้นงาน {depth} มม. โดยไม่ทะลุ ร่องรับกว้าง {channel} มม. เหลือระยะเผื่อข้างละ {clear} มม. สำหรับการประกอบ',
    lblRouteFlatThick: 'ความหนาเส้นทางแบน',
    hintRouteFlat: 'ดาวน์โหลดแยกต่างหาก: เส้นทางกว้าง {route} มม. เป็นแผ่นหนา {thick} มม. แบนทั้งด้านบนและด้านล่าง จึงวางราบพิมพ์ได้โดยไม่ต้องใช้ซัพพอร์ต ใช้ได้ทุกโหมดรวมถึงโหมดปิด และไม่แสดงในภาพตัวอย่าง',
    lblAreaSize: 'ขนาดพื้นที่',
    lblCenterLat: 'ละติจูดกึ่งกลาง',
    lblCenterLon: 'ลองจิจูดกึ่งกลาง',

    g2Title: '2 · จิ๊กซอว์',
    lblPiecesAcross: 'จำนวนชิ้นแนวนอน',
    lblPiecesDown: 'จำนวนชิ้นแนวตั้ง',
    hintSinglePiece: 'ค่าเริ่มต้น 1 × 1 คือโมเดลภูมิประเทศชิ้นเดียว ไม่มีรอยตัดจิ๊กซอว์',
    lblDetail: 'ความละเอียด (กริด)',
    hintTerrainDetail: 'ความละเอียดกำหนดกริดของด้านที่ยาวกว่า ส่วนด้านที่สั้นกว่าจะปรับตามสัดส่วน ค่าที่สูงมากอาจใช้เวลานานและใช้หน่วยความจำจำนวนมาก โดยเฉพาะเมื่อเลือกหลายภูมิภาค',
    lblVex: 'อัตราขยายแนวตั้ง',

    g3Title: '3 · ขนาดงานพิมพ์',
    lblWidth: 'ขนาดชิ้นงานสูงสุด',
    lblBase: 'ความหนาฐาน',

    g4Title: '4 · สี (Bambu AMS)',
    lblWaterEnabled: 'เปิดใช้ชั้นน้ำ',
    lblWaterLevel: 'ระดับน้ำ',
    hintWater: 'ทุกจุดที่อยู่ต่ำกว่าหรือเท่ากับระดับนี้จะพิมพ์ด้วยสีน้ำ รวมกับทะเลสาบและแม่น้ำที่ OpenStreetMap รู้จัก ผิวยังคงความสูงต่ำเดิม — เป็นการลงสี ไม่ใช่ปรับให้ราบ',
    lblWaterFlatten: 'ปรับผิวน้ำให้ราบ',
    hintWaterFlat: 'ทุกจุดที่อยู่ต่ำกว่าหรือเท่ากับระดับนี้จะพิมพ์ด้วยสีน้ำ รวมกับทะเลสาบและแม่น้ำที่ OpenStreetMap รู้จัก แหล่งน้ำแต่ละแห่งจะถูกปรับให้อยู่ที่ความสูงมัธยฐานของตัวเอง และพื้นที่น้ำท่วมจะปรับไปที่ระดับข้างต้น ผิวน้ำจึงพิมพ์เป็นระนาบราบจริงพร้อมขอบชายฝั่งคมชัด',
    bandWater: 'น้ำ',
    fmtWaterUpTo: '≤ {hi} ม.',
    fmtWaterLakes: 'แหล่งน้ำ · ≤ {hi} ม.',
    bandLowest: 'แถบ {n} · ต่ำสุด',
    bandMid: 'แถบ {n}',
    bandPeak: 'แถบ {n} · ยอด',
    unitM: 'ม.',
    btnBandReset: 'คืนค่าแบ่งเท่ากัน',
    lblWaterAuto: 'ใช้ 4 แถบเมื่อไม่มีน้ำ',
    noteBandsReset: 'ช่วงระดับความสูงเปลี่ยนไป จึงคืนค่าขอบเขตแถบเป็นการแบ่งเท่ากันแล้ว',
    hintBands: 'ภูมิประเทศถูกแบ่งเป็นแถบระดับความสูง {n} แถบ — พิมพ์ตัวเลขเพื่อย้ายขอบเขต แต่ละแถบส่งออกเป็นชิ้นทึบของตัวเองพร้อมกำหนดวัสดุ Bambu Studio จึงจับคู่กับช่องฟิลาเมนต์ AMS ได้ {total} ช่อง',

    g5Title: '5 · ถาดกรอบ',
    tabNoFrame: 'ไม่มีกรอบ',
    tabWithFrame: 'มีกรอบ',
    lblFrameShape: 'รูปทรงกรอบ (ชิ้นงาน + ถาด)',
    optCircle: 'วงกลม',
    optSquare: 'สี่เหลี่ยมจัตุรัส',
    optHex: 'หกเหลี่ยม',
    optRect: 'สี่เหลี่ยมผืนผ้า',
    lblPlateMargin: 'ระยะขอบถาด',
    lblRimHeight: 'ความสูงขอบ (เหนือฐานจิ๊กซอว์)',
    lblPlateColor: 'สีถาด',
    lblTextColor: 'สีตัวอักษร',
    lblPlateText: 'ข้อความบนถาด (ไทย / อังกฤษ)',
    framePlaceholder: 'เช่น ภูเขาไฟฟูจิ · Mount Fuji',
    lblTextSize: 'ขนาดตัวอักษร',
    lblTextPos: 'ตำแหน่งตัวอักษร',
    hintFrame: 'ตัดจิ๊กซอว์ตามรูปทรงกรอบ และเพิ่มถาดโชว์ที่เข้าคู่กัน (พิมพ์เป็นชิ้นแยก) ข้อความจะฝังเสมอผิวบนขอบล่างของถาด',
    lblPrintShape: 'รูปทรงชิ้นงาน',
    hintPrintShape: 'เฉพาะจิ๊กซอว์ ตัดตามรูปทรงนี้ — ไม่มีถาดโชว์',

    btnGenerate: 'สร้างภูมิประเทศ',
    gModel: 'โมเดล',
    statElev: 'ช่วงระดับความสูง',
    statPiece: 'ขนาดชิ้น',
    statTris: 'จำนวนสามเหลี่ยม',
    legendLow: 'ต่ำ',
    legendHigh: 'สูง',
    btnExportBambu: '⬇ ส่งออก Bambu 3MF — ภูมิประเทศ + เส้นทาง',
    btnExportZip: '⬇ ส่งออกชิ้นส่วนจิ๊กซอว์ (.zip ของ STL)',
    btnExportOne: '⬇ ส่งออก STL รวมชิ้นเดียว',
    btnExportBambuMulti: '⬇ ส่งออกไฟล์ Bambu แยกภูมิภาค (.zip)',
    btnExportZipMulti: '⬇ ส่งออกชิ้นจิ๊กซอว์แยกภูมิภาค (.zip)',
    btnExportOneMulti: '⬇ ส่งออก STL รวมหนึ่งไฟล์ต่อภูมิภาค (.zip)',
    btnExportFrame: '⬇ ส่งออกถาดกรอบ (STL)',
    btnExportRouteFlat: '⬇ ส่งออกเส้นทางแบน (STL)',
    btnExportRouteFlatMulti: '⬇ ส่งออกเส้นทางแบนหนึ่งไฟล์ต่อภูมิภาค (.zip)',
    hintCredits: 'ระดับความสูง: AWS Terrarium terrain tiles · แผนที่ฐาน: OpenStreetMap · ค้นหาสถานที่: Nominatim ทั้งหมดใช้ฟรี ไม่ต้องใช้ API key',
    paneMap: 'เลือกตำแหน่ง',
    pane3d: 'ตัวอย่าง 3 มิติ · ลากเพื่อหมุน',
    splitHint: 'ลากเพื่อปรับขนาด · ดับเบิลคลิกเพื่อคืนค่าเดิม',
    overlayWorking: 'กำลังทำงาน…',
    layerTopo: 'แผนที่ภูมิประเทศ',
    layerStreets: 'แผนที่ถนน',

    gateTitle: 'อีกนิดเดียว!',
    gatePitch: 'ไฟล์ STL แจกฟรี — กรอกชื่อและอีเมล แล้วดาวน์โหลดจะเริ่มทันที',
    gateName: 'ชื่อ',
    gateNamePlaceholder: 'ชื่อของคุณ',
    gateEmail: 'อีเมล',
    gateEmailPlaceholder: 'you@example.com',
    gateGo: 'ดาวน์โหลด',
    gateCancel: 'ยกเลิก',
    gateHint: 'เราใช้ข้อมูลนี้เพื่อส่งข่าวอัปเดตของเนินเท่านั้น ไม่มีสแปมแน่นอน',
    gateBmc: '☕ เลี้ยงกาแฟผู้พัฒนา',
    gateAd: 'ผู้สนับสนุนของเรา ↗',
    gateErrName: 'กรุณากรอกชื่อของคุณ',
    gateErrEmail: 'กรุณากรอกอีเมลให้ถูกต้อง',

    stBoot: 'เลือกสถานที่ แล้วกด “สร้างภูมิประเทศ” ค่าเริ่มต้น: ภูเขาไฟฟูจิ',
    stSearching: 'กำลังค้นหา…',
    stFound: 'พบ: {place}',
    stRegionPick: 'คลิกหลายภูมิภาคหรือจังหวัดบนแผนที่ แล้วกดเสร็จ',
    stRegionLoading: 'กำลังโหลดแนวเขตการปกครอง…',
    stRegionSelected: 'เพิ่มแล้ว: {place} · เลือกแล้ว {n} แห่ง',
    stRegionDuplicate: 'เลือก {place} ไว้แล้ว',
    stRegionRemoved: 'ลบแล้ว: {place} · เหลือ {n} แห่ง',
    stRegionCleared: 'ล้างขอบเขตภูมิภาคทั้งหมดแล้ว',
    stGpxLoaded: 'โหลด GPX แล้ว: {count} จุด พื้นที่ {x} × {y} กม.',
    stGpxRemoved: 'ลบเส้นทาง GPX แล้ว',
    stBadCoords: 'กรอกพิกัดในรูปแบบ “lat, lon” เช่น 35.3606, 138.7274',
    stRoutePoint: 'เพิ่มจุดที่ {n} ของเส้นทางที่ {lat}, {lon}',
    stGpsFix: 'กำลังหาสัญญาณ GPS…',
    stGpsAdded: 'เพิ่มจุด GPS ที่ {n} แล้ว (±{acc} ม.)',
    stGpsFailed: 'GPS ล้มเหลว: {why}{note}',
    stAreaFit: 'ปรับพื้นที่ให้พอดีกับเส้นทาง: {x} × {y} กม.',
    stRouteDeleted: 'ลบเส้นทางแล้ว',
    stWaterNeedsGenerate: 'โมเดลนี้สร้างขึ้นโดยไม่มีข้อมูลน้ำ จึงยังไม่มีอะไรให้แสดง กด “สร้างภูมิประเทศ” เพื่อดึงข้อมูล',
    stRouteOutside: 'เส้นทางอยู่นอกพื้นที่จิ๊กซอว์ จึงไม่ถูกเพิ่มลงในชิ้นงาน กด “พอดีพื้นที่” หรือเลื่อนกรอบให้ครอบเส้นทาง',
    stFlatRouteEmpty: 'ไม่มีเส้นทางแบนให้ส่งออก เนื่องจากเส้นทางอยู่นอกพื้นที่ที่พิมพ์ กด “พอดีพื้นที่” หรือเลื่อนกรอบให้ครอบเส้นทาง',
    stFlatRouteNoModel: 'กรุณาสร้างภูมิประเทศก่อน เส้นทางแบนใช้ขนาดและขอบเขตจากโมเดล',
    errFlatRoute: 'สร้างเส้นทางแบนไม่สำเร็จ ({msg}) ดูรายละเอียดได้ในคอนโซลของเบราว์เซอร์',
    errFlatRouteStale: 'หน้านี้กำลังใช้ไฟล์เวอร์ชันเก่าที่แคชไว้ กด Ctrl+Shift+R (หรือ Cmd+Shift+R บน Mac) เพื่อโหลดใหม่แล้วลองอีกครั้ง',
    stRouteTooThin: 'เส้นทางกว้าง {asked} มม. ละเอียดเกินกว่าที่กริดนี้รองรับ จึงขยายเป็น {used} มม. เพิ่มค่าความละเอียดหากต้องการเส้นทางที่บางลง',
    stDownloaded: 'ดาวน์โหลด {file} แล้ว',
    stZipping: 'กำลังบีบอัดไฟล์ STL…',
    stBambuDone: 'ดาวน์โหลด .3mf แล้ว — Bambu Studio จะโหลดแต่ละแถบสีเป็นฟิลาเมนต์ AMS แยกช่อง',
    stBambuDoneRoute: 'ดาวน์โหลด {file} แล้ว — ภายในมีภูมิประเทศ 4 สี และเส้นทางสีแดงแยกชิ้น',
    stDone: 'เสร็จแล้ว · ซูม {zoom} · {n} ชิ้น',
    stDoneMulti: 'เสร็จแล้ว · {regions} ภูมิภาค · {n} ชิ้น',

    pgPreparing: 'กำลังเตรียม…',
    pgRegion: 'กำลังสร้างภูมิภาค {done}/{total}: {place}',
    pgTiles: 'กำลังดึงไทล์ภูมิประเทศ {done}/{total}…',
    pgWater: 'กำลังดึงข้อมูลแหล่งน้ำ (OSM)…',
    pgPieces: 'กำลังตัดชิ้นจิ๊กซอว์…',
    pgRoute: 'กำลังปั๊มเส้นทาง…',
    pgRouteThrough: 'กำลังเจาะเส้นทางทะลุ…',
    pgBambu: 'กำลังสร้างไฟล์ 3MF {n} สี…',

    errSearchFailed: 'ค้นหาไม่สำเร็จ',
    errNoResults: 'ไม่พบผลลัพธ์สำหรับ “{query}”',
    errNoRegionBoundary: 'ไม่พบขอบเขตภูมิภาคหรือจังหวัดที่นี่ ลองพิมพ์ชื่อเต็มในช่องค้นหา',
    errRegionChanged: 'การเลือกภูมิภาคเปลี่ยนระหว่างสร้าง กรุณากดสร้างอีกครั้ง',
    errBadGpx: 'ไฟล์ GPX ไม่ถูกต้อง',
    errNoGpxPoints: 'ไม่พบจุดเส้นทางในไฟล์ GPX',
    errCors: 'ไทล์ระดับความสูงถูกบล็อกโดย CORS ลองเปลี่ยนเครือข่ายหรือใช้ CORS proxy',
    errNoGeolocation: 'เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง',
    err3mf: 'ส่งออก 3MF ไม่สำเร็จ',
    errGenerate: 'สร้างภูมิประเทศไม่สำเร็จ',
    gpsDenied: 'ถูกปฏิเสธสิทธิ์',
    gpsUnavailable: 'ไม่พบตำแหน่ง',
    gpsTimeout: 'หมดเวลา',
    gpsHttpsNote: ' — เบราว์เซอร์อนุญาตให้ใช้ GPS ผ่าน HTTPS (หรือ localhost) เท่านั้น',

    fmtRange: '{lo}–{hi} ม.',
    fmtMeters: '{n} ม.',
    fmtPieceSize: '{w}×{h} มม.',
    fmtMultiModels: '{regions} โมเดล · {pieces} ชิ้น',

    /* Thai has no word spaces, so these get their own line breaks rather than
       reusing the English wrapping. */
    readmeHead:
      'ไฟล์ส่งออกจากเนิน\nชิ้นส่วน: {nx} x {ny}\nขนาดโมเดล: {w} x {d} มม.\n' +
      'พิมพ์ทุกชิ้นแล้วนำมาต่อกันเป็นจิ๊กซอว์ เดือยล็อกเข้ากันพอดีตามที่ออกแบบไว้\n',
    readmeThrough:
      'ไฟล์ route_red_*.stl เป็นชิ้นเส้นทางที่ทะลุตลอดความหนาของชิ้นงาน\n' +
      'พิมพ์ด้วยสีแดง (หรือสีที่ตัดกัน) แล้วกดลงในร่อง มีระยะเผื่อข้างละ {clear} มม.\n',
    readmeThroughPocket:
      'ไฟล์ route_red_*.stl เป็นชิ้นที่เสียบลงในร่องซึ่งหยุดสูงจากก้นชิ้นงาน {floor} มม.\n' +
      'ฐานใต้เส้นทางจึงยังตันอยู่ ชิ้นเหล่านี้มีก้นแบน พิมพ์ด้วยสีแดง (หรือสีที่ตัดกัน)\n' +
      'โดยปิดซัพพอร์ต มีระยะเผื่อข้างละ {clear} มม.\n',
    readmeContinuous:
      'ไฟล์ route_red_continuous.stl พาดยาวข้ามทุกชิ้น จึงควรใส่หลังจากต่อจิ๊กซอว์\n' +
      'ครบทุกชิ้นแล้วเท่านั้น\n',
    readmeInlay:
      'ไฟล์ route_red_*.stl เป็นแถบฝังตื้น พิมพ์ด้วยสีแดงแล้วกดลงในร่อง\n',
    readmeInlayFlat:
      'ไฟล์ route_red_*.stl เป็นแถบฝังตื้นที่มีใต้ท้องแบน พิมพ์ด้วยสีแดงโดยปิดซัพพอร์ต\n' +
      'วางด้านแบนลง แล้วกดลงในร่อง\n',
  };

  Object.assign(en, {
    lblAreaX: 'Width X (km)', lblAreaY: 'Height Y (km)',
    fmtAreaSize: '{x} × {y} km', fmtGrid: '{x} × {y}',
    lblTerrainSource: 'Terrain source',
    optTerrainFree: 'Free — AWS Terrarium', optTerrainMaptiler: 'MapTiler — API key required',
    lblTerrainKey: 'Your MapTiler API key', linkTerrainKey: 'Get a MapTiler key',
    hintTerrainKey: 'Kept only in this tab. Manage usage and charges with MapTiler. Detail varies by location: 30 m globally, 5 m in selected areas.',
    lblDetailPreset: 'Terrain detail', detailStandard: 'Standard — 200', detailHigh: 'High — 400', detailUltra: 'Ultra — 800', detailCustom: 'Custom',
    hintTerrainDetail: 'Detail sets the grid on the longer side; the shorter side scales to match so terrain cells stay square. Tile spacing is separate from source accuracy; increasing the grid cannot create missing survey detail. Ultra uses more time and memory.',
    lblIncludeBuildings: 'Include buildings', lblBuildingScale: 'Building height scale',
    hintBuildings: 'Flat-roof buildings appear in the preview and exports. Missing heights use floor counts or a 9 m estimate. Select a neighborhood for visible city detail.',
    statTileSpacing: 'Tile spacing', statMeshSpacing: 'Mesh spacing', statBuildings: 'Buildings',
    fmtSpacing: '{n} m', fmtBuildingCount: '{n} ({estimated} estimated)',
    noteTileBudget: 'The tile budget reduced terrain detail for this selection.',
    noteBuildingArea: 'Select a smaller area for buildings (maximum 100 km²).',
    noteBuildingLimit: 'More than 10,000 building features: select a smaller area for buildings.',
    noteBuildingEmpty: 'No mapped buildings were found in this area.',
    noteBuildingFailed: 'Building lookup failed. Terrain is available; Generate again to retry buildings.',
    noteBuildingOff: 'Buildings are turned off.',
    noteBuildingInvalid: '{n} invalid building geometries were skipped.',
    noteWaterFailed: 'Water lookup failed. Generate again to retry mapped water.',
    pgBuildings: 'Looking up buildings…', pgCity: 'Building city geometry {done}/{total}…',
    pgCityExport: 'Preparing printable city pieces {done}/{total}…',
    btnCancelGeneration: 'Cancel', stCancelled: 'Cancelled. The previous model is unchanged.',
    errTerrainKey: 'Enter your MapTiler API key, or select free AWS terrain.',
    errTerrainAuth: 'MapTiler rejected this key. Check the key and its allowed website origins, or select free AWS terrain.',
    errTerrainQuota: 'The terrain provider is rate limiting requests. Check your quota and retry later.',
    errTerrainTile: 'Required elevation data could not be loaded. Check your connection or choose another area and retry.',
    errTerrainMetadata: 'The terrain provider returned unsupported tile metadata. Please retry later.',
    errTerrainProvider: 'Select a supported terrain provider.',
    errTerrainBounds: 'Select an area within latitude ±85° that does not cross the date line.',
    errCityGeometry: 'This city geometry could not form a printable solid. Try a smaller area or turn buildings off.',
    errGeometryWorker: 'The geometry worker could not complete. Try a lower detail setting and generate again.',
    hintCredits: 'Free elevation: AWS Terrarium. Optional elevation: MapTiler (your API key). Buildings and basemap: © OpenStreetMap contributors (ODbL). Geocoding: Nominatim.',
    readmeSources: 'Terrain: {source}\nTile spacing: {tile} m; mesh spacing: {mesh} m. These are sample spacings, not survey accuracy.\nBuildings: {count}; estimated heights: {estimated}. Estimates use 3 m per floor or 9 m when height is missing.\nBuilding heights use their own scale, independent of terrain exaggeration.\nBuildings: © OpenStreetMap contributors, ODbL — https://www.openstreetmap.org/copyright\n',
  });
  Object.assign(th, {
    lblAreaX: 'ความกว้าง X (กม.)', lblAreaY: 'ความสูง Y (กม.)',
    fmtAreaSize: '{x} × {y} กม.', fmtGrid: '{x} × {y}',
    lblTerrainSource: 'แหล่งข้อมูลภูมิประเทศ',
    optTerrainFree: 'ฟรี — AWS Terrarium', optTerrainMaptiler: 'MapTiler — ต้องใช้ API key',
    lblTerrainKey: 'API key ของ MapTiler', linkTerrainKey: 'รับ API key จาก MapTiler',
    hintTerrainKey: 'เก็บไว้เฉพาะในแท็บนี้ จัดการการใช้งานและค่าใช้จ่ายกับ MapTiler ความละเอียดขึ้นอยู่กับพื้นที่: 30 ม. ทั่วโลก และ 5 ม. ในบางพื้นที่',
    lblDetailPreset: 'ความละเอียดภูมิประเทศ', detailStandard: 'มาตรฐาน — 200', detailHigh: 'สูง — 400', detailUltra: 'สูงมาก — 800', detailCustom: 'กำหนดเอง',
    hintTerrainDetail: 'ความละเอียดกำหนดกริดของด้านที่ยาวกว่า ส่วนด้านที่สั้นกว่าจะปรับตามสัดส่วนเพื่อให้ช่องภูมิประเทศเป็นสี่เหลี่ยมจัตุรัส ระยะห่างไทล์ไม่ใช่ความแม่นยำของการสำรวจ และกริดที่ละเอียดขึ้นไม่สามารถสร้างข้อมูลที่ขาดหายได้ ระดับสูงมากใช้เวลาและหน่วยความจำเพิ่มขึ้น',
    lblIncludeBuildings: 'รวมอาคาร', lblBuildingScale: 'ตัวคูณความสูงอาคาร',
    hintBuildings: 'อาคารหลังคาแบนจะแสดงในตัวอย่างและไฟล์ส่งออก หากไม่มีความสูงจะใช้จำนวนชั้นหรือค่าประมาณ 9 ม. เลือกพื้นที่ระดับย่านเพื่อเห็นรายละเอียดเมือง',
    statTileSpacing: 'ระยะห่างข้อมูลไทล์', statMeshSpacing: 'ระยะห่างกริดโมเดล', statBuildings: 'อาคาร',
    fmtSpacing: '{n} ม.', fmtBuildingCount: '{n} (ประมาณความสูง {estimated})',
    noteTileBudget: 'จำกัดจำนวนไทล์ จึงลดความละเอียดภูมิประเทศสำหรับพื้นที่นี้',
    noteBuildingArea: 'เลือกพื้นที่เล็กลงเพื่อแสดงอาคาร (ไม่เกิน 100 ตร.กม.)',
    noteBuildingLimit: 'มีข้อมูลอาคารมากกว่า 10,000 รายการ โปรดเลือกพื้นที่เล็กลง',
    noteBuildingEmpty: 'ไม่พบอาคารที่บันทึกไว้ในพื้นที่นี้',
    noteBuildingFailed: 'โหลดข้อมูลอาคารไม่สำเร็จ แสดงภูมิประเทศได้ กดสร้างอีกครั้งเพื่อลองโหลดอาคารใหม่',
    noteBuildingOff: 'ปิดการแสดงอาคารอยู่',
    noteBuildingInvalid: 'ข้ามรูปทรงอาคารที่ไม่ถูกต้อง {n} รายการ',
    noteWaterFailed: 'โหลดข้อมูลแหล่งน้ำไม่สำเร็จ กดสร้างอีกครั้งเพื่อลองใหม่',
    pgBuildings: 'กำลังค้นหาอาคาร…', pgCity: 'กำลังสร้างอาคาร {done}/{total}…',
    pgCityExport: 'กำลังเตรียมชิ้นงานเมืองสำหรับพิมพ์ {done}/{total}…',
    btnCancelGeneration: 'ยกเลิก', stCancelled: 'ยกเลิกแล้ว โมเดลก่อนหน้ายังคงเดิม',
    errTerrainKey: 'กรอก API key ของ MapTiler หรือเลือกภูมิประเทศฟรีจาก AWS',
    errTerrainAuth: 'MapTiler ปฏิเสธคีย์นี้ ตรวจสอบคีย์และเว็บไซต์ที่อนุญาต หรือเลือกภูมิประเทศฟรีจาก AWS',
    errTerrainQuota: 'ผู้ให้บริการจำกัดจำนวนคำขอ ตรวจสอบโควตาแล้วลองใหม่ภายหลัง',
    errTerrainTile: 'โหลดข้อมูลระดับความสูงที่จำเป็นไม่สำเร็จ ตรวจสอบการเชื่อมต่อหรือเลือกพื้นที่อื่นแล้วลองใหม่',
    errTerrainMetadata: 'รูปแบบข้อมูลไทล์จากผู้ให้บริการไม่รองรับ โปรดลองใหม่ภายหลัง',
    errTerrainProvider: 'เลือกแหล่งข้อมูลภูมิประเทศที่รองรับ',
    errTerrainBounds: 'เลือกพื้นที่ระหว่างละติจูด ±85° และไม่ข้ามเส้นแบ่งวันสากล',
    errCityGeometry: 'ไม่สามารถสร้างรูปทรงเมืองที่พิมพ์ได้ ลองเลือกพื้นที่เล็กลงหรือปิดอาคาร',
    errGeometryWorker: 'สร้างรูปทรงไม่สำเร็จ ลองลดความละเอียดแล้วสร้างอีกครั้ง',
    hintCredits: 'ระดับความสูงฟรี: AWS Terrarium ตัวเลือกเพิ่มเติม: MapTiler (ใช้ API key ของคุณ) อาคารและแผนที่: © ผู้ร่วมสร้าง OpenStreetMap (ODbL) ค้นหาสถานที่: Nominatim',
    readmeSources: 'ภูมิประเทศ: {source}\nระยะห่างข้อมูลไทล์: {tile} ม.; กริดโมเดล: {mesh} ม. เป็นระยะห่างจุดข้อมูล ไม่ใช่ความแม่นยำการสำรวจ\nอาคาร: {count}; ประมาณความสูง: {estimated} ใช้ 3 ม. ต่อชั้น หรือ 9 ม. เมื่อไม่มีข้อมูล\nตัวคูณความสูงอาคารแยกจากตัวคูณภูมิประเทศ\nอาคาร: © ผู้ร่วมสร้าง OpenStreetMap, ODbL — https://www.openstreetmap.org/copyright\n',
  });

  const I18N = { en, th };
  let lang = 'en';

  /* Look up a key in the active language, falling back to English, then to the
     key itself so a missing entry is visible rather than blank. */
  function t(key, params) {
    let s = I18N[lang][key];
    if (s === undefined) s = en[key];
    if (s === undefined) return key;
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m));
    return s;
  }

  /* Fill in every tagged element. Elements carrying data-i18n must contain
     text only — the slider labels wrap their text in a span for exactly this
     reason, so their live value span survives. */
  function applyI18n(root) {
    const r = root || document;
    r.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    r.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    r.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
  }

  window.I18N = I18N;
  window.t = t;
  window.applyI18n = applyI18n;
  window.tpLang = () => lang;
  window.tpSetLangCode = code => { lang = I18N[code] ? code : 'en'; };
  /* BCP-47 tag for Intl / toLocaleString. */
  window.tpLocale = () => (lang === 'th' ? 'th-TH' : 'en-US');
})();
