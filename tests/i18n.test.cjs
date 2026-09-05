const { test } = require('node:test');
const assert = require('node:assert/strict');

/* i18n.js is a browser IIFE that publishes onto `window`. */
global.window = global;
require('../i18n.js');
const { en, th } = window.I18N;

const placeholders = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

test('both languages define exactly the same keys', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(th).sort());
});
test('translations keep the same placeholders as their English source', () => {
  // A key reworded in one language only still renders, printing a literal "{x}"
  // instead of a value, so nothing else would catch it.
  for (const key of Object.keys(en)) {
    assert.deepEqual(placeholders(th[key]), placeholders(en[key]), `placeholders differ for ${key}`);
  }
});
