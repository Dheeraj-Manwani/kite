import { grid, links, type FamilyLayout } from './common';
export const compare: FamilyLayout = script => [...grid(script.nodes.filter(n => !n.group), 2, 180), ...links(script)];
