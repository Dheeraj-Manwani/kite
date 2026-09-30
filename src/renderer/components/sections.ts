/** Settings sections, in sidebar order (docs/ui-ux-improvements.md UX-50). Kept apart so the sidebar never loads the Settings chunk. */
export type Section = 'general' | 'models' | 'voice' | 'privacy' | 'actions' | 'about';
export const sections: { id: Section; label: string }[] = [
  { id: 'general', label: 'General' }, { id: 'models', label: 'Models & keys' }, { id: 'voice', label: 'Voice' },
  { id: 'privacy', label: 'Screen & privacy' }, { id: 'actions', label: 'Actions & trust' }, { id: 'about', label: 'About' },
];
