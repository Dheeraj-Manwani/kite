// Release only after the phase-2 golden and actual-renderer gates are checked (ADR 018).
const released = false;
export const structuredBoards = () => process.env.KITE_BOARD_PHASE2 === '0' ? false : released || process.env.KITE_BOARD_PHASE2 === '1' || process.env.KITE_BOARD_PHASE3 === '1' || process.env.KITE_BOARD_PHASE4 === '1';
export const teachingBoards = () => structuredBoards() && (process.env.KITE_BOARD_PHASE3 === '1' || process.env.KITE_BOARD_PHASE4 === '1');
export const ownedBoards = () => structuredBoards() && process.env.KITE_BOARD_PHASE4 === '1';
