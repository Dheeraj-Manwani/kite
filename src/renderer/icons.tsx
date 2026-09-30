import type { ReactNode } from 'react';

/** 16 px line icons in one style, drawn with currentColor. Stand-ins until the Fluent set arrives (docs/ui-ux-improvements.md UX-05). */
const Icon = ({ children }: { children: ReactNode }) =>
  <svg className="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">{children}</svg>;

export const CopyIcon = () => <Icon><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" /></Icon>;
export const PinIcon = ({ on }: { on: boolean }) =>
  <Icon><path className={on ? 'filled' : undefined} d="M9.8 1.9 14.1 6.2 12.3 7 9.8 9.5l.4 3.1-1.2 1.2L6.3 11 2.9 14.4 1.6 13.1 5 9.7 2.2 7l1.2-1.2 3.1.4L9 3.7Z" /></Icon>;
export const HistoryIcon = () => <Icon><path d="M2.6 8.9A5.5 5.5 0 1 0 4.2 4" /><path d="M2.5 1.9v2.6h2.6" /><path d="M8 5.2v3l2 1.3" /></Icon>;
export const ShieldIcon = () => <Icon><path d="M8 1.5 2.5 3.6v3.9c0 3.3 2.3 5.8 5.5 7 3.2-1.2 5.5-3.7 5.5-7V3.6Z" /></Icon>;
export const AlertIcon = () => <Icon><circle cx="8" cy="8" r="6.2" /><path d="M8 4.8v3.6" /><circle className="filled" cx="8" cy="11.1" r=".5" /></Icon>;
export const SetupIcon = () => <Icon><path d="M2.5 4.5h7M12.5 4.5h1M2.5 11.5h1M6.5 11.5h7" /><circle cx="11" cy="4.5" r="1.5" /><circle cx="5" cy="11.5" r="1.5" /></Icon>;
