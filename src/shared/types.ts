/** Global screen coordinates in device-independent pixels. */
export interface CursorPoint { x: number; y: number }
export interface ScreenBounds extends CursorPoint { width: number; height: number }
export interface CursorGeometry { origin: CursorPoint; display: ScreenBounds }
export type KiteMood = 'idle' | 'listening' | 'thinking' | 'talking';
export interface KiteAPI {
  onCursorUpdate(callback: (point: CursorPoint, geometry: CursorGeometry) => void): () => void;
  onDevPanelToggle(callback: () => void): () => void;
  setDevPanelBounds(bounds: ScreenBounds | null): void;
  setOverlayInteractive(isInteractive: boolean): void;
  openSettings(): void;
}
