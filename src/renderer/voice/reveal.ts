const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
/** Map spoken words back to original markdown offsets; hidden code/details are skipped. */
export function wordOffsets(text: string, words: string[]): number[] {
  const hidden = [...text.matchAll(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|<details>[\s\S]*?(?:<\/details>|$)/g)]
    .map(m => ({ start: m.index, end: m.index + m[0].length }));
  const tokens = [...text.matchAll(/https?:\/\/[^\s<>)]+|[&%]|[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)]
    .filter(m => !hidden.some(h => m.index >= h.start && m.index < h.end))
    .flatMap(m => {
      const words = /^https?:/.test(m[0]) ? ['a', 'link'] : m[0] === '&' ? ['and'] : m[0] === '%' ? ['percent'] : [m[0]];
      return words.map(word => ({ word: normalize(word), end: m.index + m[0].length }));
    });
  let cursor = 0, offset = 0;
  return words.map(word => {
    const target = normalize(word);
    if (!target) return offset;
    // A timestamp can contain a contraction or hyphenated compound as one word.
    let found = false;
    for (let i = cursor; i < Math.min(tokens.length, cursor + 12) && !found; i++) {
      let combined = '';
      for (let j = i; j < Math.min(tokens.length, i + 4); j++) {
        combined += tokens[j].word;
        if (combined === target) { cursor = j + 1; offset = tokens[j].end; found = true; break; }
        if (!target.startsWith(combined)) break;
      }
    }
    return offset;
  });
}
export function displayText(text: string) { return text.replace(/<\/?details>/g, ''); }
