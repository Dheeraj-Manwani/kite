import { create } from 'zustand';
import type { KiteMood } from '../../shared/types';

interface KiteState { mood: KiteMood; setMood(mood: KiteMood): void }
export const useKiteStore = create<KiteState>(set => ({
  mood: 'idle', setMood: mood => set({ mood }),
}));
