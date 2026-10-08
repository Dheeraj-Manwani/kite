const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeLesson, wrapText, layoutScene, applyBeat, boundaryPoint, sceneBounds, fitView, describeScene, elementsAt, classifyBoardCommand, speechMs, readingMs, canvas } = require('../src/shared/board.ts');
const { elementStrokes, hachure, random } = require('../src/renderer/board/rough.ts');
const { BoardSession } = require('../src/main/board/session.ts');
const { BoardService, demoLesson } = require('../src/main/board/service.ts');
const { explainOnWhiteboard, lessonInput } = require('../src/main/tools/impl/explain_on_whiteboard.ts');
const { needsApproval } = require('../src/main/tools/approval.ts');
const { VoiceController } = require('../src/main/voice/controller.ts');
const { Conversation } = require('../src/main/ai/conversation.ts');

const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 2)); };
const numbers = d => d.match(/-?\d+(\.\d+)?/g).map(Number);

test('text wraps by estimated width, keeps newlines, and splits long words', () => {
  assert.deepEqual(wrapText('Client sends SYN to the server', 120, 20), ['Client', 'sends SYN', 'to the', 'server']);
  assert.deepEqual(wrapText('one\ntwo three', 1000, 20), ['one', 'two three']);
  assert.deepEqual(wrapText('Supercalifragilistic', 60, 20), ['Super', 'calif', 'ragil', 'istic']);
  assert.deepEqual(wrapText('', 100, 20), ['']);
});

test('shapes size to their labels, arrows bind edge to edge, broken references are dropped', () => {
  const scene = layoutScene([
    { id: 'a', type: 'rectangle', x: 100, y: 100, label: 'Client' },
    { id: 'b', type: 'ellipse', x: 600, y: 100, label: 'A much longer label that has to wrap' },
    { id: 'c', type: 'diamond', x: 100, y: 400, width: 200, height: 120, label: 'Ok?' },
    { id: 'ab', type: 'arrow', from: 'a', to: 'b', label: 'SYN' },
    { id: 'ghost', type: 'arrow', from: 'a', to: 'nope' },
    { id: 'free', type: 'arrow', points: [{ x: 10, y: 10 }, { x: 90, y: 10 }] },
    { id: 'l', type: 'line', points: [{ x: 0, y: 0 }] },
    { id: 't', type: 'text', x: 60, y: 30, text: 'TCP handshake', size: 'title' },
  ]);
  assert.deepEqual(scene.map(e => e.id), ['a', 'b', 'c', 'ab', 'free', 't']);
  const [a, b, c, ab] = scene;
  assert.ok(a.box.width >= 120 && a.box.height >= 64);
  assert.ok(b.label.lines.length >= 2, 'long labels wrap');
  assert.ok(b.box.width > a.box.width, 'ellipses leave room for the label');
  assert.deepEqual([c.box.width, c.box.height], [200, 120], 'explicit size wins');
  // The arrow starts just outside a's right edge and ends just outside b's left edge.
  assert.ok(Math.abs(ab.points[0].x - (a.box.x + a.box.width + 8)) < 1.5, JSON.stringify(ab.points));
  assert.ok(ab.points[1].x < b.box.x && ab.points[1].x > b.box.x - 20);
  assert.ok(ab.label && ab.label.y + ab.label.height < (ab.points[0].y + ab.points[1].y) / 2, 'label sits above a mostly horizontal arrow');
  for (const shape of ['rectangle', 'ellipse', 'diamond']) {
    const box = { x: 0, y: 0, width: 200, height: 100 };
    for (const toward of [{ x: 500, y: 50 }, { x: 100, y: -400 }, { x: -300, y: 300 }]) {
      const p = boundaryPoint({ shape, box }, toward, 0), dx = (p.x - 100) / 100, dy = (p.y - 50) / 50;
      const inside = shape === 'rectangle' ? Math.max(Math.abs(dx), Math.abs(dy)) : shape === 'ellipse' ? Math.hypot(dx, dy) : Math.abs(dx) + Math.abs(dy);
      assert.ok(Math.abs(inside - 1) < 1e-6, `${shape} boundary`);
    }
  }
});

test('arrow labels sit beside the shaft at any angle, never on it', () => {
  for (let degrees = 0; degrees < 360; degrees += 15) {
    const a = degrees * Math.PI / 180, from = { x: 800, y: 450 }, to = { x: 800 + Math.cos(a) * 300, y: 450 + Math.sin(a) * 300 };
    const [arrow] = layoutScene([{ id: 'x', type: 'arrow', points: [from, to], label: 'Tension' }]);
    const box = arrow.label;
    for (let t = 0; t <= 1; t += 0.02) {
      const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      assert.ok(!(p.x > box.x && p.x < box.x + box.width && p.y > box.y && p.y < box.y + box.height), `label covers the shaft at ${degrees}°`);
    }
    assert.ok(Math.hypot(box.x + box.width / 2 - 800 - Math.cos(a) * 150, box.y + box.height / 2 - 450 - Math.sin(a) * 150) < 80, 'label stays near the middle');
  }
});

test('a request and its reply between the same boxes sit side by side, not on top of each other', () => {
  const scene = layoutScene([
    { id: 'c', type: 'rectangle', x: 100, y: 100 }, { id: 's', type: 'rectangle', x: 700, y: 100 },
    { id: 'syn', type: 'arrow', from: 'c', to: 's' }, { id: 'ack', type: 'arrow', from: 's', to: 'c' },
  ]);
  const syn = scene.find(e => e.id === 'syn'), ack = scene.find(e => e.id === 'ack');
  assert.ok(Math.abs(syn.points[0].y - ack.points[0].y) >= 17, 'offset apart');
});

test('three labelled messages between the same two boxes stay attached and their labels never collide', () => {
  // The layout a live model produced for a TCP handshake.
  const scene = layoutScene([
    { id: 'client', type: 'rectangle', x: 200, y: 150, label: 'Client' }, { id: 'server', type: 'rectangle', x: 1000, y: 150, label: 'Server' },
    { id: 'syn', type: 'arrow', from: 'client', to: 'server', label: 'SYN' }, { id: 'synack', type: 'arrow', from: 'server', to: 'client', label: 'SYN-ACK' },
    { id: 'ack', type: 'arrow', from: 'client', to: 'server', label: 'ACK' },
  ]);
  const [client, server, ...arrows] = scene;
  const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (let i = 0; i < arrows.length; i++) for (let j = i + 1; j < arrows.length; j++) assert.equal(overlap(arrows[i].label, arrows[j].label), false, `${arrows[i].id} and ${arrows[j].id} labels`);
  for (const arrow of arrows) for (const p of arrow.points) assert.ok(p.y > client.box.y && p.y < client.box.y + client.box.height && p.y > server.box.y && p.y < server.box.y + server.box.height, `${arrow.id} stays attached`);
  assert.equal(new Set(arrows.map(a => Math.round(a.points[0].y))).size, 3, 'three distinct lines');
});

test('beats add, replace in place, and erase (with bound arrows); scene bounds and fit include the canvas', () => {
  let inputs = applyBeat([], { draw: [{ id: 'a', type: 'rectangle', x: 0, y: 0 }, { id: 'b', type: 'rectangle', x: 400, y: 0 }, { id: 'ab', type: 'arrow', from: 'a', to: 'b' }] });
  inputs = applyBeat(inputs, { draw: [{ id: 'a', type: 'rectangle', x: 0, y: 300, label: 'moved' }] });
  assert.deepEqual(inputs.map(e => e.id), ['a', 'b', 'ab']); assert.equal(inputs[0].label, 'moved');
  assert.deepEqual(applyBeat(inputs, { erase: ['b'] }).map(e => e.id), ['a']);
  const bounds = sceneBounds(layoutScene(inputs));
  assert.ok(bounds.x <= 0 && bounds.y <= 0 && bounds.width >= 400);
  assert.equal(sceneBounds([]), null);
  const view = fitView(null, { width: 800, height: 450 });
  assert.ok(Math.abs(view.scale - Math.min(800 / (canvas.width + 80), 450 / (canvas.height + 80))) < 1e-9);
  const wide = fitView({ x: -500, y: 0, width: 3000, height: 100 }, { width: 800, height: 450 });
  assert.ok(wide.x <= -540 && wide.scale < view.scale, 'content outside the canvas zooms out');
});

test('scene descriptions give the model ids, labels, geometry and bindings; marks hit the right elements', () => {
  const scene = layoutScene(demoLesson.beats.reduce(applyBeat, []));
  const text = describeScene(scene);
  assert.match(text, /- kite: diamond blue "Sail" at x=690 y=250 w=220 h=280/);
  assert.match(text, /- lift: arrow green from \(800,235\) to \(800,120\) "Lift"/);
  assert.match(text, /- title: text "How a kite flies"/);
  assert.equal(elementsAt(scene, { x: 790, y: 300, width: 20, height: 20 })[0].id, 'kite');
  assert.deepEqual(elementsAt(scene, { x: 1500, y: 100, width: 5, height: 5 }), []);
  assert.match(describeScene(scene, 2), /…and \d+ more/);
});

test('rough strokes are deterministic, finite, and hug their shapes', () => {
  const [shape] = layoutScene([{ id: 'r', type: 'rectangle', x: 100, y: 100, width: 200, height: 100, fill: 'hachure' }]);
  const a = elementStrokes(shape), b = elementStrokes(shape);
  assert.deepEqual(a, b);
  assert.deepEqual(a.map(s => s.role), ['outline', 'outline', 'fill']);
  for (const s of a) {
    const n = numbers(s.d); assert.ok(n.every(Number.isFinite));
    for (let i = 0; i < n.length; i += 2) assert.ok(n[i] > 90 && n[i] < 310 && n[i + 1] > 90 && n[i + 1] < 210, 'near the box');
  }
  const [ellipse] = layoutScene([{ id: 'e', type: 'ellipse', x: 0, y: 0, width: 200, height: 100 }]);
  for (const s of elementStrokes(ellipse)) {
    const n = numbers(s.d);
    for (let i = 0; i < n.length; i += 2) assert.ok(Math.hypot((n[i] - 100) / 100, (n[i + 1] - 50) / 50) < 1.25);
  }
  const [arrow] = layoutScene([{ id: 'x', type: 'arrow', points: [{ x: 0, y: 0 }, { x: 300, y: 0 }], heads: 'both' }]);
  assert.deepEqual(elementStrokes(arrow).map(s => s.role), ['outline', 'outline', 'head', 'head']);
  const [dashed] = layoutScene([{ id: 'd', type: 'arrow', points: [{ x: 0, y: 0 }, { x: 300, y: 0 }], dashed: true, heads: 'none' }]);
  assert.deepEqual(elementStrokes(dashed).map(s => [s.role, !!s.dashed]), [['outline', true]]);
  // Hatching stays inside a diamond.
  const lines = hachure([{ x: 100, y: 0 }, { x: 200, y: 100 }, { x: 100, y: 200 }, { x: 0, y: 100 }], 8, random(3));
  const pts = numbers(lines);
  for (let i = 0; i < pts.length; i += 2) assert.ok(Math.abs(pts[i] - 100) + Math.abs(pts[i + 1] - 100) < 108);
});

test('board commands are exact phrases; anything else goes to the model', () => {
  for (const [s, want] of [['wait', 'pause'], ['Pause the lesson.', 'pause'], ['continue', 'resume'], ['go ahead', 'resume'], ['next', 'next'], ['move on', 'next'],
    ['say that again', 'repeat'], ['start over', 'replay'], ['draw it again', 'replay'], ['close the board', 'close'], ['stop', 'close'], ["that's enough", 'close']])
    assert.equal(classifyBoardCommand(s), want, s);
  for (const s of ['what does the arrow mean', 'next, explain the ACK', 'close the window in Word', 'draw a cat']) assert.equal(classifyBoardCommand(s), 'new-request', s);
  assert.ok(speechMs('one two three four five six') > speechMs('one two'));
  assert.ok(speechMs('a b c d e f g h', 1.5) < speechMs('a b c d e f g h'));
  assert.ok(readingMs('hi') >= 1800);
});

const lesson = [
  { say: 'Beat one.', draw: [{ id: 'a', type: 'rectangle', x: 0, y: 0, label: 'A' }] },
  { say: 'Beat two.', draw: [{ id: 'b', type: 'rectangle', x: 400, y: 0, label: 'B' }, { id: 'ab', type: 'arrow', from: 'a', to: 'b' }], highlight: ['a'] },
  { say: 'Beat three.', draw: [{ id: 'c', type: 'ellipse', x: 800, y: 0, label: 'C' }] },
];
const timing = { gapMs: 1, drawSlackMs: 60000, idleMs: 60000 };
function board(voice = true, beats = lesson) {
  const views = [], said = [], silenced = [];
  const s = { views, said, silenced, get view() { return views.at(-1); } };
  s.session = new BoardSession(4, 'Test', beats, {
    emit: v => views.push(v), speed: () => 1, silence: () => silenced.push(true),
    speak: (text, hooks) => { if (!voice) return false; said.push({ text, hooks }); return true; },
  }, [], timing);
  s.speech = () => said.at(-1).hooks;
  s.draw = () => s.session.drew(s.view.drawing.key);
  return s;
}
test('each beat draws when its speech starts and advances only when both speech and drawing finish', async () => {
  const b = board(); b.session.start();
  assert.equal(b.view.status, 'playing'); assert.equal(b.view.drawing, null, 'nothing is drawn before the voice starts');
  assert.deepEqual(b.view.elements, []);
  assert.equal(b.said[0].text, 'Beat one.');
  b.speech().started();
  assert.deepEqual(b.view.drawing.ids, ['a']); assert.deepEqual(b.view.elements.map(e => e.id), ['a']);
  b.speech().done('spoken'); await flush();
  assert.equal(b.said.length, 1, 'waits for the drawing');
  b.draw(); await flush();
  assert.equal(b.said.length, 2); assert.equal(b.view.beat, 1);
  b.speech().started();
  assert.deepEqual(b.view.drawing.ids, ['b', 'ab']); assert.deepEqual(b.view.highlight, ['a']);
  b.draw(); b.speech().done('spoken'); await flush();
  b.speech().started(); b.draw(); b.speech().done('spoken'); await flush();
  assert.equal(b.view.status, 'done'); assert.match(b.view.note, /Ask me anything/);
  assert.deepEqual(b.view.elements.map(e => e.id), ['a', 'b', 'ab', 'c']);
  b.session.stop(); assert.equal(b.views.at(-1), null);
});

test('streaming: the newest beat waits for the next one, appended beats carry on, and sealing lets the lesson end', async () => {
  const b = board(true, lesson.slice(0, 1)); b.session.stream(); b.session.start();
  b.speech().started(); b.draw(); b.speech().done('spoken'); await flush();
  assert.equal(b.said.length, 1, 'beat 1 done, beat 2 not written yet: wait'); assert.equal(b.view.status, 'playing');
  b.session.append([lesson[1]]);
  assert.equal(b.said.at(-1).text, 'Beat two.', 'a waiting lesson carries on at once'); assert.equal(b.view.total, 2);
  b.session.append([lesson[2]]);
  assert.equal(b.said.length, 2, 'a beat that arrives early waits its turn');
  b.speech().started(); b.draw(); b.speech().done('spoken'); await flush();
  b.speech().started(); b.draw(); b.speech().done('spoken'); await flush();
  assert.equal(b.view.status, 'playing', 'still open: more may come');
  b.session.seal(); await flush();
  assert.equal(b.view.status, 'done'); assert.deepEqual(b.view.elements.map(e => e.id), ['a', 'b', 'ab', 'c']);
  assert.deepEqual(b.said.map(x => x.text), ['Beat one.', 'Beat two.', 'Beat three.'], 'nothing played twice');
  // "Next" on the newest beat while it is still being written shows it whole and waits.
  const n = board(true, lesson.slice(0, 1)); n.session.stream(); n.session.start(); n.speech().started();
  n.session.next();
  assert.equal(n.view.status, 'playing'); assert.equal(n.view.drawing, null); assert.deepEqual(n.view.elements.map(e => e.id), ['a']);
  n.session.append([lesson[1]]); assert.equal(n.said.at(-1).text, 'Beat two.');
  n.session.stop(); b.session.stop();
});

test('streaming a follow-up: its beats go after the beat that is playing, before the rest of the lesson', async () => {
  const b = board(); b.session.start(); b.speech().started(); b.draw(); b.speech().done('spoken'); await flush();
  b.session.stream(); b.session.insert([{ say: 'Extra one.' }]);
  assert.equal(b.said.at(-1).text, 'Extra one.');
  b.session.append([{ say: 'Extra two.' }]);
  b.speech().started(); b.speech().done('spoken'); await flush();
  assert.equal(b.said.at(-1).text, 'Extra two.');
  b.speech().started(); b.speech().done('spoken'); await flush();
  assert.equal(b.view.status, 'playing', 'waits while the follow-up is still being written');
  b.session.seal(); await flush();
  assert.equal(b.view.status, 'paused', 'then pauses before the rest of the original lesson'); assert.equal(b.view.total, 5);
  b.session.stop();
});

test('without voice, beats draw immediately and wait for the caption to be read', async () => {
  const b = board(false); b.session.start();
  assert.deepEqual(b.view.drawing.ids, ['a']);
  b.draw(); await flush();
  assert.equal(b.view.beat, 0, 'reading time has not passed');
  b.session.stop();
});

test('cut speech pauses; resume says the beat again; stale callbacks and acks are ignored', async () => {
  const b = board(); b.session.start(); b.speech().started();
  const old = b.speech(), key = b.view.drawing.key;
  old.done('cut');
  assert.equal(b.view.status, 'paused'); assert.deepEqual(b.view.elements.map(e => e.id), ['a'], 'paused beat stays drawn');
  assert.equal(b.view.drawing, null);
  b.session.drew(key); old.done('spoken'); await flush();
  assert.equal(b.view.status, 'paused');
  b.session.resume();
  assert.equal(b.said.length, 2); assert.equal(b.said[1].text, 'Beat one.');
  b.speech().started(); assert.notEqual(b.view.drawing.key, key, 'a redraw gets a new key');
  b.session.stop();
});

test('a failed voice falls back to reading time instead of pausing', async () => {
  const b = board(); b.session.start();
  b.speech().done('failed');
  assert.equal(b.view.status, 'playing'); assert.deepEqual(b.view.drawing.ids, ['a'], 'draws even though audio never started');
  b.session.stop();
});

test('next, repeat, replay and a missing overlay acknowledgement', async () => {
  const b = board(); b.session.start(); b.speech().started();
  b.session.next();
  assert.equal(b.view.beat, 1); assert.deepEqual(b.view.elements.map(e => e.id), ['a'], 'the skipped beat is on the board');
  b.session.repeat(); assert.equal(b.said.at(-1).text, 'Beat two.');
  b.session.replay(); assert.equal(b.view.beat, 0); assert.deepEqual(b.view.elements, []);
  b.session.next(); b.session.next(); assert.equal(b.session.next(), 'That’s the end of the lesson.');
  assert.equal(b.view.status, 'done');
  assert.ok(b.silenced.length >= 4);
  b.session.stop();
  const slow = new BoardSession(1, 'x', lesson, { emit: () => {}, speed: () => 1, silence: () => {}, speak: () => false }, [], { ...timing, drawSlackMs: 5 });
  slow.start(); await new Promise(r => setTimeout(r, 40));
  assert.equal(slow.beat, 0, 'reading time still gates the beat'); slow.stop();
});

test('follow-up beats are inserted after what is drawn, then the lesson waits before the rest', async () => {
  const b = board(); b.session.start(); b.speech().started(); b.draw(); b.speech().done('spoken'); await flush();
  // Beat two is queued (not started) when the question arrives.
  b.session.insert([{ say: 'Aside.', draw: [{ id: 'note', type: 'text', x: 0, y: 200, text: 'aside' }], highlight: ['a'] }]);
  assert.equal(b.said.at(-1).text, 'Aside.'); assert.equal(b.view.beat, 1); assert.equal(b.view.total, 4);
  b.speech().started(); b.draw(); b.speech().done('spoken'); await flush();
  assert.equal(b.view.status, 'paused'); assert.match(b.view.note, /pick up where we left off/);
  assert.equal(b.view.beat, 2); assert.deepEqual(b.view.elements.map(e => e.id), ['a', 'note'], 'the rest is not drawn yet');
  b.session.resume(); assert.equal(b.said.at(-1).text, 'Beat two.');
  b.session.stop();
  const done = board(); done.session.start(); done.session.next(); done.session.next(); done.session.next();
  done.session.insert([{ say: 'More.' }]);
  assert.equal(done.view.beat, 3); assert.equal(done.said.at(-1).text, 'More.');
  done.session.stop();
});

test('the service owns one lesson, answers commands locally, and gives the model board context', async () => {
  const views = [], spoken = []; let enabled = true, opened = 0;
  const service = new BoardService({ enabled: () => enabled, speed: () => 1, silence: () => {}, opened: () => opened++,
    speak: (text, hooks) => { spoken.push(hooks); return true; }, emit: v => views.push(v) });
  assert.equal(service.command('pause'), undefined, 'no board, no command');
  assert.match(service.context(), /prefer explain_on_whiteboard/);
  assert.equal(service.start(demoLesson).ok, true); assert.equal(opened, 1);
  assert.match(service.context(), /"How a kite flies" \(beat 1 of 6, playing\)[\s\S]*- lift: arrow green/);
  assert.equal(service.command('what is lift'), undefined);
  assert.equal(service.command('wait'), 'Okay, I’ll wait.'); assert.equal(views.at(-1).status, 'paused');
  spoken.at(-1).started();
  assert.equal(service.marks(['kite', 'bogus', 'kite']), undefined, 'only drawn elements can be marked');
  service.command('continue'); spoken.at(-1).started();
  assert.match(service.marks(['kite', 'bogus']), /marked: kite \(diamond "Sail"\)/);
  assert.equal(service.start({ title: 'More', mode: 'add', beats: [{ say: 'Extra.' }] }).ok, true);
  assert.equal(views.at(-1).total, 7, 'add continues the open board');
  assert.equal(service.command('close the board'), 'Okay, I’ve put the board away.');
  assert.equal(views.at(-1), null); assert.equal(service.active, false);
  enabled = false;
  assert.equal(service.start(demoLesson).ok, false); assert.equal(service.context(), undefined);
});

test('the lesson log: time to first stroke from the model request, lint counts, and token use; no lesson content', () => {
  const views = [], spoken = [], logs = []; let now = 1000;
  const service = new BoardService({ enabled: () => true, speed: () => 1, silence: () => {}, now: () => now, log: (event, data) => logs.push([event, data]),
    speak: (text, hooks) => { spoken.push(hooks); return true; }, emit: v => views.push(v) });
  service.start(demoLesson, { requestedAt: 400 });
  const first = views.at(-1).stats;
  assert.equal(first.firstStrokeMs, undefined, 'nothing drawn until the first beat is heard');
  assert.equal(first.beats, demoLesson.beats.length); assert.ok(first.elements > 0);
  assert.deepEqual(Object.keys(first.lint), ['overlaps', 'overflow', 'through', 'crossings', 'textOnLines', 'minTextPx']);
  now = 3400; spoken.at(-1).started();
  assert.equal(views.at(-1).stats.firstStrokeMs, 3000);
  now = 9000; spoken.at(-1).done('spoken');
  assert.equal(views.at(-1).stats.firstStrokeMs, 3000, 'measured once per lesson');
  service.usage(1234, 1);
  assert.equal(views.at(-1).stats.outputTokens, 1234); assert.equal(views.at(-1).stats.repairs, 1);
  const logged = logs.filter(([event]) => event === 'board:lesson');
  assert.equal(logged.length, 2);
  assert.ok(!JSON.stringify(logged).includes('kite'), 'the log holds numbers, never board text');
  // A follow-up is measured on its own, against the board it adds to.
  service.start({ title: 'More', mode: 'add', beats: [{ say: 'Extra.', draw: [{ id: 'note', type: 'text', x: 60, y: 840, text: 'Extra' }] }] }, { requestedAt: 9000 });
  now = 9500; spoken.at(-1).started();
  const follow = views.at(-1).stats;
  assert.equal(follow.firstStrokeMs, 500); assert.equal(follow.beats, 1); assert.ok(follow.elements > first.elements, 'lint covers the whole board');
  assert.equal(follow.outputTokens, undefined); assert.equal(follow.repairs, 0);
  service.close();
});

test('explain_on_whiteboard accepts loose lessons, summarizes deterministically, never asks, ends the turn, and honors dry run', async () => {
  let started;
  const tool = explainOnWhiteboard(l => { started = l; return { ok: true, message: 'open' }; });
  assert.equal(needsApproval(tool), false); assert.equal(tool.endsTurn, true);
  const ok = { title: 'TCP', beats: [{ say: 'Two boxes.', draw: [{ id: 'c', type: 'rectangle', x: 0, y: 0, label: 'Client' }, { id: 's', type: 'rectangle', x: 400, y: 0 }, { id: 'cs', type: 'arrow', from: 'c', to: 's', label: 'SYN' }] }] };
  assert.equal(tool.summarize(ok), 'Draw "TCP" on the whiteboard: 1 beat, 3 elements.');
  // Only the shape of values is checked: wrong optional values are dropped, unknown keys stripped, the rest repaired later.
  const parsed = lessonInput.safeParse({ ...ok, extra: 1, beats: [{ ...ok.beats[0], draw: [{ id: 'c', type: 'rectangle', x: 1e9, y: 0, color: 'chartreuse', size: 'huge', bogus: true }] }] });
  assert.equal(parsed.success, true);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.data.beats[0].draw[0])), { id: 'c', type: 'rectangle', x: 1e9, y: 0 });
  for (const bad of [{ ...ok, beats: [] }, { beats: ok.beats }, { ...ok, beats: [{ draw: ok.beats[0].draw }] }])
    assert.equal(lessonInput.safeParse(bad).success, false, JSON.stringify(bad).slice(0, 120));
  const odd = lessonInput.parse({ ...ok, beats: [{ ...ok.beats[0], draw: [...ok.beats[0].draw, { id: 'x', type: 'hexagon', x: 0, y: 0 }, 'junk'] }] });
  assert.deepEqual(odd.beats[0].draw.map(e => e.id), ['c', 's', 'cs'], 'only the undrawable elements are left out');
  // The JSON schema the model sees keeps types and enums, marks nothing optional as required, and adds no defaults.
  const schema = JSON.stringify(require('zod').toJSONSchema(lessonInput, { target: 'draft-7', io: 'input' }));
  assert.match(schema, /"enum":\["rectangle","ellipse","diamond","text","arrow","line"\]/); assert.doesNotMatch(schema, /"default"/);
  assert.equal((await tool.execute(ok, { dryRun: true, signal: new AbortController().signal })).dryRun, true); assert.equal(started, undefined);
  await tool.execute(ok, { dryRun: false, signal: new AbortController().signal });
  assert.equal(started.mode, 'new'); assert.equal(started.beats[0].draw[2].from, 'c');
});

test('sanitizeLesson repairs what it can, drops what cannot be drawn, and says what it changed', () => {
  const { lesson, fixes } = sanitizeLesson({ title: '  ', beats: [
    { say: 'One.', draw: [
      { id: 'a', type: 'rectangle', x: 9e9, y: 10, width: 1, text: 'Client' },
      { id: 'a', type: 'ellipse', x: 400, y: 10, label: 'Server' },
      { id: 'bad id!', type: 'text', x: 10, y: 600, text: 'Note' },
      { type: 'rectangle', x: 10, y: 300 },
      { id: 'nopos', type: 'diamond', label: 'Where?' },
      { id: 'ln', type: 'line', points: [{ x: 0, y: 0 }] },
      { id: 'ar', type: 'arrow', from: 'a', to: 'ghost' },
      { id: 'ok', type: 'arrow', from: 'a', to: 'a-2', label: 'SYN' },
      { id: 'odd', type: 'hexagon', x: 1, y: 1 },
    ], highlight: ['a', 'ghost'] },
    { say: '', draw: [] },
    { say: 'Two.', erase: ['ok', 'nothing'], highlight: ['ok'] },
  ] });
  assert.equal(lesson.title, 'Whiteboard'); assert.equal(lesson.mode, 'new');
  assert.equal(lesson.beats.length, 2, 'the empty beat is gone');
  const [one, two] = lesson.beats;
  assert.deepEqual(one.draw.map(e => e.id), ['a', 'a-2', 'bad-id', 'el1', 'ok']);
  assert.deepEqual(one.draw[0], { id: 'a', type: 'rectangle', x: 6000, y: 10, width: 16, label: 'Client' }, 'clamped, and text became the label');
  assert.equal(one.draw[4].to, 'a-2'); assert.deepEqual(one.highlight, ['a']);
  assert.deepEqual(two, { say: 'Two.', erase: ['ok'] }, 'an erased id cannot be highlighted in the same beat');
  for (const fix of ['added a title', 'renamed a duplicate id', 'cleaned up ids', 'named elements that had no id', 'dropped shapes with no position',
    'dropped lines with fewer than two points', 'dropped arrow ends that pointed at nothing', 'dropped arrows with nothing to connect',
    'dropped an element with no valid type', 'used text as a shape label', 'dropped highlights of ids not on the board', 'dropped erases of ids not on the board', 'dropped empty beats'])
    assert.ok(fixes.includes(fix), fix);
  // A follow-up may point at what is already on the board; a clean lesson needs no fixes.
  const follow = sanitizeLesson({ title: 'More', mode: 'add', beats: [{ say: 'Link.', draw: [{ id: 'n', type: 'text', x: 0, y: 0, text: 'x' }, { id: 'l', type: 'arrow', from: 'n', to: 'kite' }], highlight: ['kite'] }] }, ['kite']);
  assert.deepEqual(follow.fixes, []); assert.equal(follow.lesson.beats[0].draw[1].to, 'kite');
  assert.deepEqual(sanitizeLesson(demoLesson).fixes, []);
  assert.equal(sanitizeLesson({ title: 'x', beats: Array.from({ length: 20 }, () => ({ say: 'x' })) }).lesson.beats.length, 16);
});

test('the service repairs lessons against the board, lists the fixes, and refuses one with nothing to draw', () => {
  const views = []; let captions = false;
  const service = new BoardService({ enabled: () => true, speed: () => 1, silence: () => {}, speak: () => false, emit: v => views.push(v), captions: () => captions });
  const result = service.start({ title: 'T', beats: [{ say: 'Hi.', draw: [{ id: 'a', type: 'rectangle', x: 0, y: 0 }, { id: 'a', type: 'rectangle', x: 300, y: 0 }] }] });
  assert.equal(result.ok, true); assert.match(result.message, /Fixed: renamed a duplicate id\./); assert.equal(result.transcript, '(Sketched on the whiteboard: T)');
  assert.equal(views.at(-1).stats.fixes, 1);
  assert.deepEqual(views.at(-1).elements.map(e => e.id), ['a', 'a-2']);
  assert.equal(views.at(-1).captions, false, 'every view says whether captions show');
  // Presentation mode, by voice: "make it bigger" and "smaller" are answered locally.
  for (const said of ['make it bigger', 'Bigger.', 'full screen', "I can't read it", 'presentation mode']) assert.equal(classifyBoardCommand(said), 'bigger', said);
  for (const said of ['make it smaller', 'exit fullscreen', 'normal size']) assert.equal(classifyBoardCommand(said), 'smaller', said);
  assert.equal(classifyBoardCommand('make it bigger and add the server'), 'new-request');
  assert.equal(service.command('make it bigger'), ''); assert.equal(views.at(-1).presenting, true);
  assert.equal(service.command('smaller'), ''); assert.equal(views.at(-1).presenting, false);
  captions = true; service.refresh(); assert.equal(views.at(-1).captions, true);
  const empty = service.start({ title: 'T', beats: [{ say: '', draw: [{ id: 'x', type: 'line', points: [] }] }] });
  assert.equal(empty.ok, false); assert.match(empty.message, /Nothing in that lesson could be drawn/);
  service.close();
});

test('the service streams a lesson: the first complete beats open the board, the final call adds the rest once', async () => {
  const said = [], views = [];
  const service = new BoardService({ enabled: () => true, speed: () => 1, silence: () => {}, emit: v => views.push(v), speak: (text, hooks) => { said.push({ text, hooks }); return true; } });
  const full = { title: 'TCP', mode: 'new', beats: lesson };
  service.preview('call1', { title: 'TCP', beats: lesson.slice(0, 1) }, { requestedAt: 0 });
  assert.equal(views.at(-1).title, 'TCP'); assert.equal(said.at(-1).text, 'Beat one.', 'drawing starts from the first complete beat');
  service.preview('call1', { title: 'TCP', beats: lesson.slice(0, 2) });
  assert.equal(views.at(-1).total, 2);
  const result = service.start(full, { callId: 'call1' });
  assert.equal(result.ok, true); assert.equal(result.transcript, '(Sketched on the whiteboard: TCP)');
  assert.equal(views.at(-1).total, 3, 'the final call adds only what had not arrived');
  for (let i = 0; i < 3; i++) { said.at(-1).hooks.started(); service.drawn(views.at(-1).id, views.at(-1).drawing.key); said.at(-1).hooks.done('spoken'); await new Promise(r => setTimeout(r, 520)); }
  assert.deepEqual(said.map(x => x.text), ['Beat one.', 'Beat two.', 'Beat three.']); assert.equal(views.at(-1).status, 'done');
  // A title that arrives late is settled by the final call.
  service.preview('call2', { title: '', mode: 'new', beats: lesson.slice(0, 1) });
  assert.equal(views.at(-1).title, 'Whiteboard');
  service.start({ title: 'Late title', beats: lesson.slice(0, 1) }, { callId: 'call2' });
  assert.equal(views.at(-1).title, 'Late title');
  // With a board open, nothing streams until the model says whether it adds to it.
  const before = views.length;
  service.preview('call3', { title: 'More', beats: lesson.slice(0, 1) });
  assert.equal(views.length, before, 'mode unknown: wait');
  service.preview('call3', { title: 'More', mode: 'add', beats: [{ say: 'Extra.' }] });
  assert.equal(said.at(-1).text, 'Extra.');
  // Cut off: what arrived plays and the turn ends on it. Rejected: a new board is put away.
  assert.deepEqual(service.endStream('call3', 'truncated'), { ok: true, message: 'The lesson was cut off; Kite is playing the beats that arrived.', transcript: '(Sketched on the whiteboard: Late title)' });
  service.preview('call4', { title: 'New topic', mode: 'new', beats: lesson.slice(0, 1) });
  assert.equal(views.at(-1).title, 'New topic');
  assert.equal(service.endStream('call4', 'rejected'), undefined); assert.equal(views.at(-1), null, 'put away cleanly');
  assert.equal(service.endStream('nope', 'aborted'), undefined);
  service.close();
});

test('a lesson line plays beside a model turn that is still writing silently; the user talking cuts it', async () => {
  let finishAsk;
  const events = [], tts = [], log = [];
  const settings = { ttsEnabled: true, voiceId: 'v', model: { provider: 'openai', id: 'x' } };
  const controller = new VoiceController({
    emit: e => events.push(e), getKey: () => 'key', transcribe: async () => 'Explain TCP', ask: () => new Promise(r => { finishAsk = r; }),
    history: { createConversation: () => {}, addMessage: () => 1 }, conversation: new Conversation(() => 'c'), setEscape: () => {},
    settings: () => settings, describe: m => ({ ...m, label: 'X', supportsVision: false, supportsTools: false, tier: 'fast' }),
    tts: { start: id => tts.push(['start', id]), push: (id, t) => tts.push(['push', id, t]), finish: id => tts.push(['finish', id]), cancel: () => tts.push(['cancel']) },
  });
  const id = controller.start(); controller.stop(); const turn = controller.submit(id, new ArrayBuffer(8)); await flush();
  assert.equal(typeof finishAsk, 'function', 'the model turn is running');
  controller.announce('Beat one.', { started: () => log.push('started'), done: end => log.push(end) });
  const line = events.filter(e => e.type === 'guide:announce').at(-1).id;
  assert.notEqual(line, id); assert.deepEqual(tts.slice(-3), [['start', line], ['push', line, 'Beat one.'], ['finish', line]], 'spoken now, not after the turn');
  controller.playback(line, 'started'); assert.deepEqual(log, ['started']);
  finishAsk('(Sketched on the whiteboard: TCP)'); await turn;
  assert.deepEqual(log, ['started'], 'the turn ending does not cut the line');
  controller.playback(line, 'ended'); assert.deepEqual(log, ['started', 'spoken']);
  // Again, but the user starts talking: the line is cut.
  const next = controller.start(); controller.stop(); const turn2 = controller.submit(next, new ArrayBuffer(8)); await flush();
  controller.announce('Beat two.', { done: end => log.push(end) });
  controller.start(); assert.equal(log.at(-1), 'cut');
  finishAsk('x'); await turn2; controller.cancel(); await controller.shutdown();
});

test('a reply said before a streamed lesson ends there; the lesson line follows its last words, not the whole turn', async () => {
  let finishAsk, say;
  const events = [], tts = [], log = [];
  const settings = { ttsEnabled: true, voiceId: 'v', model: { provider: 'openai', id: 'x' } };
  const controller = new VoiceController({
    emit: e => events.push(e), getKey: () => 'key', transcribe: async () => 'Explain TCP',
    ask: (m, k, s, onDelta) => { say = onDelta; onDelta('Let me sketch it.'); return new Promise(r => { finishAsk = r; }); },
    history: { createConversation: () => {}, addMessage: () => 1 }, conversation: new Conversation(() => 'c'), setEscape: () => {},
    settings: () => settings, describe: m => ({ ...m, label: 'X', supportsVision: false, supportsTools: false, tier: 'fast' }),
    tts: { start: id => tts.push(['start', id]), push: (id, t) => tts.push(['push', id, t]), finish: id => tts.push(['finish', id]), cancel: () => tts.push(['cancel']) },
  });
  const id = controller.start(); controller.stop(); const turn = controller.submit(id, new ArrayBuffer(8)); await flush();
  controller.toolEvent('tool:streaming', 'explain_on_whiteboard');
  assert.deepEqual(tts.slice(-1), [['finish', id]], 'the reply speech is closed when the lesson starts streaming');
  controller.announce('Beat one.', { started: () => log.push('started'), done: end => log.push(end) });
  assert.ok(!events.some(e => e.type === 'guide:announce'), 'waits for the reply to finish playing');
  controller.playback(id, 'started'); controller.playback(id, 'ended');
  const line = events.filter(e => e.type === 'guide:announce').at(-1)?.id;
  assert.ok(line, 'plays as soon as the reply has been heard, while the lesson is still being written');
  say(' More words.');
  assert.ok(!tts.some(([kind, , text]) => kind === 'push' && text === ' More words.'), 'later text is shown, not spoken');
  controller.playback(line, 'started'); assert.deepEqual(log, ['started']);
  finishAsk('Let me sketch it. More words.'); await turn;
  assert.equal(tts.filter(([kind, jid]) => kind === 'finish' && jid === id).length, 1, 'closed once');
  controller.playback(line, 'ended'); assert.deepEqual(log, ['started', 'spoken']);
  await controller.shutdown();
});

function voice() {
  const events = [], tts = [];
  const settings = { ttsEnabled: true, voiceId: 'v', model: { provider: 'openai', id: 'x' } };
  const controller = new VoiceController({
    emit: e => events.push(e), getKey: () => 'key', transcribe: async () => 'Hello', ask: async (m, k, s, onDelta) => { onDelta('Hi'); return 'Hi'; },
    history: { createConversation: () => {}, addMessage: () => 1 }, conversation: new Conversation(() => 'c'), setEscape: () => {},
    settings: () => settings, describe: m => ({ ...m, label: 'X', supportsVision: false, supportsTools: true, tier: 'fast' }),
    tts: { start: id => tts.push(['start', id]), push: (id, t) => tts.push(['push', id, t]), finish: id => tts.push(['finish', id]), cancel: () => tts.push(['cancel']) },
  });
  return { controller, events, tts, settings, id: () => events.filter(e => e.type === 'guide:announce').at(-1).id };
}
test('announcements report when their audio starts and how they end, exactly once', async () => {
  const v = voice(), log = [];
  const hooks = name => ({ started: () => log.push(name + ':started'), done: end => log.push(name + ':' + end) });
  assert.equal(v.controller.announce('One.', hooks('one')), true);
  v.controller.playback(v.id(), 'started'); v.controller.playback(v.id(), 'ended');
  assert.deepEqual(log, ['one:started', 'one:spoken']);
  v.controller.announce('Two.', hooks('two'));
  v.controller.announce('Three.', hooks('three'));
  assert.deepEqual(log.slice(2), ['two:cut'], 'a newer line cuts the older one');
  v.controller.ttsEvent({ type: 'tts:error', id: v.id() });
  assert.deepEqual(log.slice(3), ['three:failed']);
  // Queued behind the user's own interaction, then cut when the user starts talking again.
  const id = v.controller.start();
  v.controller.announce('Four.', hooks('four'));
  v.controller.cancel(); v.controller.start();
  assert.deepEqual(log.slice(4), ['four:cut']);
  v.controller.cancel(); await flush(2);
  v.settings.ttsEnabled = false;
  assert.equal(v.controller.announce('Muted.', hooks('muted')), false); assert.equal(log.length, 5, 'no voice, no hooks');
  v.settings.ttsEnabled = true;
  v.controller.announce('Five.', hooks('five')); v.controller.mute();
  assert.equal(log.at(-1), 'five:failed', 'muting turns a line into a caption instead of pausing');
  assert.ok(id);
  await v.controller.shutdown();
});
