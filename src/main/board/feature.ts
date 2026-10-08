// Release only after the phase-2 golden and actual-renderer gates are checked (ADR 018).
const released = false;
export const structuredBoards = () => process.env.KITE_BOARD_PHASE2 === '0' ? false : released || ['2','3','4','5'].some(n => process.env[`KITE_BOARD_PHASE${n}`] === '1');
export const teachingBoards = () => structuredBoards() && ['3','4','5'].some(n => process.env[`KITE_BOARD_PHASE${n}`] === '1');
export const ownedBoards = () => structuredBoards() && ['4','5'].some(n => process.env[`KITE_BOARD_PHASE${n}`] === '1');
export const delightBoards = () => ownedBoards() && process.env.KITE_BOARD_PHASE5 === '1';
