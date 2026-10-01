import type { ScreenBounds } from '../../shared/types';
import type { GuideRole, GuideStep } from '../../shared/guide';
/** One UI Automation element in global desktop DIP. Lower layers are higher in z-order (popups first). */
export interface UiElement {
  name: string; role: string; automationId: string; help: string; enabled: boolean; layer: number; rect: ScreenBounds;
  selected?: boolean; expanded?: boolean;
}
/** Preferred UI Automation control types for each plan role, most likely first. */
const roleTypes: Record<GuideRole, string[]> = {
  button: ['Button', 'SplitButton', 'MenuItem', 'Hyperlink', 'ListItem', 'TabItem'],
  tab: ['TabItem', 'ListItem', 'Button'],
  menu: ['MenuItem', 'Button', 'SplitButton', 'ComboBox'],
  'menu item': ['MenuItem', 'ListItem', 'Button', 'TreeItem', 'CheckBox'],
  link: ['Hyperlink', 'Text', 'Button', 'ListItem'],
  checkbox: ['CheckBox', 'Button', 'MenuItem'],
  'radio button': ['RadioButton', 'ListItem', 'MenuItem'],
  dropdown: ['ComboBox', 'SplitButton', 'Button', 'MenuItem'],
  'text field': ['Edit', 'Document', 'ComboBox'],
  'list item': ['ListItem', 'TreeItem', 'DataItem', 'MenuItem'],
  'tree item': ['TreeItem', 'ListItem'],
  slider: ['Slider', 'Spinner'],
  other: [],
};
const roleWords = /\s+(tab|button|menu item|menu|option|icon|link|checkbox|check box|radio button|dropdown|drop down|field|box|item|entry|command)$/;
export function normalizeLabel(value: string) {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&(?=\S)/g, '')
    .replace(/\((?:ctrl|alt|shift|win)\s*\+[^)]*\)|\b(?:ctrl|alt|shift)\s*\+\s*\S+/gi, ' ')
    .replace(/…|\.{3}/g, ' ')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function levenshtein(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}
const startsWith = (words: string[], prefix: string[]) => prefix.length <= words.length && prefix.every((w, i) => words[i] === w);
const containsRun = (words: string[], run: string[]) => words.some((_, i) => startsWith(words.slice(i), run));
/** 0..1 similarity between a planned label and a UI name. Exact beats prefix beats containment beats fuzzy. */
export function labelScore(label: string, candidate: string): number {
  // "Insert tab" should match "Insert", but "New tab" must still match "New tab".
  const a = normalizeLabel(label), b = normalizeLabel(candidate), bare = a.replace(roleWords, '');
  return Math.max(similarity(a, b), bare !== a ? similarity(bare, b) : 0);
}
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aw = a.split(' '), bw = b.split(' ');
  if (startsWith(bw, aw)) return Math.max(0.8, 0.9 - 0.03 * (bw.length - aw.length));
  if (containsRun(bw, aw)) return Math.max(0.66, 0.8 - 0.03 * (bw.length - aw.length));
  if (containsRun(aw, bw) && bw.join('').length >= 3) return 0.5 + 0.3 * (bw.length / aw.length);
  const similarity = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  if (similarity >= 0.75 && Math.min(a.length, b.length) >= 4) return similarity * 0.88;
  const shared = aw.filter(w => bw.includes(w)).length;
  return shared ? (2 * shared / (aw.length + bw.length)) * 0.7 : 0;
}
const humanize = (id: string) => id.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
export function roleFactor(role: GuideRole, element: string) {
  const types = roleTypes[role] ?? [];
  if (!types.length) return element === 'Text' ? 0.9 : 1;
  if (types[0] === element) return 1.1;
  if (types.includes(element)) return 1;
  return element === 'Text' ? 0.72 : 0.8;
}
const area = (r: ScreenBounds) => r.width * r.height;
const center = (r: ScreenBounds) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
export function scoreElement(step: Pick<GuideStep, 'target' | 'role'>, element: UiElement) {
  const text = Math.max(labelScore(step.target, element.name), 0.9 * labelScore(step.target, humanize(element.automationId)), 0.72 * labelScore(step.target, element.help));
  if (!text) return 0;
  let score = text * roleFactor(step.role, element.role);
  if (!element.enabled) score *= 0.85;
  if (area(element.rect) < 64) score *= 0.5;
  if (element.role === 'Document' && step.role !== 'text field') score *= 0.8;
  return score + (element.layer === 0 ? 0.02 : 0);
}
export const matchThreshold = 0.62;
/** Best element for a step, or null. Near-ties prefer popups, then proximity to the previous target. */
export function matchTarget(elements: UiElement[], step: Pick<GuideStep, 'target' | 'role'>, near?: ScreenBounds | null): { element: UiElement; score: number } | null {
  const scored = elements.map((element, order) => ({ element, order, score: scoreElement(step, element) })).filter(s => s.score >= matchThreshold);
  if (!scored.length) return null;
  const best = Math.max(...scored.map(s => s.score));
  const reference = near ? center(near) : null;
  const distance = (r: ScreenBounds) => reference ? Math.hypot(center(r).x - reference.x, center(r).y - reference.y) : 0;
  const top = scored.filter(s => s.score >= best - 0.03)
    .sort((a, b) => b.score - a.score > 0.015 || b.score - a.score < -0.015 ? b.score - a.score
      : a.element.layer - b.element.layer || distance(a.element.rect) - distance(b.element.rect) || a.order - b.order)[0];
  return { element: top.element, score: top.score };
}
/** Navigation state that already satisfies a step: a selected tab or an open menu/tree node. Choices are never inferred. */
export function alreadyDone(element: UiElement) {
  if (element.role === 'TabItem' && element.selected === true) return true;
  return element.expanded === true && ['SplitButton', 'MenuItem', 'ComboBox', 'Button', 'TreeItem'].includes(element.role);
}
/**
 * The guide's approval covers looking at the app being guided. A screenshot is never taken because the
 * user switched to another app, nor while Kite itself is in front. With UI Automation unavailable
 * (no snapshot for another reason), vision is the only way to ground, so it is allowed.
 */
export function visionAllowed(foreground: string | undefined, guided: string | undefined, uiaError: string | undefined) {
  if (foreground !== undefined) return !guided || foreground === guided;
  return uiaError !== 'EKITE';
}
const contains = (r: ScreenBounds, p: { x: number; y: number }) => p.x >= r.x && p.y >= r.y && p.x <= r.x + r.width && p.y <= r.y + r.height;
export function insideTarget(rect: ScreenBounds, point: { x: number; y: number }, slack = 8) {
  return contains({ x: rect.x - slack, y: rect.y - slack, width: rect.width + slack * 2, height: rect.height + slack * 2 }, point);
}
// Controls with labels a user reads: the kite shouldn't sit on them while it points at a neighbour (design.md §K5.6, K-08).
const labelled = new Set(['Button', 'SplitButton', 'MenuItem', 'Hyperlink', 'ListItem', 'TabItem', 'CheckBox', 'RadioButton', 'ComboBox', 'Edit',
  'Text', 'TreeItem', 'DataItem', 'Slider', 'Spinner', 'HeaderItem']);
const encloses = (outer: ScreenBounds, inner: ScreenBounds) => inner.x >= outer.x - 1 && inner.y >= outer.y - 1
  && inner.x + inner.width <= outer.x + outer.width + 1 && inner.y + inner.height <= outer.y + outer.height + 1;
/**
 * The named controls around a target, nearest first: its neighbours on a ribbon or toolbar, which are what the user checks
 * next. Containers of the target and the target's own parts are left out.
 */
export function neighbours(elements: UiElement[], target: ScreenBounds, reach = 90, limit = 40): ScreenBounds[] {
  const gap = (r: ScreenBounds) => Math.hypot(Math.max(0, target.x - (r.x + r.width), r.x - (target.x + target.width)),
    Math.max(0, target.y - (r.y + r.height), r.y - (target.y + target.height)));
  return elements.filter(e => e.name.trim() && labelled.has(e.role) && area(e.rect) <= 60_000 && !encloses(e.rect, target) && !encloses(target, e.rect))
    .map(e => ({ rect: e.rect, distance: gap(e.rect) })).filter(n => n.distance <= reach)
    .sort((a, b) => a.distance - b.distance).slice(0, limit).map(n => n.rect);
}
/** Verify a model-proposed box against the UI Automation tree: snap to the control it lands on. */
export function snapToElement(box: ScreenBounds, elements: UiElement[], step: Pick<GuideStep, 'target' | 'role'>): UiElement | null {
  const point = center(box), limit = Math.max(area(box) * 6, 96 * 96);
  const candidates = elements.filter(e => e.role !== 'Document' && contains(e.rect, point) && area(e.rect) <= limit)
    .map(e => ({ e, label: scoreElement(step, e) }));
  if (!candidates.length) return null;
  const named = candidates.filter(c => c.label >= 0.45).sort((a, b) => b.label - a.label);
  if (named.length) return named[0].e;
  return candidates.sort((a, b) => a.e.layer - b.e.layer || area(a.e.rect) - area(b.e.rect))[0].e;
}
export interface NormalizedBox { x0: number; y0: number; x1: number; y1: number }
/**
 * Extract {"found":…,"x0":…} from free text. Coordinates are 0–1000 of the image; values above 1000
 * are treated as pixels of an image of the given size. Returns null for not-found or unusable boxes.
 */
export function parseVisionBox(text: string, image: { width: number; height: number }): NormalizedBox | null {
  const match = text.match(/\{[^{}]*\}/);
  if (!match) return null;
  let value: unknown;
  try { value = JSON.parse(match[0]); } catch { return null; }
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.found !== true) return null;
  const keys = ['x0', 'y0', 'x1', 'y1'] as const;
  if (!keys.every(k => typeof v[k] === 'number' && Number.isFinite(v[k] as number) && (v[k] as number) >= 0)) return null;
  let [x0, y0, x1, y1] = keys.map(k => v[k] as number);
  if (Math.max(x0, y0, x1, y1) > 1000) {
    if (x1 > image.width + 2 || y1 > image.height + 2) return null;
    x0 = x0 / image.width * 1000; x1 = x1 / image.width * 1000; y0 = y0 / image.height * 1000; y1 = y1 / image.height * 1000;
  }
  if (x1 < x0) [x0, x1] = [x1, x0];
  if (y1 < y0) [y0, y1] = [y1, y0];
  const box = { x0: Math.max(0, x0), y0: Math.max(0, y0), x1: Math.min(1000, x1), y1: Math.min(1000, y1) };
  const w = box.x1 - box.x0, h = box.y1 - box.y0;
  if (w < 2 || h < 2 || w * h > 500 * 500) return null;
  return box;
}
export function boxToScreen(box: NormalizedBox, display: ScreenBounds): ScreenBounds {
  return { x: display.x + box.x0 / 1000 * display.width, y: display.y + box.y0 / 1000 * display.height,
    width: (box.x1 - box.x0) / 1000 * display.width, height: (box.y1 - box.y0) / 1000 * display.height };
}
