import { documentJob } from './documentCore';
import { DocumentFailure, type DocumentJob } from './documentTypes';

// Exactly one bounded job, launched by main. No secrets, file paths, or document-supplied code are passed.
process.parentPort.once('message', async event => {
  try { process.parentPort.postMessage({ ok: true, result: await documentJob(event.data as DocumentJob) }); }
  catch (error) { process.parentPort.postMessage({ ok: false, code: error instanceof DocumentFailure ? error.code : 'invalid' }); }
});

