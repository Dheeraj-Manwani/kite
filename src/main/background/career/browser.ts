import { BrowserWindow, session } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import type { Applicant, ApplicationObservation, CareerJob } from '../../../shared/career';
import { CareerFailure } from './discovery';

const observationScript = `(() => {
 const form = document.querySelector('#application_form, #application-form, form[action*="apply"], form[action*="application"]');
 const fields = form ? [...form.querySelectorAll('input,textarea,select')].slice(0,100).map(e => ({name:(e.name||e.id).slice(0,160),type:(e.type||e.tagName.toLowerCase()).slice(0,30),required:e.required,label:(e.labels?.[0]?.innerText||'').slice(0,200),options:e.options?[...e.options].slice(0,30).map(o=>(o.value+':'+o.text).slice(0,200)):[]})).filter(e=>e.name) : [];
 const context=document.body.innerText.slice(0,20000);
 return {url:location.href,title:document.title.slice(0,300),context,fields,form:!!form,receipt:!form && /thank you for applying|application (?:has been |was )?(?:received|submitted)|we have received your application/i.test(context)};
})()`;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Slot = { win: BrowserWindow; job: CareerJob; human: boolean; partition: string };
/** Owned Chromium surfaces; no desktop keyboard/mouse automation, preload, Node or caller scripts. */
export class CareerBrowser {
  private slots = new Map<string, Slot>();
  constructor(private onMutation: (id: string, destination: string) => boolean, private testOrigin?: string) {}
  private destination(job: CareerJob) { return this.testOrigin ? `${this.testOrigin}/${job.provider}/${job.board}/${job.id}/apply` : job.url; }
  private networkAllowed(value: string, provider: CareerJob['provider']) {
    try { const u = new URL(value); if (u.username || u.password) return false; if (this.testOrigin && u.origin === this.testOrigin) return true;
      const domains = provider === 'greenhouse' ? ['greenhouse.io'] : ['lever.co', 'levercdn.com'];
      return u.protocol === 'https:' && (domains.some(d => u.hostname === d || u.hostname.endsWith(`.${d}`)) || ['www.google.com', 'www.gstatic.com', 'www.recaptcha.net', 'hcaptcha.com', 'newassets.hcaptcha.com'].includes(u.hostname));
    } catch { return false; }
  }
  private slot(id: string) { const slot = this.slots.get(id); if (!slot || slot.win.isDestroyed()) throw new CareerFailure('Open a fresh application browser and review its current page.'); return slot; }
  async load(id: string, job: CareerJob, signal: AbortSignal) {
    signal.throwIfAborted(); this.close(id);
    if (this.slots.size >= 2) throw new CareerFailure('Close another application browser before preparing this one.');
    const partition = `kite-career-${randomUUID()}`, profile = session.fromPartition(partition);
    const target = this.destination(job), origin = new URL(target).origin;
    profile.setPermissionRequestHandler((_wc, _permission, done) => done(false)); profile.setPermissionCheckHandler(() => false);
    profile.on('will-download', event => event.preventDefault());
    const win = new BrowserWindow({ title: `Kite · ${job.title}`, width: 1050, height: 800, show: false, webPreferences: { session: profile, contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
    const slot: Slot = { win, job, human: false, partition }; this.slots.set(id, slot);
    profile.webRequest.onBeforeRequest((details, done) => {
      let allowed = this.networkAllowed(details.url, job.provider);
      if (allowed && !['GET', 'HEAD', 'OPTIONS'].includes(details.method)) {
        // Human handoff is the only mode that permits a potential external mutation.
        const u = new URL(details.url);
        allowed = slot.human && this.onMutation(id, u.origin + u.pathname);
      }
      done({ cancel: !allowed });
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const navigate = (event: Electron.Event, value: string) => { try { if (new URL(value).origin !== origin || !this.networkAllowed(value, job.provider)) event.preventDefault(); } catch { event.preventDefault(); } };
    win.webContents.on('will-navigate', navigate); win.webContents.on('will-redirect', navigate);
    win.on('closed', () => { if (this.slots.get(id) === slot) this.slots.delete(id); void profile.clearStorageData(); });
    const stop = () => this.close(id); signal.addEventListener('abort', stop, { once: true }); const timer = setTimeout(stop, 25_000);
    try { await win.loadURL(target); signal.throwIfAborted(); return await this.observe(id); }
    catch { signal.throwIfAborted(); throw new CareerFailure('The application page could not load. Use takeover for unsupported/login/CAPTCHA pages, then review a fresh page.'); }
    finally { clearTimeout(timer); signal.removeEventListener('abort', stop); }
  }
  async observe(id: string): Promise<ApplicationObservation> {
    const slot = this.slot(id), raw = await slot.win.webContents.executeJavaScript(observationScript) as { url: string; title: string; context: string; fields: ApplicationObservation['fields']; form: boolean; receipt: boolean };
    const expected = slot.job.provider === 'greenhouse' ? ['first_name', 'last_name', 'email', 'resume'] : ['name', 'email', 'resume'];
    const supported = raw.form && raw.context.toLowerCase().includes(slot.job.title.toLowerCase()) && raw.url.split(/[?#]/)[0] === this.destination(slot.job).split(/[?#]/)[0] && expected.every(name => raw.fields.filter(f => f.name === name).length === 1 && (name === 'resume' ? raw.fields.find(f => f.name === name)?.type === 'file' : ['text','email','tel'].includes(raw.fields.find(f => f.name === name)?.type)));
    return { url: raw.url, title: raw.title, context: raw.context, fields: raw.fields, fingerprint: digest({ url: raw.url, title: raw.title, context: raw.context, fields: raw.fields }), supported, receipt: raw.receipt && new URL(raw.url).origin === new URL(this.destination(slot.job)).origin };
  }
  async prepare(id: string, expected: ApplicationObservation, applicant: Applicant, bytes: Uint8Array, filename: string, signal: AbortSignal) {
    const slot = this.slot(id); if (slot.human || !expected.supported || signal.aborted || bytes.length > 5 * 1024 * 1024) throw new CareerFailure('This page needs manual preparation.');
    const values = slot.job.provider === 'greenhouse' ? { first_name: applicant.firstName, last_name: applicant.lastName, email: applicant.email, phone: applicant.phone } : { name: `${applicant.firstName} ${applicant.lastName}`, email: applicant.email, phone: applicant.phone };
    // Atomically recheck page/field identity before releasing approved personal inputs to that page.
    const script = `(async () => {
      const raw = ${observationScript}; if(JSON.stringify({url:raw.url,title:raw.title,context:raw.context,fields:raw.fields})!==${JSON.stringify(JSON.stringify({ url: expected.url, title: expected.title, context: expected.context, fields: expected.fields }))}) return false;
      const form=document.querySelector('#application_form, #application-form, form[action*="apply"], form[action*="application"]');
      const values=${JSON.stringify(values)};
      const file=form.querySelector('input[name="resume"][type="file"]'); if(!file) return false;
      const data=atob(${JSON.stringify(Buffer.from(bytes).toString('base64'))}); const array=Uint8Array.from(data,c=>c.charCodeAt(0)); const transfer=new DataTransfer(); transfer.items.add(new File([array],${JSON.stringify(filename)},{type:'application/pdf'}));
      for(const [name,value] of Object.entries(values)) { const e=[...form.elements].find(e=>e.name===name); if(e && ['text','email','tel'].includes(e.type)) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); } }
      file.files=transfer.files; file.dispatchEvent(new Event('change',{bubbles:true})); return file.files.length===1 && file.files[0].size===array.length && Object.entries(values).every(([name,value])=>{const e=[...form.elements].find(e=>e.name===name);return !e || e.value===value;});
    })()`;
    const ok = await slot.win.webContents.executeJavaScript(script); signal.throwIfAborted(); if (!ok) throw new CareerFailure('The page or fields changed. Review a fresh application before preparing.');
  }
  show(id: string, allowMutations: boolean) { const slot = this.slot(id); slot.human = allowMutations; slot.win.show(); slot.win.focus(); }
  hide(id: string) { const slot = this.slot(id); slot.human = false; slot.win.hide(); }
  has(id: string) { return !!this.slots.get(id) && !this.slots.get(id).win.isDestroyed(); }
  close(id: string) { const slot = this.slots.get(id); if (slot) { this.slots.delete(id); if (!slot.win.isDestroyed()) slot.win.destroy(); } }
  closeAll() { for (const id of this.slots.keys()) this.close(id); }
}
