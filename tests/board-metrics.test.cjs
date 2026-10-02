const { test } = require('node:test');
const assert = require('node:assert/strict');
const { layoutScene, panelSize, panelViewport } = require('../src/shared/board.ts');
const { sceneMetrics, lessonMetrics } = require('../src/shared/boardMetrics.ts');
const { demoLesson } = require('../src/main/board/service.ts');

const metrics = inputs => sceneMetrics(layoutScene(inputs));
const box = (id, x, y, extra = {}) => ({ id, type: 'rectangle', x, y, width: 160, height: 80, ...extra });

test('a tidy board scores clean', () => {
  const m = metrics([box('a', 100, 100, { label: 'Client' }), box('b', 600, 100, { label: 'Server' }), { id: 'ab', type: 'arrow', from: 'a', to: 'b', label: 'SYN' }]);
  assert.deepEqual([m.overlaps, m.overflow, m.through, m.crossings, m.textOnLines], [0, 0, 0, 0, 0]);
  assert.equal(m.elements, 3);
  assert.equal(m.colors, 1);
});

test('overlapping shapes count, nested shapes do not', () => {
  const m = metrics([box('a', 100, 100), box('b', 200, 140)]);
  assert.equal(m.overlaps, 1);
  assert.equal(m.overlapArea, 60 * 40);
  const nested = metrics([{ id: 'frame', type: 'rectangle', x: 0, y: 0, width: 800, height: 500 }, box('a', 100, 100), box('b', 400, 100)]);
  assert.equal(nested.overlaps, 0);
});

test('text on text and text across an outline collide; text fully inside a container does not', () => {
  const m = metrics([{ id: 't1', type: 'text', x: 100, y: 100, text: 'Hello there' }, { id: 't2', type: 'text', x: 120, y: 105, text: 'Overlapping words' }]);
  assert.equal(m.overlaps, 1);
  const across = metrics([box('a', 100, 100), { id: 'note', type: 'text', x: 220, y: 120, text: 'sticks out of the box' }]);
  assert.equal(across.overlaps, 1);
  const within = metrics([{ id: 'frame', type: 'rectangle', x: 0, y: 0, width: 800, height: 500 }, { id: 'note', type: 'text', x: 100, y: 300, text: 'inside' }]);
  assert.equal(within.overlaps, 0);
  // Two colliding labelled shapes count once, as the shape pair.
  assert.equal(metrics([box('a', 100, 100, { label: 'One' }), box('b', 115, 105, { label: 'Two' })]).overlaps, 2, 'the shapes, and their two labels on each other');
});

test('a label too big for a fixed-size shape overflows', () => {
  assert.equal(metrics([box('a', 100, 100, { width: 120, height: 40, label: 'A label that wraps onto several lines' })]).overflow, 1);
  assert.equal(metrics([{ id: 'a', type: 'diamond', x: 100, y: 100, label: 'Sized to fit' }]).overflow, 0);
  // A word split to fit a narrow shape counts when the written label is known.
  const narrow = [{ id: 'd', type: 'ellipse', x: 100, y: 100, width: 100, height: 70, label: 'Droplet' }];
  assert.equal(sceneMetrics(layoutScene(narrow), undefined, narrow).overflow, 1);
  assert.equal(sceneMetrics(layoutScene(narrow), undefined, [{ ...narrow[0], label: 'Drop' }]).overflow, 0);
});

test('edges through shapes and arrow crossings', () => {
  const row = [box('a', 100, 100), box('b', 400, 100), box('c', 700, 100)];
  const m = metrics([...row, { id: 'ac', type: 'arrow', from: 'a', to: 'c' }]);
  assert.equal(m.through, 1, 'a → c goes straight through b');
  assert.equal(metrics([...row, { id: 'ab', type: 'arrow', from: 'a', to: 'b' }]).through, 0);
  // A frame the arrow runs inside is not an obstacle; a lifeline leaving its party box is not either.
  assert.equal(metrics([{ id: 'frame', type: 'rectangle', x: 0, y: 0, width: 1000, height: 400 }, ...row.slice(0, 2), { id: 'ab', type: 'arrow', from: 'a', to: 'b' }]).through, 0);
  assert.equal(metrics([box('a', 100, 100), { id: 'life', type: 'line', points: [{ x: 180, y: 180 }, { x: 180, y: 700 }], dashed: true }]).through, 0);
  const x = metrics([box('a', 100, 100), box('b', 600, 500), box('c', 600, 100), box('d', 100, 500),
    { id: 'ab', type: 'arrow', from: 'a', to: 'b' }, { id: 'cd', type: 'arrow', from: 'c', to: 'd' }, { id: 'ac', type: 'arrow', from: 'a', to: 'c' }]);
  assert.equal(x.crossings, 1, 'the diagonals cross; arrows sharing a box only touch');
});

test('free text lying on an arrow is flagged', () => {
  const base = [box('a', 100, 100), box('b', 600, 100), { id: 'ab', type: 'arrow', from: 'a', to: 'b' }];
  assert.equal(metrics([...base, { id: 'note', type: 'text', x: 380, y: 125, text: 'on the line' }]).textOnLines, 1);
  assert.equal(metrics([...base, { id: 'note', type: 'text', x: 380, y: 300, text: 'below it' }]).textOnLines, 0);
});

test('on-screen text size follows the default panel on a 1080p display', () => {
  const panel = panelSize({ width: 1920, height: 1080 });
  assert.deepEqual(panel, { width: 1180, height: 760 });
  assert.deepEqual(panelViewport(panel), { width: 1180, height: 656 });
  // The camera always shows the whole 1600 × 900 canvas (plus padding): medium text (20) lands near 13 px.
  const m = metrics([{ id: 't', type: 'text', x: 100, y: 100, text: 'Body text' }, { id: 's', type: 'text', x: 100, y: 200, text: 'note', size: 'small' }]);
  assert.equal(m.minTextPx, 10.7);
  assert.equal(m.smallText, 2);
  // Drawing far outside the canvas zooms out and shrinks everything.
  assert.ok(metrics([{ id: 't', type: 'text', x: 100, y: 100, text: 'Body' }, box('far', 3600, 100)]).minTextPx < 8);
  assert.equal(metrics([box('a', 100, 100)]).minTextPx, null);
});

test('lesson metrics count new elements per beat and words per label', () => {
  const m = lessonMetrics(demoLesson.beats);
  assert.equal(m.beats, demoLesson.beats.length);
  assert.equal(m.newPerBeat.max, Math.max(...demoLesson.beats.map(b => b.draw?.length ?? 0)));
  assert.ok(m.labelWords.max >= 1 && m.labelWords.mean > 0);
  // Follow-ups: elements already on the board are not new, and redrawing an id is not new.
  const follow = lessonMetrics([{ say: 'More', draw: [box('a', 100, 100, { label: 'Again' }), box('z', 900, 600)] }], [box('a', 100, 100)]);
  assert.deepEqual(follow.newPerBeat, { max: 1, mean: 1 });
  assert.equal(follow.elements, 2);
});
