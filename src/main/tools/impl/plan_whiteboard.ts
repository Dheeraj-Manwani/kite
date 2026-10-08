import { z } from 'zod';
import { defineTool } from '../define';
import { preview, type ToolContext, type ToolResult } from '../types';
import type { BoardRequest } from '../../board/planner';
export const boardRequestInput = z.object({ topic: z.string().trim().min(1).max(500), focus: z.string().trim().max(300).optional(),
  level: z.enum(['beginner', 'intermediate', 'advanced']).optional(), mode: z.enum(['new', 'add']) });
export const structuredWhiteboardDescription = 'Prefer this for concept, process, protocol and system explanations, comparisons and architectures. topic: a short phrase (2–8 words). focus: only the specific detail requested. level: only when the user specifies it. mode: new topic or add to this board. A specialist plans and narrates the picture. Call immediately without an introduction; write nothing else.';
export function planWhiteboard(plan: (request: BoardRequest, context: ToolContext) => Promise<ToolResult>, teaching = false) {
  return defineTool<BoardRequest>({ name: 'explain_on_whiteboard', kind: 'info', endsTurn: true, inputSchema: boardRequestInput,
    description: structuredWhiteboardDescription + (teaching ? ' Preserve teach-me or quiz intent in topic. Use mode new for a drill-down child board; add for simpler, examples, summaries or feedback on a quiz answer.' : ''), summarize: input => `${input.mode === 'add' ? 'Add to' : 'Draw'} the whiteboard: ${preview(input.topic, 80)}`,
    execute: plan });
}
