/** Device-independent pixels relative to the overlay's origin. */
export interface CursorPoint { x: number; y: number }
export type KiteMood = 'idle' | 'listening' | 'thinking' | 'talking';
export interface KiteAPI {
  onCursorUpdate(callback: (point: CursorPoint) => void): () => void;
  setOverlayInteractive(isInteractive: boolean): void;
  openSettings(): void;
}
