/** Allowlist only machine-generated event fields. Never inspect user content. */
export function redact(input: unknown): Record<string, number | boolean | string> {
  if (!input || typeof input !== 'object') return {};
  const safe: Record<string, number | boolean | string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (['durationMs', 'captureMs', 'firstTokenMs', 'totalMs', 'count', 'statusCode', 'pid'].includes(key) && typeof value === 'number' && Number.isFinite(value)) safe[key] = value;
    if (key === 'ok' && typeof value === 'boolean') safe[key] = value;
    if (key === 'code' && typeof value === 'string' && /^(E[A-Z0-9_]{1,40}|ABORT|UNKNOWN)$/.test(value)) safe[key] = value;
  }
  return safe;
}
