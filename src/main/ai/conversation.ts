export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export class Conversation {
  private messages: ChatMessage[] = [];
  private lastActivity = 0;
  private conversationId: string | undefined;
  constructor(private createId: () => string, private limit = 10, private inactivityMs = 300_000) {}
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
  context(): ChatMessage[] { return this.messages.map(message => ({ ...message })); }
}
