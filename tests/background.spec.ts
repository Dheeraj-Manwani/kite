import { describe, it, expect } from 'vitest';
import { agentDraftSchema, answerRunSchema, startRunSchema, runControlSchema, backgroundLimits } from '../src/shared/background';
import { textPdfHtml } from '../src/main/background/executors/text';
import { inspectPdf } from '../src/main/background/artifacts';

const id = 'a0c72120-666a-4d21-8f73-c082d7bcdd7b';
describe('background capability boundary', () => {
  it('accepts supported requests and rejects paths, shell commands, unknown workflows and oversized input', () => {
    expect(startRunSchema.safeParse({ requestId: id, title: 'PDF', text: 'hello' }).success).toBe(true);
    for (const extra of [{ path: 'C:\\private.txt' }, { command: 'powershell' }, { fileIds: ['../../secret'] }]) expect(startRunSchema.safeParse({ requestId: id, title: 'PDF', ...extra }).success).toBe(false);
    expect(startRunSchema.safeParse({ requestId: id, title: 'PDF', text: 'x'.repeat(backgroundLimits.textChars + 1) }).success).toBe(false);
    expect(agentDraftSchema.safeParse({ name: 'Agent', instructions: '', style: 'readable', workflow: 'shell' }).success).toBe(false);
    expect(runControlSchema.safeParse({ runId: id, expectedRevision: 0, action: 'cancel' }).success).toBe(false);
    expect(answerRunSchema.safeParse({ runId: id, requestId: id, expectedRevision: 1, text: 'text', path: 'secret' }).success).toBe(false);
  });
  it('prints hostile markup as source, with no executable or network content', () => {
    const html = textPdfHtml('a<script>.md', '<script>alert(1)</script>\n<img src="https://example.com/private">', 'compact');
    expect(html).not.toContain('<script>'); expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;'); expect(html).toContain("default-src 'none'"); expect(html).toContain('10pt');
  });
  it('refuses truncated and page-less converter output', () => {
    expect(() => inspectPdf(new Uint8Array([1, 2, 3]))).toThrow();
    expect(() => inspectPdf(Buffer.from('%PDF-1.7\n' + 'x'.repeat(100) + '%%EOF'))).toThrow();
  });
});
