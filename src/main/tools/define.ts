import type { ToolDefinition } from './types';
/** All entry points, including direct invocations in tests, validate and honor dry-run. */
export function defineTool<T>(definition: ToolDefinition<T>): ToolDefinition {
  return { ...definition, summarize: input => definition.summarize(definition.inputSchema.parse(input)),
    execute: async (input, ctx) => {
      const parsed = definition.inputSchema.parse(input); ctx.signal.throwIfAborted();
      if (ctx.dryRun) return { ok: true, dryRun: true, message: `Dry run: ${definition.summarize(parsed)} No action was performed.` };
      return definition.execute(parsed, ctx);
    } } as ToolDefinition;
}
