import type { Point } from './board';
import type { PlotSpec } from './boardTeaching';
const functions: Record<string, (x: number) => number> = { sin: Math.sin, cos: Math.cos, tan: Math.tan, sqrt: Math.sqrt, abs: Math.abs, log: Math.log, exp: Math.exp };
/** Bounded recursive descent: expressions are data, never JavaScript. */
export function expression(source: string): (x: number) => number {
  if (source.length > 300) throw new Error('Expression is too long.');
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z]+|[+\-*/^()]/gi) ?? [];
  if (tokens.join('') !== source.replace(/\s/g, '') || tokens.length > 160) throw new Error('Invalid expression.');
  let at = 0, depth = 0;
  type Fn = (x: number) => number;
  const primary = (): Fn => {
    if (++depth > 32) throw new Error('Expression is too deeply nested.');
    const t = tokens[at++]; let value: Fn;
    if (t === '(') { value = sum(); if (tokens[at++] !== ')') throw new Error('Missing closing parenthesis.'); }
    else if (t === 'x') value = x => x;
    else if (t === 'pi' || t === 'e') value = () => t === 'pi' ? Math.PI : Math.E;
    else if (Object.hasOwn(functions, t)) { if (tokens[at++] !== '(') throw new Error('A function needs parentheses.'); const arg = sum(); if (tokens[at++] !== ')') throw new Error('Missing closing parenthesis.'); value = x => functions[t](arg(x)); }
    else if (t && Number.isFinite(Number(t))) value = () => Number(t);
    else throw new Error('Unknown expression token.');
    depth--; return value;
  };
  const power = (): Fn => { const a = primary(); if (tokens[at] !== '^') return a; at++; const b = unary(); return x => a(x) ** b(x); };
  const unary = (): Fn => { if (tokens[at] === '+' || tokens[at] === '-') { const sign = tokens[at++] === '-' ? -1 : 1, a = unary(); return x => sign * a(x); } return power(); };
  const product = (): Fn => { let a = unary(); while (tokens[at] === '*' || tokens[at] === '/') { const op = tokens[at++], b = unary(), prev = a; a = x => op === '*' ? prev(x) * b(x) : prev(x) / b(x); } return a; };
  const sum = (): Fn => { let a = product(); while (tokens[at] === '+' || tokens[at] === '-') { const op = tokens[at++], b = product(), prev = a; a = x => op === '+' ? prev(x) + b(x) : prev(x) - b(x); } return a; };
  const evaluate = sum(); if (at !== tokens.length) throw new Error('Unexpected expression token.'); return evaluate;
}
/** Break at discontinuities instead of drawing across an asymptote. */
export function samplePlot(spec: PlotSpec, width = 720, height = 400): Point[][] {
  const fn = expression(spec.expression), paths: Point[][] = []; let run: Point[] = [], previous: number | undefined;
  const dx = spec.xmax - spec.xmin, dy = spec.ymax - spec.ymin;
  if (![spec.xmin, spec.xmax, spec.ymin, spec.ymax].every(Number.isFinite) || dx <= 0 || dy <= 0) throw new Error('Invalid plot range.');
  for (let i = 0; i <= 320; i++) {
    const x = spec.xmin + i / 320 * dx, y = fn(x);
    if (!Number.isFinite(y) || y < spec.ymin || y > spec.ymax || previous !== undefined && Math.abs(y - previous) > dy * 0.2) { if (run.length > 1) paths.push(run); run = []; previous = Number.isFinite(y) && y >= spec.ymin && y <= spec.ymax ? y : undefined; continue; }
    run.push({ x: i / 320 * width, y: height - (y - spec.ymin) / dy * height }); previous = y;
  }
  if (run.length > 1) paths.push(run); return paths;
}
