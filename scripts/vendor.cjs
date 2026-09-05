const fs = require('node:fs');
const path = require('node:path');
const src = path.join(__dirname, '../node_modules/manifold-3d');
const dst = path.join(__dirname, '../vendor/manifold-3d');
fs.mkdirSync(dst, { recursive: true });
for (const file of ['manifold.js', 'manifold.wasm', 'LICENSE']) fs.copyFileSync(path.join(src, file), path.join(dst, file));
fs.writeFileSync(path.join(dst, 'VERSION'), '3.5.1\n');
fs.writeFileSync(path.join(dst, 'package.json'), JSON.stringify({ type: 'module', private: true }) + '\n');
