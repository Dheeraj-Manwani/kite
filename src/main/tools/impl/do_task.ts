import { z } from 'zod';
import { defineTool } from '../define';
import { preview, type ToolResult } from '../types';
import { maxTaskSteps, type TaskScope } from '../../../shared/agent';
export const taskInput = z.object({ goal: z.string().trim().min(3).max(300), app: z.string().trim().min(1).max(80) }).strict();
export type TaskInput = z.infer<typeof taskInput>;
export function doTask(start: (task: TaskInput, scope: TaskScope) => ToolResult, vision: boolean) {
  return defineTool<TaskInput>({
    name: 'do_task', kind: 'action', approvalRequired: true, inputSchema: taskInput,
    description: `Do a multi-step task for the user inside one app on this computer by operating its controls: clicking buttons, menus and tabs, typing into fields, and pressing shortcuts. Examples: "write a shopping list in Notepad and save it as list.txt", "turn on dark mode in Settings", "search for flights to Goa in Microsoft Edge". Use it when the user asks you to do something in an app; for "how do I…" use show_me_how instead. goal: the complete outcome in one sentence, including any exact text to type and file names. app: the app to use, e.g. "Notepad", "Microsoft Edge", "Settings". Kite opens the app if needed, never moves the user's mouse, confirms risky steps with the user, and stops after ${maxTaskSteps} steps. Only call it for a task the user asked for. After calling, reply with one short sentence such as "On it!"`,
    summarize: ({ goal, app }) => `Let me do this in ${preview(app, 40)}: "${preview(goal, 120)}"? I'll click and type in ${preview(app, 40)} only, never move your mouse, ask before anything that sends, deletes, buys, or submits, and stop after ${maxTaskSteps} steps.${vision ? ` I may look at its window.` : ''}`,
    execute: async (input, ctx) => { ctx.signal.throwIfAborted(); return start(input, ctx.scope ?? 'task'); },
  });
}
