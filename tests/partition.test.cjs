const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../geometry-core.js');

function components(piece, W, D, count) {
  const seen = new Uint8Array(piece.length), sizes = Array.from({ length: count }, () => []);
  for (let k = 0; k < piece.length; k++) {
    assert.ok(piece[k] >= 0 && piece[k] < count);
    if (seen[k]) continue;
    const id = piece[k], queue = [k]; seen[k] = 1;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const v = queue[cursor], x = v % W, y = Math.floor(v / W);
      for (const n of [x > 0 ? v - 1 : -1, x + 1 < W ? v + 1 : -1, y > 0 ? v - W : -1, y + 1 < D ? v + W : -1]) {
        if (n >= 0 && !seen[n] && piece[n] === id) { seen[n] = 1; queue.push(n); }
      }
    }
    sizes[id].push(queue.length);
  }
  return sizes;
}

test('every rectangular puzzle piece stays connected across grid sizes and piece counts', () => {
  // Include the reported low-detail separated view, minimum UI detail, fractional
  // cell counts, and stretched selections in both directions.
  for (const [W, D] of [[40, 40], [60, 60], [61, 67], [80, 80], [200, 200], [400, 60], [60, 400]]) {
    const max = W === 40 ? 4 : 8;
    for (let nx = 1; nx <= max; nx++) for (let ny = 1; ny <= max; ny++) {
      const piece = TopoGeometry.buildPartition(W, D, nx, ny), sizes = components(piece, W, D, nx * ny);
      for (let id = 0; id < sizes.length; id++) assert.equal(sizes[id].length, 1,
        `${W}x${D}, ${nx}x${ny} pieces: piece ${id} breaks into ${sizes[id]}`);
      assert.equal(sizes.flat().reduce((sum, n) => sum + n, 0), W * D);
    }
  }
});

test('each internal seam retains its tab instead of a later boundary overwriting it', () => {
  const W = 160, D = 120, nx = 4, ny = 3, cw = W / nx, ch = D / ny;
  const piece = TopoGeometry.buildPartition(W, D, nx, ny);
  for (let row = 0; row < ny; row++) for (let seam = 1; seam < nx; seam++) {
    const left = ((seam + row) & 1) === 0, dir = left ? 1 : -1;
    const x = Math.floor(seam * cw + dir * .2 * Math.min(cw, ch)), y = Math.floor((row + .5) * ch);
    assert.equal(piece[y * W + x], row * nx + (left ? seam - 1 : seam));
  }
  for (let col = 0; col < nx; col++) for (let seam = 1; seam < ny; seam++) {
    const top = ((seam + col) & 1) === 0, dir = top ? 1 : -1;
    const x = Math.floor((col + .5) * cw), y = Math.floor(seam * ch + dir * .2 * Math.min(cw, ch));
    assert.equal(piece[y * W + x], (top ? seam - 1 : seam) * nx + col);
  }
});
