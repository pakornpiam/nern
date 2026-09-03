/* Generates GPX fixtures for the route-import tests.
 * Run: node fixtures/make-fixtures.js
 *
 * Shapes chosen to cover what real exporters actually emit — in particular the
 * GPX schema's fixed `wpt* , rte* , trk*` element order, which is what makes a
 * flat querySelectorAll('trkpt, rtept, wpt') return points out of order.
 */
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const LAT = 35.3606, LON = 138.7274;          // Mt Fuji, matches the app default

// a plausible recorded track: a loop climbing the south face
const track = (n, spanKm = 6) => {
  const dLat = (spanKm / 2) / 111.32;
  const dLon = (spanKm / 2) / (111.32 * Math.cos(LAT * Math.PI / 180));
  return Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2;
    return [
      +(LAT + dLat * Math.sin(a) * 0.8).toFixed(7),
      +(LON + dLon * Math.cos(a)).toFixed(7),
      +(700 + 900 * Math.sin(a * 0.5)).toFixed(1),
    ];
  });
};

const iso = k => new Date(Date.UTC(2024, 4, 12, 6, 0, k)).toISOString().replace('.000', '');

const trkpt = (p, k, ext) =>
  `      <trkpt lat="${p[0]}" lon="${p[1]}">\n` +
  `        <ele>${p[2]}</ele>\n        <time>${iso(k)}</time>\n` +
  (ext ? `        <extensions><ns3:TrackPointExtension><ns3:hr>${120 + (k % 40)}</ns3:hr>` +
         `<ns3:cad>${70 + (k % 20)}</ns3:cad></ns3:TrackPointExtension></extensions>\n` : '') +
  `      </trkpt>`;

const GARMIN_HEAD =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<gpx creator="Garmin Connect" version="1.1"\n' +
  '  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/11.xsd"\n' +
  '  xmlns:ns3="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"\n' +
  '  xmlns="http://www.topografix.com/GPX/1/1"\n' +
  '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n' +
  '  xmlns:ns2="http://www.garmin.com/xmlschemas/GpxExtensions/v3">\n' +
  '  <metadata>\n    <link href="connect.garmin.com"><text>Garmin Connect</text></link>\n' +
  `    <time>${iso(0)}</time>\n  </metadata>\n`;

const files = {};

/* 1. Garmin Connect ACTIVITY — track only, dense, namespaced extensions. */
{
  const pts = track(3000);
  files['garmin-activity.gpx'] = GARMIN_HEAD +
    '  <trk>\n    <name>Fuji morning climb</name>\n    <type>hiking</type>\n    <trkseg>\n' +
    pts.map((p, k) => trkpt(p, k, true)).join('\n') +
    '\n    </trkseg>\n  </trk>\n</gpx>\n';
}

/* 2. Garmin COURSE — <rte> AND <trk> in the same file. Schema order puts every
      rtept before every trkpt, so a flat selector interleaves two shapes. */
{
  const pts = track(600);
  const cues = track(12, 6);
  files['garmin-course.gpx'] = GARMIN_HEAD +
    '  <rte>\n    <name>Fuji course</name>\n' +
    cues.map(p => `    <rtept lat="${p[0]}" lon="${p[1]}"><ele>${p[2]}</ele></rtept>`).join('\n') +
    '\n  </rte>\n  <trk>\n    <name>Fuji course track</name>\n    <trkseg>\n' +
    pts.map((p, k) => trkpt(p, k, false)).join('\n') +
    '\n    </trkseg>\n  </trk>\n</gpx>\n';
}

/* 3. WAYPOINTS FIRST — POIs spread far wider than the track. This is the shape
      that poisons getBounds() and can push the puzzle box off the track. */
{
  const pts = track(500, 4);
  const pois = [
    [35.90, 138.20, 'Trailhead parking'],
    [34.95, 139.30, 'Station'],
    [35.75, 139.60, 'Hotel'],
    [34.80, 138.10, 'Viewpoint'],
  ];
  files['waypoints-first.gpx'] =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="TestFixture" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    pois.map(p => `  <wpt lat="${p[0]}" lon="${p[1]}"><name>${p[2]}</name></wpt>`).join('\n') +
    '\n  <trk>\n    <name>Compact loop</name>\n    <trkseg>\n' +
    pts.map((p, k) => trkpt(p, k, false)).join('\n') +
    '\n    </trkseg>\n  </trk>\n</gpx>\n';
}

/* 4. MULTI-SEGMENT — a paused-and-resumed recording. */
{
  const pts = track(900);
  const seg = n => pts.slice(n * 300, (n + 1) * 300).map((p, k) => trkpt(p, k, false)).join('\n');
  files['multi-segment.gpx'] = GARMIN_HEAD +
    '  <trk>\n    <name>Paused ride</name>\n' +
    [0, 1, 2].map(n => `    <trkseg>\n${seg(n)}\n    </trkseg>`).join('\n') +
    '\n  </trk>\n</gpx>\n';
}

/* 5. PLAIN GPX 1.1 — what a planner like gpx.studio emits. */
{
  const pts = track(120, 5);
  files['plain-planner.gpx'] =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="gpx.studio" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    '  <trk>\n    <name>Planned route</name>\n    <trkseg>\n' +
    pts.map(p => `      <trkpt lat="${p[0]}" lon="${p[1]}"><ele>${p[2]}</ele></trkpt>`).join('\n') +
    '\n    </trkseg>\n  </trk>\n</gpx>\n';
}

/* 6. ROUTE ONLY — <rtept>, no track at all. */
{
  const pts = track(80, 5);
  files['route-only.gpx'] =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="TestFixture" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    '  <rte>\n    <name>Planned only</name>\n' +
    pts.map(p => `    <rtept lat="${p[0]}" lon="${p[1]}"><ele>${p[2]}</ele></rtept>`).join('\n') +
    '\n  </rte>\n</gpx>\n';
}

for (const [name, body] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, name), body, 'utf8');
  const pts = (body.match(/<(trkpt|rtept|wpt) /g) || []).length;
  console.log(`${name.padEnd(24)} ${(body.length / 1024).toFixed(0).padStart(5)} KB  ${pts} points`);
}
