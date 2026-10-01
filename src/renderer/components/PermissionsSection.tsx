import { useEffect, useState } from 'react';
import { Group, Row } from './SettingsParts';
import { LockIcon } from '../icons';
import { categories, categoryInfo, defaultPermissions, maxSpendLimit, modeInfo, permissionTable, placeLabel, rupees, withCategory,
  type Permission, type PermissionMode, type PermissionSettings } from '../../shared/permissions';
import type { AppSettings } from '../../shared/types';

const permissionLabels: Record<Permission, string> = { allow: 'Allow', ask: 'Ask', never: 'Don’t allow' };
const presetModes: Exclude<PermissionMode, 'custom'>[] = ['balanced', 'ask', 'handsOff'];

/**
 * Settings → Permissions (ADR 014): the mode first, one line each; the table behind "Customise"; then the spend limit
 * and the rules saved from "Always" and "Never". Turning Hands-off on for good asks once more, here.
 */
export function PermissionsSection({ settings, update }: { settings: AppSettings; update(patch: Partial<AppSettings>): void }) {
  const p = settings.permissions ?? defaultPermissions, table = permissionTable(p);
  const save = (next: PermissionSettings) => update({ permissions: next });
  const [confirming, setConfirming] = useState(false);
  const [limit, setLimit] = useState(String(p.spendLimit));
  useEffect(() => { setLimit(String(p.spendLimit)); }, [p.spendLimit]);
  const commitLimit = () => {
    const value = Math.round(Number(limit.replace(/[₹,\s]/g, '')));
    if (Number.isFinite(value) && value >= 0 && value <= maxSpendLimit) { if (value !== p.spendLimit) save({ ...p, spendLimit: value }); }
    else setLimit(String(p.spendLimit));
  };
  const choose = (mode: PermissionMode) => {
    if (mode === p.mode) return;
    if (mode === 'handsOff') { setConfirming(true); return; }
    setConfirming(false); save({ ...p, mode });
  };
  const modes: PermissionMode[] = p.mode === 'custom' ? [...presetModes, 'custom'] : presetModes;
  return <>
    <Group title="Mode" hint="How much Kite does on its own during tasks and errands. Starting a task always asks first.">
      <div className="mode-list" role="radiogroup" aria-label="Permission mode">
        {modes.map(mode => <label key={mode} className={`setting-row mode-row${p.mode === mode ? ' current' : ''}`}>
          <input type="radio" name="permission-mode" checked={p.mode === mode || (mode === 'handsOff' && confirming)} onChange={() => choose(mode)} />
          <span className="row-text"><span className="row-label">{modeInfo[mode].label}{mode === 'balanced' && <span className="tag">Recommended</span>}</span>
            <small>{modeInfo[mode].summary}</small></span>
        </label>)}
      </div>
      {confirming && <div className="setting-row stacked hands-off-confirm" role="alertdialog" aria-label="Turn on Hands-off">
        <p>Hands-off lets Kite submit, send, delete and pay without asking you, on every task. Web pages can contain text meant to steer it.
          Most people choose <strong>Hands-off for this job</strong> when a task starts instead. The kite wears a ring on its tail while Hands-off is on.</p>
        <div className="custom-actions"><button className="primary" onClick={() => { setConfirming(false); save({ ...p, mode: 'handsOff' }); }}>Turn on Hands-off</button>
          <button onClick={() => setConfirming(false)}>Cancel</button></div>
      </div>}
    </Group>
    <details className="advanced"><summary>Customise each kind of step</summary>
      <div className="group-card">{categories.map(c => <Row key={c} label={categoryInfo[c].label} description={categoryInfo[c].examples}>
        <select aria-label={categoryInfo[c].label} value={table[c]} onChange={e => save(withCategory(p, c, e.target.value as Permission))}>
          {(Object.keys(permissionLabels) as Permission[]).map(v => <option key={v} value={v}>{permissionLabels[v]}{c === 'money' && v === 'allow' ? ' up to the limit' : ''}</option>)}</select></Row>)}
      </div>
    </details>
    <Group title="Spending">
      <Row label="Spend limit" description={p.spendLimit > 0 ? `Kite asks before any payment above ${rupees(p.spendLimit)}, whatever the mode.` : 'Kite asks before every payment. Raise this to let Hands-off pay small amounts.'}>
        <span className="money-field"><span aria-hidden="true">₹</span><input aria-label="Spend limit in rupees" inputMode="numeric" value={limit}
          onChange={e => setLimit(e.target.value)} onBlur={commitLimit} onKeyDown={e => { if (e.key === 'Enter') commitLimit(); }} /></span></Row>
    </Group>
    <Group title="Sites and apps" hint="Saved when you answer “Always” or “Never” on Kite’s card, or say it.">
      {p.rules.length ? p.rules.map(rule => <Row key={`${rule.place}|${rule.category}`} label={`${categoryInfo[rule.category].label} on ${placeLabel(rule.place)}`}
        description={permissionLabels[rule.permission]}>
        <button onClick={() => save({ ...p, rules: p.rules.filter(r => r !== rule) })}>Remove</button></Row>)
        : <div className="setting-row"><span className="row-text"><small>No rules yet.</small></span></div>}
    </Group>
    <Group>
      <div className="setting-row always-ask"><LockIcon /><span className="row-text"><span className="row-label">In every mode</span>
        <small>Kite asks before spending above your limit, before leaving the job’s site, and before running commands. It never types passwords, card numbers, one-time codes, CVVs or PINs, and never solves CAPTCHAs: it hands those to you.</small></span></div>
    </Group>
  </>;
}
