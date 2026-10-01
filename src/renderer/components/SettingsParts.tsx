import type { ReactNode } from 'react';
/** The pieces every Settings section is built from (UX-50): groups of rows on a card. */
export function Group({ title, hint, children }: { title?: string; hint?: ReactNode; children: ReactNode }) {
  return <section className="settings-group">{title && <h2>{title}</h2>}{hint && <p className="group-hint">{hint}</p>}<div className="group-card">{children}</div></section>;
}
export function Row({ label, description, children }: { label: string; description?: ReactNode; children: ReactNode }) {
  return <div className="setting-row"><span className="row-text"><span className="row-label">{label}</span>{description && <small>{description}</small>}</span><span className="row-control">{children}</span></div>;
}
/** Settings that apply immediately are switches, and "on" is ink, not pink (UX-54). */
export function SwitchRow({ label, description, checked, disabled, change }: { label: string; description?: ReactNode; checked: boolean; disabled?: boolean; change(value: boolean): void }) {
  return <label className="setting-row switch-row"><span className="row-text"><span className="row-label">{label}</span>{description && <small>{description}</small>}</span>
    <input type="checkbox" role="switch" className="switch" checked={checked} disabled={disabled} onChange={e => change(e.target.checked)} /></label>;
}
