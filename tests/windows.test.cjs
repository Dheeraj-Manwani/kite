const { test } = require('node:test');
const assert = require('node:assert/strict');
const { restoredSize, supportsMica, MIN_SIZE, DEFAULT_SIZE } = require('../src/main/window/size.ts');

test('the Settings window reopens at its last size, within the screen and above the minimum (UX-57)', () => {
  const screen = { width: 1920, height: 1040 };
  assert.deepEqual(restoredSize(undefined, screen), { ...DEFAULT_SIZE, maximized: false });
  assert.deepEqual(restoredSize({ width: 1000.4, height: 700, maximized: true }, screen), { width: 1000, height: 700, maximized: true });
  assert.deepEqual(restoredSize({ width: 300, height: 200 }, screen), { ...MIN_SIZE, maximized: false }, 'never below the minimum');
  assert.deepEqual(restoredSize({ width: 4000, height: 3000 }, screen), { width: 1920, height: 1040, maximized: false }, 'never larger than the screen');
  assert.deepEqual(restoredSize(undefined, { width: 1366, height: 728 }), { width: 820, height: 728, maximized: false }, 'the default fits a small laptop');
  assert.deepEqual(restoredSize({ width: 'wide', height: NaN }, screen), { ...DEFAULT_SIZE, maximized: false }, 'garbage falls back to the default');
});

test('Mica only on Windows 11 22H2 and later', () => {
  assert.equal(supportsMica('win32', '10.0.26200'), true);
  assert.equal(supportsMica('win32', '10.0.22621'), true);
  assert.equal(supportsMica('win32', '10.0.22000'), false, 'Windows 11 21H2');
  assert.equal(supportsMica('win32', '10.0.19045'), false, 'Windows 10');
  assert.equal(supportsMica('darwin', '23.0.0'), false);
});
