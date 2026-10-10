/** Serialized by the caller. Restoration must also run when hiding or capture fails. */
export async function protectedCapture<T>(options: { protect(value: boolean): void; hide(value: boolean): Promise<void>; wait(): Promise<void>; capture(): Promise<T>; keepVisible?: boolean }): Promise<T> {
  try { options.protect(true); if (!options.keepVisible) await options.hide(true); await options.wait(); return await options.capture(); }
  finally { try { options.protect(false); } finally { if (!options.keepVisible) await options.hide(false); } }
}
