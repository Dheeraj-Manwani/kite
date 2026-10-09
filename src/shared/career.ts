import { z } from 'zod';

export const careerBoardSchema = z.object({ provider: z.enum(['greenhouse', 'lever']), board: z.string().trim().regex(/^[A-Za-z0-9_-]{1,80}$/), region: z.enum(['global', 'eu']).default('global') }).strict().transform(v => ({ ...v, region: v.provider === 'greenhouse' ? 'global' as const : v.region }));
export const careerOptionsSchema = z.object({ boards: z.array(careerBoardSchema).min(1).max(4), keywords: z.string().trim().max(120).default(''), location: z.string().trim().max(120).default(''), maxJobs: z.number().int().min(1).max(20).default(10) }).strict();
export type CareerBoard = z.infer<typeof careerBoardSchema>;
export type CareerOptions = z.infer<typeof careerOptionsSchema>;
export const applicantSchema = z.object({ firstName: z.string().trim().min(1).max(80), lastName: z.string().trim().min(1).max(80), email: z.string().email().max(200), phone: z.string().trim().max(60).default('') }).strict();
export type Applicant = z.infer<typeof applicantSchema>;
export interface CareerJob extends CareerBoard { key: string; id: string; title: string; location: string; description: string; url: string }
export interface CareerShortlist { fetchedAt: number; jobs: CareerJob[]; scanned: number; truncated: boolean; criteria: CareerOptions }
export interface ApplicationObservation { url: string; title: string; context: string; fields: { name: string; type: string; required: boolean; label: string; options: string[] }[]; fingerprint: string; supported: boolean; receipt: boolean }
export interface JobApplication { job: CareerJob; applicant?: Applicant; resume?: {name:string;bytes:number;hash:string}; observation?: ApplicationObservation; preparedAt?: number; mutation?: { at: number; destination: string }; receipt?: { at: number; url: string; title: string }; outcome?: 'prepared' | 'uncertain' | 'acknowledged' }
export const jobUrl = (job: Pick<CareerJob, 'provider' | 'board' | 'id' | 'region'>) => job.provider === 'greenhouse' ? `https://job-boards.greenhouse.io/${job.board}/jobs/${job.id}` : `https://jobs.${job.region === 'eu' ? 'eu.' : ''}lever.co/${job.board}/${job.id}/apply`;
