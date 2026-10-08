import { boardColors, type BoardColor, type TextBlock } from './board';
export const boardThemes = ['paper', 'chalkboard', 'blueprint'] as const;
export type BoardTheme = typeof boardThemes[number];
export interface BoardAppearance { theme: BoardTheme; handwriting: boolean }
export const defaultAppearance: BoardAppearance = { theme: 'paper', handwriting: true };
export function boardAppearance(value?: Partial<BoardAppearance>): BoardAppearance {
  return { theme: boardThemes.includes(value?.theme) ? value.theme : 'paper', handwriting: value?.handwriting !== false };
}
export function themeInk(theme: BoardTheme, color: BoardColor) {
  if (theme === 'paper') return boardColors[color] ?? boardColors.black;
  const strokes: Record<BoardColor, string> = { black: '#f1f5f4', gray: '#bccdcb', red: '#ffa8a8', orange: '#ffd8a8', green: '#b2f2bb', teal: '#99e9f2', blue: '#a5d8ff', purple: '#e5dbff' };
  return { stroke: strokes[color] ?? strokes.black, fill: theme === 'blueprint' ? '#235583' : '#304a45' };
}
export const themePaper = (theme: BoardTheme) => theme === 'chalkboard' ? '#18332e' : theme === 'blueprint' ? '#123b63' : '#ffffff';
/** Authored monoline glyphs, in a 6 × 10 em. Each M lifts the pen; no glyph outlines or font dependency. */
const glyphs: Record<string, string> = {
  A:'M0 10L3 0L6 10M1 7H5', B:'M0 10V0H3Q7 0 5 4L3 5H0M3 5Q8 5 6 9L3 10H0', C:'M6 1Q0 -2 0 5Q0 12 6 9', D:'M0 10V0H2Q8 0 6 7Q5 10 2 10H0', E:'M6 0H0V10H6M0 5H5', F:'M6 0H0V10M0 5H5', G:'M6 1Q0 -2 0 5Q0 12 6 9V6H3', H:'M0 0V10M6 0V10M0 5H6', I:'M0 0H6M3 0V10M0 10H6', J:'M0 0H6M5 0V7Q5 12 0 9', K:'M0 0V10M6 0L0 6L6 10', L:'M0 0V10H6', M:'M0 10V0L3 6L6 0V10', N:'M0 10V0L6 10V0', O:'M3 0C-1 0 -1 10 3 10C7 10 7 0 3 0', P:'M0 10V0H3Q8 0 6 4Q5 5 0 5', Q:'M3 0C-1 0 -1 10 3 10C7 10 7 0 3 0M4 7L7 11', R:'M0 10V0H3Q8 0 6 4Q5 5 0 5M3 5L6 10', S:'M6 1Q0 -2 0 3Q0 5 3 5Q7 5 6 8Q5 12 0 9', T:'M0 0H6M3 0V10', U:'M0 0V7Q0 13 6 9V0', V:'M0 0L3 10L6 0', W:'M0 0L1 10L3 5L5 10L6 0', X:'M0 0L6 10M6 0L0 10', Y:'M0 0L3 5L6 0M3 5V10', Z:'M0 0H6L0 10H6',
  a:'M5 4Q-1 2 0 8Q1 12 5 8M5 4V10L6 9', b:'M0 0V10M0 5Q6 1 6 7Q6 12 0 9', c:'M6 4Q0 2 0 7Q0 12 6 9', d:'M6 0V10M6 5Q0 1 0 7Q0 12 6 9', e:'M0 7H6Q6 2 2 4Q-2 6 1 9Q3 11 6 9', f:'M1 10V3Q1 -1 5 1M0 4H5', g:'M6 4V11Q6 15 1 13M6 5Q0 1 0 7Q0 12 6 9', h:'M0 0V10M0 6Q6 1 6 6V10', i:'M3 4V10M3 1V1.2', j:'M4 4V11Q4 15 0 13M4 1V1.2', k:'M0 0V10M6 4L0 8M2 7L6 10', l:'M2 0V8Q2 11 5 9', m:'M0 4V10M0 6Q3 2 3 6V10M3 6Q6 2 6 6V10', n:'M0 4V10M0 6Q6 1 6 6V10', o:'M3 4C-1 4 -1 10 3 10C7 10 7 4 3 4', p:'M0 4V14M0 5Q6 1 6 7Q6 12 0 9', q:'M6 4V14M6 5Q0 1 0 7Q0 12 6 9', r:'M1 4V10M1 6Q3 2 6 4', s:'M6 4Q0 2 0 6Q0 7 3 7Q7 7 6 9Q5 11 0 9', t:'M2 1V8Q2 11 6 9M0 4H5', u:'M0 4V8Q0 12 5 9M5 4V10L6 9', v:'M0 4L3 10L6 4', w:'M0 4L1 10L3 6L5 10L6 4', x:'M0 4L6 10M6 4L0 10', y:'M0 4L3 10L6 4M3 10L1 14', z:'M0 4H6L0 10H6',
  '0':'M3 0C-1 0 -1 10 3 10C7 10 7 0 3 0M1 8L5 2', '1':'M1 2L3 0V10M0 10H6', '2':'M0 2Q1 -2 5 1Q8 4 0 10H6', '3':'M0 1Q6 -2 6 3Q6 5 3 5Q8 5 6 9Q4 12 0 9', '4':'M5 10V0L0 7H6', '5':'M6 0H0V5Q8 2 6 8Q4 12 0 9', '6':'M6 1Q0 -2 0 7Q0 12 5 9Q8 4 0 5', '7':'M0 0H6L2 10', '8':'M3 5C-2 4 0 -1 3 0C7 -1 9 4 3 5C-2 6 -1 11 3 10C7 11 9 6 3 5', '9':'M6 5Q-2 8 0 2Q2 -2 6 2V7Q6 12 0 9',
  '.':'M3 9V9.2', ',':'M3 9L2 12', ':':'M3 4V4.2M3 9V9.2', ';':'M3 4V4.2M3 9L2 12', '-':'M0 6H6', '_':'M0 11H6', '+':'M0 6H6M3 3V9', '=':'M0 4H6M0 8H6', '/':'M0 11L6 -1', '\\':'M0 -1L6 11', '(':'M5 0Q0 5 5 10', ')':'M1 0Q6 5 1 10', '[':'M5 0H1V10H5', ']':'M1 0H5V10H1', '?':'M0 2Q2 -2 5 1Q8 4 3 6V7M3 9V9.2', '!':'M3 0V7M3 9V9.2', "'":'M3 0L2 3', '"':'M2 0V3M5 0V3', '<':'M6 1L0 5L6 9', '>':'M0 1L6 5L0 9', '*':'M0 3L6 8M6 3L0 8M3 2V9', '%':'M0 10L6 0M1 1h1v2H1ZM4 7h1v2H4Z', '|':'M3 0V10', '#':'M2 0L1 10M5 0L4 10M0 3H6M0 7H6', '&':'M6 10L1 3Q0 -1 3 0Q7 1 1 6Q-2 9 2 10Q5 11 6 5', '@':'M5 8V4Q0 2 1 8Q4 11 5 7Q7 11 7 4Q6 -2 1 0Q-3 2 -1 10Q1 14 6 12', '$':'M6 1Q0 -2 0 3Q0 5 3 5Q7 5 6 8Q5 12 0 9M3 -2V12', '^':'M0 4L3 0L6 4', '`':'M2 0L4 2', '~':'M0 6Q1 3 3 6Q5 9 6 6', '{':'M5 0Q2 0 3 4L1 5L3 6Q2 10 5 10', '}':'M1 0Q4 0 3 4L5 5L3 6Q4 10 1 10',
};
export interface LetterStroke { d: string; transform: string }
/** All-or-nothing fallback keeps unsupported scripts and long prose as properly shaped text. */
export function handwritingStrokes(block: TextBlock): LetterStroke[] | undefined {
  if (block.lines.join('').length > 32 || !block.lines.every(line => [...line].every(c => c === ' ' || glyphs[c]))) return;
  const result: LetterStroke[] = [], scale = block.size / 14;
  for (const [row, line] of block.lines.entries()) {
    const sx = Math.min(scale, block.width / Math.max(1, line.length * 8)), width = line.length * 8 * sx;
    const x = block.x + (block.align === 'center' ? (block.width - width) / 2 : 0), y = block.y + row * block.size * 1.3 + block.size * 0.2;
    [...line].forEach((c, i) => { if (c !== ' ') result.push({ d: glyphs[c], transform: `translate(${x + i * 8 * sx} ${y}) scale(${sx} ${scale})` }); });
  }
  return result;
}
/** Exact commands only, so a question mentioning “next” never skips the lesson. */
export function multilingualBoardCommand(text: string) {
  const s = text.normalize('NFKC').toLocaleLowerCase().trim().replace(/[.!?,。！？।]+$/gu, '').replace(/\s+/g, ' ');
  const groups = {
    pause: ['रुको','रुकिए','रोक दो','ठहरो','ruk jao','ruko','pausa','pausar','espera','pausez','attends','anhalten','warte'],
    resume: ['जारी रखो','आगे बढ़ो','चलो जारी रखें','jaari rakho','aage badho','continúa','continuar','sigue','continuez','reprends','weiter','fortsetzen'],
    next: ['अगला','अगला चरण','अगला भाग','agla','agla step','siguiente','siguiente paso','suivant','étape suivante','nächster schritt','weiter zum nächsten'],
    previous: ['पिछला चरण','पिछला भाग','pichla step','anterior','paso anterior','précédent','étape précédente','vorheriger schritt'],
    replay: ['फिर से शुरू करो','दोबारा चलाओ','dobara chalao','reiniciar','desde el principio','recommence','depuis le début','von vorne','neu starten'],
    repeat: ['दोहराओ','फिर से बोलो','doharao','repite','repetir','répète','wiederholen'],
    close: ['बंद करो','बोर्ड बंद करो','band karo','cerrar','cierra la pizarra','ferme le tableau','schließen','tafel schließen'],
    bigger: ['बड़ा करो','bada karo','más grande','agrandis','größer'],
    smaller: ['छोटा करो','chhota karo','más pequeño','réduis','kleiner'],
    back: ['पिछले बोर्ड पर जाओ','vuelve al tablero anterior','retour au tableau précédent','zurück zur vorherigen tafel'],
  } as const;
  for (const [action, commands] of Object.entries(groups)) if ((commands as readonly string[]).includes(s)) return action as keyof typeof groups;
  if (['धीरे बोलो','dheere bolo','más despacio','plus lentement','langsamer'].includes(s)) return { type: 'speed' as const, speed: 0.75 };
  if (['तेज़ बोलो','tez bolo','más rápido','plus vite','schneller'].includes(s)) return { type: 'speed' as const, speed: 1.5 };
}
