import { ranked, links, type FamilyLayout } from './common';
/** Deterministic bounded fallback; production replaces node positions with layered ELK output. */
export const flow: FamilyLayout = script => [...ranked(script, false), ...links(script)];
