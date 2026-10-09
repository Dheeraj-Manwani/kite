import type { CareerOptions, CareerShortlist, CareerJob, CareerBoard } from '../../../shared/career';
import type { DelegationBudget } from '../../../shared/schedules';
import { jobUrl } from '../../../shared/career';
import { mailText } from '../../connectors/mail/content';

export class CareerFailure extends Error {}
export function boardsFromAlerts(text: string): CareerBoard[] {
  const boards = new Map<string, CareerBoard>();
  for (const match of text.matchAll(/https:\/\/[^\s<>"']{1,400}/g)) {
    let u: URL; try { u = new URL(match[0]); } catch { continue; }
    if (u.username || u.password || u.port) continue;
    const pieces = u.pathname.split('/').filter(Boolean), board = pieces[0]; if (!/^[A-Za-z0-9_-]{1,80}$/.test(board ?? '')) continue;
    let value: CareerBoard;
    if (['boards.greenhouse.io', 'job-boards.greenhouse.io'].includes(u.hostname) && pieces[1] === 'jobs' && /^\d+$/.test(pieces[2] ?? '')) value = { provider: 'greenhouse', board, region: 'global' };
    else if (['jobs.lever.co', 'jobs.eu.lever.co'].includes(u.hostname) && /^[A-Za-z0-9-]{1,100}$/.test(pieces[1] ?? '')) value = { provider: 'lever', board, region: u.hostname === 'jobs.eu.lever.co' ? 'eu' : 'global' };
    else continue;
    boards.set(`${value.provider}:${value.region}:${value.board}`, value); if (boards.size >= 4) break;
  }
  return [...boards.values()];
}
export class CareerDiscovery {
  constructor(private transport: typeof fetch = fetch) {}
  async discover(options: CareerOptions, signal: AbortSignal, delegation?: { budget: DelegationBudget; check(): void; progress(budget: DelegationBudget): void }): Promise<CareerShortlist> {
    signal.throwIfAborted();
    const jobs: CareerJob[] = [], seen = new Set<string>(); let scanned = 0, truncated = false;
    const budget: DelegationBudget = structuredClone(delegation?.budget ?? { maxChildren: options.boards.length, concurrency: 2, maxBytes: 32 * 1024 * 1024, bytes: 0, deadline: Date.now() + 120_000, modelCalls: 0, children: [] });
    if (budget.children.length + options.boards.length > budget.maxChildren || budget.maxChildren > 4 || budget.concurrency < 1 || budget.concurrency > 2 || budget.maxBytes > 32 * 1024 * 1024 || budget.modelCalls !== 0 || Date.now() >= budget.deadline) throw new CareerFailure('The shared discovery budget is exhausted. Start a new reviewed run.');
    const controller = new AbortController(), stopAll = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(Math.max(1, budget.deadline - Date.now()))]);
    const checkpoint = () => { stopAll.throwIfAborted(); delegation?.check(); delegation?.progress(structuredClone(budget)); };
    const dataByBoard: unknown[] = new Array(options.boards.length);
    let cursor = 0;
    const readBoard = async (board: CareerBoard) => {
      checkpoint();
      const child = { id: `board-${budget.children.length + 1}`, name: `${board.provider}/${board.board}`, status: 'running' as 'running' | 'succeeded' | 'failed', bytes: 0 };
      budget.children.push(child); checkpoint();
      signal.throwIfAborted();
      const url = board.provider === 'greenhouse' ? `https://boards-api.greenhouse.io/v1/boards/${board.board}/jobs?content=true` : `https://api.${board.region === 'eu' ? 'eu.' : ''}lever.co/v0/postings/${board.board}?mode=json&limit=500`;
      const stop = AbortSignal.any([stopAll, AbortSignal.timeout(20_000)]);
      let data: unknown;
      try {
        const response = await this.transport(url, { method: 'GET', redirect: 'error', signal: stop, credentials: 'omit' });
        if (!response.ok) throw new CareerFailure('The job board is unavailable. Check its company token and region.');
        const reader = response.body?.getReader(); if (!reader) throw new CareerFailure('The job board returned no data.');
        const chunks: Uint8Array[] = []; let size = 0;
        try { for (;;) { stop.throwIfAborted(); const next = await reader.read(); if (next.done) break; size += next.value.length; budget.bytes += next.value.length; child.bytes += next.value.length; if (budget.bytes > budget.maxBytes) throw new CareerFailure('The shared discovery byte budget is exhausted.'); if (size > 8 * 1024 * 1024) throw new CareerFailure('The board exceeds the 8 MB discovery limit. Narrow the selected boards.'); chunks.push(next.value); } } finally { await reader.cancel().catch((): void => undefined); }
        data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch (error) { child.status = 'failed'; if (!stopAll.aborted) checkpoint(); stopAll.throwIfAborted(); if (error instanceof CareerFailure) throw error; throw new CareerFailure('Job discovery could not finish. Check your connection and board settings.'); }
      child.status = 'succeeded'; checkpoint(); return data;
    };
    const worker = async () => { while (cursor < options.boards.length) { const index = cursor++; dataByBoard[index] = await readBoard(options.boards[index]); } };
    const workers = Array.from({ length: Math.min(budget.concurrency, options.boards.length) }, () => worker().catch(error => { controller.abort(error); throw error; }));
    const outcomes = await Promise.allSettled(workers); const failed = outcomes.find(o => o.status === 'rejected');
    if (failed?.status === 'rejected') throw controller.signal.reason ?? failed.reason;
    checkpoint();
    // Merge in the frozen board order, regardless of completion order. Children cannot widen targets or recurse.
    for (let index = 0; index < options.boards.length; index++) {
      const board = options.boards[index], data = dataByBoard[index];
      const rows = board.provider === 'greenhouse' ? (data as { jobs?: unknown[] })?.jobs : data;
      if (!Array.isArray(rows) || rows.length > 5000) throw new CareerFailure('The job board returned unsupported or excessive data.');
      if (rows.length > 500 || (board.provider === 'lever' && rows.length === 500)) truncated = true;
      for (const value of rows.slice(0, 500)) {
        signal.throwIfAborted(); const row = value as { id?: unknown; title?: unknown; text?: unknown; location?: {name?:unknown}; categories?: {location?:unknown}; content?: unknown; descriptionPlain?: unknown };
        const id = String(row?.id ?? ''); if (!/^[A-Za-z0-9-]{1,100}$/.test(id) || (board.provider === 'greenhouse' && !/^\d+$/.test(id))) continue;
        scanned++;
        const clean = (text: unknown, max: number) => mailText(text, max).replace(/<[^>]*>/g, ' ').replace(/&(?:amp|lt|gt|quot|nbsp);/g, ' ').replace(/\s+/g, ' ').trim();
        const title = clean(board.provider === 'greenhouse' ? row.title : row.text, 300), location = clean(board.provider === 'greenhouse' ? row.location?.name : row.categories?.location, 300), description = clean(board.provider === 'greenhouse' ? row.content : row.descriptionPlain, 3500);
        const terms = options.keywords.toLowerCase().split(/[ ,]+/).filter(Boolean);
        if (!title || terms.some(term => !`${title} ${description}`.toLowerCase().includes(term)) || !location.toLowerCase().includes(options.location.toLowerCase())) continue;
        const key = `${board.provider}:${board.region}:${board.board}:${id}`; if (seen.has(key)) continue; seen.add(key);
        if (jobs.length >= options.maxJobs) { truncated = true; continue; }
        jobs.push({ ...board, id, key, title, location, description, url: jobUrl({ ...board, id }) });
      }
    }
    signal.throwIfAborted(); return { fetchedAt: Date.now(), jobs, scanned, truncated, criteria: options };
  }
}
export const shortlistText = (list: CareerShortlist) => ['Career Scout', `Fetched: ${new Date(list.fetchedAt).toISOString()}`, `Title/description keywords (all): ${list.criteria.keywords || 'any'}; location contains: ${list.criteria.location || 'any'}`, `${list.jobs.length} matches from ${list.scanned} scanned jobs.${list.truncated ? ' Limits applied; this is not an exhaustive shortlist.' : ''}`, 'Literal filters, not an AI assessment or employment recommendation.', ...list.jobs.flatMap((j, i) => [`\n${i + 1}. ${j.title}`, `${j.board} · ${j.location} · ${j.provider}`, j.url, j.description])].join('\n');
