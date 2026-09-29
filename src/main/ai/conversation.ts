import type { UserContent } from 'ai';
export type ChatMessage = { role: 'user'; content: UserContent } | { role: 'assistant'; content: string };
export class Conversation {
  private messages: ChatMessage[] = [];
  private lastActivity = 0;
  private conversationId: string | undefined;
  constructor(private createId: () => string, private limit = 10, private inactivityMs = 300_000) {}
  reset() { this.messages = []; this.conversationId = undefined; this.lastActivity = 0; }
  begin(now: number): { id: string; fresh: boolean } {
    const fresh = !this.conversationId || now - this.lastActivity >= this.inactivityMs;
    if (fresh) { this.messages = []; this.conversationId = this.createId(); }
    this.lastActivity = now;
    return { id: this.conversationId as string, fresh };
  }
  add(message: ChatMessage, now: number) {
    this.messages.push({ ...message });
    this.messages = this.messages.slice(-this.limit);
    this.lastActivity = now;
  }
  scrubImages(answer: string, markTypes = 'screen capture', content?: ChatMessage['content']) {
    this.messages = this.messages.map(m => m.role === 'user' && (content === undefined || m.content === content) && Array.isArray(m.content) && m.content.some(p => p.type === 'image')
      ? { role: 'user', content: `[User shared a screenshot with a ${markTypes}. Kite's answer: ${answer || 'Interrupted before an answer.'}]` } : m);
  }
  context(): ChatMessage[] { return this.messages.map(message => ({ ...message })); }
}
