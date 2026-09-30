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
export const BackIcon = () => <Icon><path d="M10 3.5 5.5 8l4.5 4.5" /></Icon>;
export const SkipIcon = () => <Icon><path d="M6 3.5 10.5 8 6 12.5" /></Icon>;
export const PauseIcon = () => <Icon><path d="M5.5 3.5v9M10.5 3.5v9" /></Icon>;
export const ResumeIcon = () => <Icon><path className="filled" d="M5 3.2v9.6L12.5 8Z" /></Icon>;
export const StopIcon = () => <Icon><path d="M4 4l8 8M12 4l-8 8" /></Icon>;
export const LookAgainIcon = () => <Icon><path d="M13 8a5 5 0 1 1-1.5-3.6" /><path d="M13 2.5v3h-3" /></Icon>;
export const CheckIcon = () => <Icon><path d="M3.5 8.5 6.5 11.5 12.5 4.5" /></Icon>;
export const MoreIcon = () => <Icon><circle className="filled" cx="3.5" cy="8" r=".9" /><circle className="filled" cx="8" cy="8" r=".9" /><circle className="filled" cx="12.5" cy="8" r=".9" /></Icon>;
export const LockIcon = () => <Icon><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></Icon>;
export const ExternalIcon = () => <Icon><path d="M9 3h4v4M13 3 7.5 8.5" /><path d="M11.5 9.5v2.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1h2.5" /></Icon>;
export const SearchIcon = () => <Icon><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></Icon>;
export const TrashIcon = () => <Icon><path d="M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 8.5a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-8.5" /></Icon>;
export const ExportIcon = () => <Icon><path d="M8 2.5v8M5 5.5l3-3 3 3" /><path d="M3 10v2.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V10" /></Icon>;
