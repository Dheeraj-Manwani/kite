/** Logical modifiers; left and right variants are normalized by the hook adapter. */
export const settingsConfig = {
  pushToTalk: ['Control', 'Meta'] as readonly string[],
  minHoldMs: 250,
  maxHoldMs: 60_000,
  maxAudioBytes: 12 * 1024 * 1024,
  inactivityMs: 5 * 60_000,
  contextMessages: 10,
};
