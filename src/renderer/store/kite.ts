import { create } from 'zustand';
import type { CursorPoint, KiteMood } from '../../shared/types';

interface KiteState {
  cursorPosition: CursorPoint;
  mood: KiteMood;
  hasCursor: boolean;
  setCursorPosition(point: CursorPoint): void;
}
export const useKiteStore = create<KiteState>(set => ({
  cursorPosition: { x: 0, y: 0 }, mood: 'idle', hasCursor: false,
  setCursorPosition: cursorPosition => set({ cursorPosition, hasCursor: true }),
}));
