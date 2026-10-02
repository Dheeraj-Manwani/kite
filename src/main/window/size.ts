/** The Settings window's size (docs/design.md UX-57). No Electron imports, so it can be tested on its own. */
export interface WindowSize { width: number; height: number; maximized: boolean }
// The minimum keeps the sidebar beside the content (UX-50); the default fits a two-column History.
export const MIN_SIZE = { width: 480, height: 560 }, DEFAULT_SIZE = { width: 820, height: 860 };

/** The remembered size, or the default, kept above the minimum and within the screen's work area. */
export function restoredSize(saved: unknown, workArea: { width: number; height: number }): WindowSize {
  const s = saved && typeof saved === 'object' ? saved as Partial<WindowSize> : {};
  const pick = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const fit = (value: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, value)));
  return {
    width: fit(pick(s.width, DEFAULT_SIZE.width), MIN_SIZE.width, Math.max(MIN_SIZE.width, workArea.width)),
    height: fit(pick(s.height, DEFAULT_SIZE.height), MIN_SIZE.height, Math.max(MIN_SIZE.height, workArea.height)),
    maximized: s.maximized === true,
  };
}

/** Mica needs Windows 11 22H2 (build 22621) or later; Electron ignores it before that. `release` is os.release(). */
export const supportsMica = (platform: string, release: string) => platform === 'win32' && Number(release.split('.')[2]) >= 22621;
