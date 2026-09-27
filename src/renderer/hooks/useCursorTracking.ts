import { useEffect } from 'react';
import { useKiteStore } from '../store/kite';

export function useCursorTracking() {
  const setCursorPosition = useKiteStore(state => state.setCursorPosition);
  useEffect(() => {
    const unsubscribe = window.kite.onCursorUpdate(setCursorPosition);
    return () => {
      unsubscribe();
      window.kite.setOverlayInteractive(false);
    };
  }, [setCursorPosition]);
}
