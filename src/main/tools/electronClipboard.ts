import { clipboard, ClipboardItem } from 'electron';
/** Read-backed ClipboardItems cannot be written back. Materialize every payload
 * before replacing the clipboard, so restoration never depends on a live read handle. */
export const electronClipboard = {
  async read() {
    const items = await clipboard.read();
    return Promise.all(items.map(async item => {
      const entries = await Promise.all(item.types.map(async type => [type, await item.getType(type)] as const));
      return new ClipboardItem(Object.fromEntries(entries));
    }));
  },
  write: (items: ClipboardItem[]) => clipboard.write(items),
  readText: () => clipboard.readText(),
  writeText: (text: string) => clipboard.writeText(text),
  clear: () => clipboard.clear(),
};
