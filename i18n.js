/* TopoPuzzle interface translations.
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
    /* ---- document + brand ---- */
    pageTitle: 'TopoPuzzle — 3D-Printable Topographic Puzzles of Anywhere on Earth',
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
    optEmboss: 'Raised ridge (~1 mm)',
    optEngrave: 'Engraved groove (~0.8 mm)',
    optOff: 'Off',
    lblRouteTop: 'Route top',
    optFlush: 'Flush with terrain',
    optRaised: 'Raised 0.6 mm',
    lblRoutePieces: 'Route pieces',
    optSplitPiece: 'Split per puzzle piece',
    optContinuous: 'One continuous route',
    hintThroughRoute: 'The 3.2 mm route reaches the print bottom. Its channel is 3.6 mm wide, leaving 0.2 mm clearance on each side for assembly.',
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
    btnExportBambu: '⬇ Export Bambu 3MF — terrain + route (2 files)',
    btnExportZip: '⬇ Export puzzle pieces (.zip of STL)',
    btnExportOne: '⬇ Export single combined STL',
    btnExportBambuMulti: '⬇ Export regional Bambu files (.zip)',
    btnExportZipMulti: '⬇ Export regional puzzle pieces (.zip)',
    btnExportOneMulti: '⬇ Export one combined STL per region (.zip)',
    btnExportFrame: '⬇ Export frame plate (STL)',
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
    gateHint: 'We only use this to share TopoPuzzle updates. No spam, ever.',
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
    stRouteOutside: 'The route lies outside the puzzle area, so it was not added to the print. Use Fit area, or move the box over the track.',
    stDownloaded: 'Downloaded {file}',
    stZipping: 'Zipping STL pieces…',
    stBambuDone: 'Downloaded .3mf — Bambu Studio will load each color band as a separate AMS filament',
    stBambuDoneRoute: 'Downloaded 2 files — the 4-color terrain, and the route as its own red part',
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
      'TopoPuzzle export\nPieces: {nx} x {ny}\nModel size: {w} x {d} mm\n' +
      'Print all pieces, then assemble the jigsaw. Tabs interlock by design.\n',
    readmeThrough:
      'The route_red_*.stl parts run the full depth of the print. Print them in red\n' +
      '(or any contrast colour) and press them into the channels; each side has\n' +
      '0.2 mm of clearance.\n',
    readmeContinuous:
      'route_red_continuous.stl spans every piece, so seat it only once the puzzle\n' +
      'is fully assembled.\n',
    readmeInlay:
      'The route_red_*.stl parts are shallow inlays. Print them in red and press\n' +
      'them into the grooves.\n',
  };

  /* Thai. Terminology choices worth knowing:
       route      -> เส้นทาง          piece   -> ชิ้น / ชิ้นส่วน
       band       -> แถบ              inlay   -> แถบฝัง
       frame plate-> ถาดกรอบ          terrain -> ภูมิประเทศ
     Units are written in Thai abbreviations (มม. = mm, กม. = km). */
  const th = {
    pageTitle: 'TopoPuzzle — จิ๊กซอว์ภูมิประเทศ 3 มิติ พิมพ์ได้จากทุกที่บนโลก',
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
    optEmboss: 'สันนูน (~1 มม.)',
    optEngrave: 'ร่องเซาะ (~0.8 มม.)',
    optOff: 'ปิด',
    lblRouteTop: 'ผิวบนของเส้นทาง',
    optFlush: 'เสมอผิวภูมิประเทศ',
    optRaised: 'นูนขึ้น 0.6 มม.',
    lblRoutePieces: 'การแบ่งเส้นทาง',
    optSplitPiece: 'แยกตามชิ้นจิ๊กซอว์',
    optContinuous: 'เส้นทางต่อเนื่องชิ้นเดียว',
    hintThroughRoute: 'เส้นทางกว้าง 3.2 มม. ทะลุถึงก้นชิ้นงาน ร่องรับกว้าง 3.6 มม. เหลือระยะเผื่อข้างละ 0.2 มม. สำหรับการประกอบ',
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
    btnExportBambu: '⬇ ส่งออก Bambu 3MF — ภูมิประเทศ + เส้นทาง (2 ไฟล์)',
    btnExportZip: '⬇ ส่งออกชิ้นส่วนจิ๊กซอว์ (.zip ของ STL)',
    btnExportOne: '⬇ ส่งออก STL รวมชิ้นเดียว',
    btnExportBambuMulti: '⬇ ส่งออกไฟล์ Bambu แยกภูมิภาค (.zip)',
    btnExportZipMulti: '⬇ ส่งออกชิ้นจิ๊กซอว์แยกภูมิภาค (.zip)',
    btnExportOneMulti: '⬇ ส่งออก STL รวมหนึ่งไฟล์ต่อภูมิภาค (.zip)',
    btnExportFrame: '⬇ ส่งออกถาดกรอบ (STL)',
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
    gateHint: 'เราใช้ข้อมูลนี้เพื่อส่งข่าวอัปเดตของ TopoPuzzle เท่านั้น ไม่มีสแปมแน่นอน',
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
    stRouteOutside: 'เส้นทางอยู่นอกพื้นที่จิ๊กซอว์ จึงไม่ถูกเพิ่มลงในชิ้นงาน กด “พอดีพื้นที่” หรือเลื่อนกรอบให้ครอบเส้นทาง',
    stDownloaded: 'ดาวน์โหลด {file} แล้ว',
    stZipping: 'กำลังบีบอัดไฟล์ STL…',
    stBambuDone: 'ดาวน์โหลด .3mf แล้ว — Bambu Studio จะโหลดแต่ละแถบสีเป็นฟิลาเมนต์ AMS แยกช่อง',
    stBambuDoneRoute: 'ดาวน์โหลด 2 ไฟล์แล้ว — ภูมิประเทศ 4 สี และเส้นทางสีแดงแยกชิ้น',
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
      'TopoPuzzle export\nชิ้นส่วน: {nx} x {ny}\nขนาดโมเดล: {w} x {d} มม.\n' +
      'พิมพ์ทุกชิ้นแล้วนำมาต่อกันเป็นจิ๊กซอว์ เดือยล็อกเข้ากันพอดีตามที่ออกแบบไว้\n',
    readmeThrough:
      'ไฟล์ route_red_*.stl เป็นชิ้นเส้นทางที่ทะลุตลอดความหนาของชิ้นงาน\n' +
      'พิมพ์ด้วยสีแดง (หรือสีที่ตัดกัน) แล้วกดลงในร่อง มีระยะเผื่อข้างละ 0.2 มม.\n',
    readmeContinuous:
      'ไฟล์ route_red_continuous.stl พาดยาวข้ามทุกชิ้น จึงควรใส่หลังจากต่อจิ๊กซอว์\n' +
      'ครบทุกชิ้นแล้วเท่านั้น\n',
    readmeInlay:
      'ไฟล์ route_red_*.stl เป็นแถบฝังตื้น พิมพ์ด้วยสีแดงแล้วกดลงในร่อง\n',
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
