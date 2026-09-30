import { hotkeyLabel, type Modifier } from '../../shared/release';

/** The user's shortcut as keycaps, so instructions always match what they set (UX-52). */
export function Keycaps({ keys }: { keys: readonly Modifier[] }) {
  return <span className="keycaps" aria-label={hotkeyLabel(keys)}>{keys.map(key => <kbd key={key} className="keycap">{hotkeyLabel([key])}</kbd>)}</span>;
}
