import { ranked, links, type FamilyLayout } from './common';
export const tree: FamilyLayout = script => [...ranked(script, true), ...links(script)];
