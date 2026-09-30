import { z } from 'zod';
import { defineTool } from '../define';
import { preview, type ToolResult } from '../types';
import { guideRoles, maxGuideSteps, type GuidePlan } from '../../../shared/guide';
export const guideInput = z.object({
  goal: z.string().trim().min(1).max(120),
  app: z.string().trim().min(1).max(80),
  steps: z.array(z.object({
    instruction: z.string().trim().min(1).max(200),
    target: z.string().trim().min(1).max(80),
    role: z.enum(guideRoles),
  }).strict()).min(1).max(maxGuideSteps),
}).strict();
export function showMeHow(start: (plan: GuidePlan) => ToolResult) {
  return defineTool<GuidePlan>({
    name: 'show_me_how', kind: 'sensitive-read', approvalRequired: true,
    description: `Walk the user through doing something in an app on this computer, one click at a time ("how do I…", "show me how…", "where is…"). Kite flies to each control and points at it; the user clicks it themselves. Kite never clicks, types, or changes anything. Give 1–${maxGuideSteps} steps in order. instruction: one short sentence to say aloud, e.g. "Click the Insert tab.". target: the exact visible label or tooltip of the one control to click, e.g. "Insert", "Footer", "Blank"; never a description or keyboard shortcut. role: the kind of control. Only include steps that click a visible control; if typing follows, say so in the last instruction.`,
    inputSchema: guideInput,
    summarize: ({ goal, app, steps }) => `Guide you through "${preview(goal, 80)}" in ${preview(app, 40)}? ${steps.length} step${steps.length === 1 ? '' : 's'}, starting with "${preview(steps[0].target, 40)}". I'll point at each control and never click. If I can't find one, I'll look at your screen.`,
    execute: async (plan, ctx) => { ctx.signal.throwIfAborted(); return start(plan); },
  });
}
