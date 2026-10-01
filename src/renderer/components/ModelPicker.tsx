import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { ModelEntry, ModelSelection, ProviderId } from '../../shared/types';
import { CheckIcon, ChevronIcon } from '../icons';

const tiers: Record<ModelEntry['tier'], string> = { flagship: 'Flagship', fast: 'Fast', budget: 'Budget' };
const same = (a: ModelSelection, b: ModelSelection) => a.provider === b.provider && a.id === b.id;
export interface ModelGroup { provider: ProviderId; label: string; models: ModelEntry[] }

function Badges({ model }: { model: ModelEntry }) {
  return <span className="model-badges"><span className="badge">{tiers[model.tier]}</span>{model.supportsVision && <span className="badge">Vision</span>}
    {model.supportsTools ? <span className="badge">Actions</span> : <span className="badge quiet">Chat only</span>}</span>;
}

/**
 * A model listbox (docs/ui-ux-improvements.md UX-55): grouped by provider, each row with its name, a tier badge, and
 * Vision and Actions badges, so the trade-offs scan at a glance. Keyboard: arrows, Home and End, Enter or Space to choose,
 * Esc to close. `missing` names a choice that isn't listed, such as a custom ID or a provider without a key.
 */
export function ModelPicker({ label, value, groups, change, disabled, missing }: {
  label: string; value: ModelSelection; groups: ModelGroup[]; change(model: ModelSelection): void; disabled?: boolean; missing: string;
}) {
  const [open, setOpen] = useState(false), [active, setActive] = useState(0), [up, setUp] = useState(false);
  const id = useId(), root = useRef<HTMLDivElement>(null), list = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null);
  const flat = groups.flatMap(g => g.models), selected = flat.find(m => same(m, value));
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);
  const show = () => {
    // Open upward when the list wouldn't fit below the button but has more room above.
    const box = root.current?.getBoundingClientRect(), below = box ? innerHeight - box.bottom : Infinity;
    setUp(!!box && below < 340 && box.top > below);
    setActive(Math.max(0, flat.findIndex(m => same(m, value)))); setOpen(true);
  };
  const close = () => { setOpen(false); button.current?.focus(); };
  const choose = (i: number) => { const m = flat[i]; if (m && !same(m, value)) change({ provider: m.provider, id: m.id }); close(); };
  const key = (e: KeyboardEvent) => {
    const last = flat.length - 1;
    if (e.key === 'ArrowDown') setActive(i => Math.min(last, i + 1));
    else if (e.key === 'ArrowUp') setActive(i => Math.max(0, i - 1));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(last);
    else if (e.key === 'Enter' || e.key === ' ') choose(active);
    else if (e.key === 'Escape') close();
    else { if (e.key === 'Tab') setOpen(false); return; }
    e.preventDefault();
  };
  let index = 0;
  return <div className="model-picker" ref={root}>
    <button ref={button} type="button" className="model-picker-button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open}
      aria-label={`${label}: ${selected?.label ?? `${value.id}, ${missing}`}`} onClick={() => open ? setOpen(false) : show()}
      onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); show(); } }}>
      <span className="model-name">{selected?.label ?? value.id}</span>{selected ? <Badges model={selected} /> : <span className="badge quiet">{missing}</span>}<ChevronIcon />
    </button>
    {open && <div ref={list} className={`model-list${up ? ' up' : ''}`} role="listbox" tabIndex={-1} aria-label={label} aria-activedescendant={`${id}-${active}`} onKeyDown={key}>
      {groups.map(g => <div key={g.provider} role="group" aria-labelledby={`${id}-${g.provider}`}>
        <div id={`${id}-${g.provider}`} className="model-group">{g.label}</div>
        {g.models.map(m => {
          const i = index++;
          return <div key={m.id} id={`${id}-${i}`} data-index={i} role="option" aria-selected={same(m, value)} className={`model-option${i === active ? ' active' : ''}`}
            onPointerMove={() => { if (i !== active) setActive(i); }} onClick={() => choose(i)}>
            <span className="model-name">{m.label}</span><Badges model={m} /><span className="model-check">{same(m, value) && <CheckIcon />}</span></div>;
        })}
      </div>)}
    </div>}
  </div>;
}
