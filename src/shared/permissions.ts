/**
 * Permissions for tasks and jobs (docs/end-to-end-jobs.md §3.5, ADR 014): every step Kite takes falls in a category
 * decided by code, and the user's settings say, per category, Allow, Ask or Don't allow. Four modes are presets of that
 * table. A small floor asks in every mode, and secrets are never typed. Pure and shared: the task session resolves
 * steps with it, Settings and the task card describe it.
 */
export const categories = ['look', 'fill', 'add', 'saved', 'submit', 'send', 'money', 'delete', 'system'] as const;
export type Category = typeof categories[number];
export type Permission = 'allow' | 'ask' | 'never';
export const permissionModes = ['ask', 'balanced', 'handsOff', 'custom'] as const;
export type PermissionMode = typeof permissionModes[number];
/** A rule for one website or app ("place"): a host such as "shop.example.in", or "app:" and an app's process name. */
export interface PlaceRule { place: string; category: Category; permission: Permission }
export interface PermissionSettings {
  mode: PermissionMode;
  /** The table used in Custom mode. Changing any row switches to Custom, starting from the mode's table. */
  custom: Record<Category, Permission>;
  /** Hands-off and "Allow" for Spend money still ask above this many rupees. 0: every payment asks. */
  spendLimit: number;
  rules: PlaceRule[];
}
/** What the user sees: the category's name, examples, and what Kite says it won't do when it is "Don't allow". */
export const categoryInfo: Record<Category, { label: string; examples: string; verb: string }> = {
  look: { label: 'Look around', examples: 'Open the app or site, scroll, search, read the page', verb: 'look around' },
  fill: { label: 'Fill in', examples: 'Type in search boxes and ordinary fields, pick options, change quantity', verb: 'fill things in' },
  add: { label: 'Add or save', examples: 'Add to cart or wishlist, save a draft, save a file', verb: 'add or save things' },
  saved: { label: 'Use saved info', examples: 'Type your saved address, phone or email', verb: 'use your saved info' },
  submit: { label: 'Submit', examples: 'Submit forms, book a slot, sign up, apply a coupon', verb: 'submit forms' },
  send: { label: 'Send as you', examples: 'Send messages and emails, post, comment, review', verb: 'send things as you' },
  money: { label: 'Spend money', examples: 'Check out, place an order, pay, subscribe, top up', verb: 'spend money' },
  delete: { label: 'Delete or overwrite', examples: 'Delete files, mail or items; overwrite; empty a cart; close without saving', verb: 'delete or overwrite things' },
  system: { label: 'Accounts and system', examples: 'Sign out, account settings, install or uninstall, run commands', verb: 'change accounts or system settings' },
};
export const modeInfo: Record<PermissionMode, { label: string; summary: string }> = {
  ask: { label: 'Ask every time', summary: 'Kite asks before every step.' },
  balanced: { label: 'Balanced', summary: 'Kite looks, fills in and adds to carts on its own, and asks before it submits, sends, spends, deletes, or changes accounts.' },
  handsOff: { label: 'Hands-off', summary: 'Kite does the job without asking. It still asks before spending above your limit, before leaving the job’s site, and before running commands.' },
  custom: { label: 'Custom', summary: 'Your own choice for each kind of step.' },
};
/** What the approval card promises about asking, in the user's current mode: "…never move your mouse, <this>, and stop…". */
export function askingPromise(settings: PermissionSettings): string {
  if (settings.mode === 'ask') return 'ask before every step';
  if (settings.mode === 'handsOff') return 'ask only before spending above your limit, leaving the site, or running commands';
  if (settings.mode === 'custom') return 'ask when your permission settings say so';
  return 'ask before anything that sends, deletes, buys, or submits';
}
const table = (allowed: Category[]): Record<Category, Permission> => Object.fromEntries(categories.map(c => [c, allowed.includes(c) ? 'allow' : 'ask'])) as Record<Category, Permission>;
export const presets: Record<Exclude<PermissionMode, 'custom'>, Record<Category, Permission>> = {
  ask: table([]), balanced: table(['look', 'fill', 'add', 'saved']), handsOff: table([...categories]),
};
export const defaultPermissions: PermissionSettings = { mode: 'balanced', custom: { ...presets.balanced }, spendLimit: 0, rules: [] };
export const maxSpendLimit = 10_000_000;
export const permissionTable = (settings: PermissionSettings) => settings.mode === 'custom' ? settings.custom : presets[settings.mode];

/** Categories a job of each kind may use; anything else asks in every mode (an email during a shopping job). */
export const jobCategories: Record<'store' | 'form', Category[]> = {
  store: ['look', 'fill', 'add', 'saved', 'submit', 'money', 'delete'],
  form: ['look', 'fill', 'add', 'saved', 'submit'],
};

const hostPattern = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/, appPattern = /^app:[a-z0-9._ -]{1,60}$/;
/** Where a step happens: the page's host for a web page, else the app's process ("app:notepad"). */
export function placeOf(host: string | null | undefined, process: string | null | undefined): string | null {
  if (host && hostPattern.test(host)) return host;
  const name = (process ?? '').trim().toLowerCase().replace(/\.exe$/, '');
  return name && appPattern.test(`app:${name}`) ? `app:${name}` : null;
}
/** "shop.example.in", or the app's name for an app place. */
export const placeLabel = (place: string) => place.startsWith('app:') ? place.slice(4) : place;
const placeMatches = (rule: string, place: string) => rule === place || (!rule.startsWith('app:') && place.endsWith('.' + rule));
/** The user's rule for this category here, if any; the most specific place wins. */
export function ruleFor(settings: PermissionSettings, category: Category, place: string | null): PlaceRule | null {
  if (!place) return null;
  return settings.rules.filter(r => r.category === category && placeMatches(r.place, place)).sort((a, b) => b.place.length - a.place.length)[0] ?? null;
}
/** Settings after the user said "always" or "never" for a category: here (a rule) or everywhere (the table, in Custom). */
export function remember(settings: PermissionSettings, category: Category, permission: Permission, place: string | null): PermissionSettings {
  if (place) return { ...settings, rules: [...settings.rules.filter(r => !(r.place === place && r.category === category)), { place, category, permission }].slice(-100) };
  return { ...settings, mode: 'custom', custom: { ...permissionTable(settings), [category]: permission },
    // "Always, everywhere" is the user's newest word for this category: rules that said otherwise go.
    rules: settings.rules.filter(r => r.category !== category || r.permission === permission) };
}
/** A row changed in Settings: Custom mode, starting from the current table. */
export const withCategory = (settings: PermissionSettings, category: Category, permission: Permission): PermissionSettings =>
  ({ ...settings, mode: 'custom', custom: { ...permissionTable(settings), [category]: permission } });

/** Validate settings that arrive over IPC; null when anything is off. */
export function validPermissions(value: unknown): PermissionSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v).sort().join(',');
  if (keys !== 'custom,mode,rules,spendLimit') return null;
  if (!permissionModes.includes(v.mode as PermissionMode)) return null;
  const custom = v.custom as Record<string, unknown>;
  if (!custom || typeof custom !== 'object' || Array.isArray(custom) || Object.keys(custom).length !== categories.length
    || !categories.every(c => ['allow', 'ask', 'never'].includes(custom[c] as string))) return null;
  if (typeof v.spendLimit !== 'number' || !Number.isFinite(v.spendLimit) || v.spendLimit < 0 || v.spendLimit > maxSpendLimit) return null;
  if (!Array.isArray(v.rules) || v.rules.length > 100) return null;
  const rules: PlaceRule[] = [];
  for (const r of v.rules as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object' || Object.keys(r).sort().join(',') !== 'category,permission,place') return null;
    if (typeof r.place !== 'string' || !(hostPattern.test(r.place) || appPattern.test(r.place))) return null;
    if (!categories.includes(r.category as Category) || !['allow', 'ask', 'never'].includes(r.permission as string)) return null;
    rules.push({ place: r.place, category: r.category as Category, permission: r.permission as Permission });
  }
  return { mode: v.mode as PermissionMode, custom: { ...custom } as Record<Category, Permission>, spendLimit: Math.round(v.spendLimit), rules };
}

/** One step, classified by code (agent.ts `classifyStep`). `reason` is empty for a routine step. */
export interface StepClass {
  category: Category;
  reason: string;
  /** In every mode: "command" always asks (terminals, Run); "secret" is never done (passwords, card numbers). */
  floor?: 'command' | 'secret';
}
export interface StepContext {
  place: string | null;
  /** The total on the page, in rupees, read by code; null when it can't be read. Used for Spend money. */
  amount?: number | null;
  /** The choice made when the job started: hands-off or step by step for this job only. */
  override?: 'handsOff' | 'stepByStep' | null;
  /** A job's categories; others ask in every mode. Null for a plain task. */
  allowed?: Category[] | null;
}
export interface Resolution {
  permission: Permission; category: Category; reason: string;
  /** True when the floor decided: "Always" could not stop this question, so the card doesn't offer it. */
  floor: boolean;
  /** The user's own setting for this step before any per-job choice: what "Always" would change. */
  base: Permission;
}
export const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
/**
 * Allow, ask, or never, for one step. Order: secrets are never typed; then the user's setting (a rule for this place,
 * else the mode's table), changed by the job's start choice except where the user said Don't allow; then the floor,
 * which turns an Allow into a question: commands, steps outside the job's categories, and money above the limit or
 * of unknown amount.
 */
export function resolve(step: StepClass, settings: PermissionSettings, context: StepContext): Resolution {
  const { category } = step;
  if (step.floor === 'secret') return { permission: 'never', category, reason: step.reason, floor: true, base: 'never' };
  const base = ruleFor(settings, category, context.place)?.permission ?? permissionTable(settings)[category];
  let permission = base;
  if (permission !== 'never' && context.override === 'handsOff') permission = 'allow';
  if (permission !== 'never' && context.override === 'stepByStep') permission = 'ask';
  if (permission === 'never') return { permission, category, reason: `Your settings say I don’t ${categoryInfo[category].verb}${context.place && ruleFor(settings, category, context.place) ? ` on ${placeLabel(context.place)}` : ''}.`, floor: false, base };
  let floor: string | null = null;
  if (step.floor === 'command') floor = step.reason;
  else if (context.allowed && !context.allowed.includes(category)) floor = `This would ${categoryInfo[category].verb}, which isn’t part of this job.`;
  else if (category === 'money') {
    const limit = settings.spendLimit, amount = context.amount ?? null;
    if (amount === null) floor = `This may spend money, and I can’t read the total on this page.`;
    else if (amount > limit) floor = `This may spend money: the total here is ${rupees(amount)}${limit > 0 ? `, above your limit of ${rupees(limit)}` : ''}.`;
  }
  if (permission === 'allow' && !floor) return { permission, category, reason: step.reason, floor: false, base };
  return { permission: 'ask', category, reason: floor ?? step.reason, floor: !!floor, base };
}
