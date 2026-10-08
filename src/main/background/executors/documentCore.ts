// Runs only inside the document utility process in production. No document code, URLs or paths are executed.
import { createHash } from 'node:crypto';
import { PDFDocument, PDFDict, PDFArray, PDFName, PDFRawStream, PDFInvalidObject, type PDFObject } from 'pdf-lib';
import { backgroundLimits } from '../../../shared/background';
import { DocumentFailure, type DocumentJob, type DocumentMetadata, type DocumentOutput } from './documentTypes';

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const fail = (code: ConstructorParameters<typeof DocumentFailure>[0]): never => { throw new DocumentFailure(code); };
const limits = (width: number, height: number) => { if (width < 1 || height < 1 || width > 12_000 || height > 12_000 || width * height > backgroundLimits.imagePixels) fail('limits'); };
const forbidden = new Set(['AcroForm', 'XFA', 'Annots', 'AA', 'OpenAction', 'JS', 'JavaScript', 'EmbeddedFiles', 'EmbeddedFile', 'AF', 'Filespec', 'OCProperties', 'Collection', 'RichMedia', 'Launch', 'GoToR', 'SubmitForm', 'ImportData', 'Sound', 'Movie', '3D']);

export async function plainPdf(bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  if (!b.subarray(0, 5).equals(Buffer.from('%PDF-')) || !b.subarray(-1024).includes(Buffer.from('%%EOF'))) fail('invalid');
  let pdf: PDFDocument;
  try { pdf = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false, throwOnInvalidObject: true, parseSpeed: 100 }); }
  catch (error) { if (error instanceof Error && /encrypted/i.test(error.message)) fail('protected'); fail('invalid'); }
  if (pdf.isEncrypted || pdf.context.trailerInfo.Encrypt) fail('protected');
  const objects = pdf.context.enumerateIndirectObjects(); if (objects.length > 40_000) fail('limits');
  const seen = new Set<PDFObject>();
  const walk = (object: PDFObject, depth = 0) => {
    if (seen.has(object)) return; seen.add(object);
    if (seen.size > 150_000 || depth > 80) fail('limits');
    if (object instanceof PDFInvalidObject) fail('invalid');
    if (object instanceof PDFName) { const name = object.decodeText(); if (name === 'Sig') fail('signed'); if (forbidden.has(name)) fail('interactive'); }
    const dict = object instanceof PDFRawStream ? object.dict : object instanceof PDFDict ? object : null;
    if (object instanceof PDFRawStream && dict.get(PDFName.of('Subtype'))?.toString() === '/Image') {
      const width = Number(pdf.context.lookup(dict.get(PDFName.of('Width')))?.toString()), height = Number(pdf.context.lookup(dict.get(PDFName.of('Height')))?.toString());
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) fail('limits');
      limits(width, height);
    }
    if (dict) for (const [key, value] of dict.entries()) {
      const name = key.decodeText();
      if (name === 'ByteRange' || (name === 'FT' && value.toString() === '/Sig')) fail('signed');
      if (name === 'Encrypt') fail('protected');
      if (name === 'Annots') { const annotations = pdf.context.lookup(value); if (annotations instanceof PDFArray && !annotations.size()) continue; }
      if (forbidden.has(name) || (object instanceof PDFRawStream && name === 'F')) fail('interactive');
      walk(value, depth + 1);
    }
    else if (object instanceof PDFArray) for (let i = 0; i < object.size(); i++) walk(object.get(i), depth + 1);
  };
  // Signature detection precedes form rejection so a signed form gets the precise reason.
  for (const [, object] of objects) if (object instanceof PDFDict && (object.has(PDFName.of('ByteRange')) || object.get(PDFName.of('FT'))?.toString() === '/Sig')) fail('signed');
  for (const [, object] of objects) walk(object);
  let pages: ReturnType<PDFDocument['getPages']>;
  try { pages = pdf.getPages(); } catch { fail('invalid'); }
  if (!pages.length || pages.length > backgroundLimits.pdfPages) fail('limits');
  for (const page of pages) { const box = page.getMediaBox(); if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0 || box.width > 20_000 || box.height > 20_000) fail('limits'); }
  return pdf;
}

function fingerprint(pdf: PDFDocument) {
  const pages = pdf.getPages().map(p => ({ media: p.getMediaBox(), crop: p.getCropBox(), bleed: p.getBleedBox(), trim: p.getTrimBox(), art: p.getArtBox(), rotation: p.getRotation().angle }));
  const streams = pdf.context.enumerateIndirectObjects().flatMap(([, o]) => o instanceof PDFRawStream && !['/ObjStm', '/XRef'].includes(o.dict.get(PDFName.of('Type'))?.toString()) ? [digest(o.contents)] : []).sort();
  return JSON.stringify({ pages, streams });
}

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc(bytes: Uint8Array) { let c = 0xffffffff; for (const byte of bytes) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function pngInfo(bytes: Uint8Array): DocumentMetadata {
  const b = Buffer.from(bytes);
  if (!b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) fail('invalid');
  let width = 0, height = 0, data = false, end = false, chunks = 0;
  for (let offset = 8; offset + 12 <= b.length;) {
    const length = b.readUInt32BE(offset), type = b.subarray(offset + 4, offset + 8).toString('ascii');
    if (length > b.length - offset - 12 || ++chunks > 10_000) fail('invalid');
    const payload = b.subarray(offset + 8, offset + 8 + length);
    if (crc(b.subarray(offset + 4, offset + 8 + length)) !== b.readUInt32BE(offset + 8 + length)) fail('invalid');
    if (type === 'IHDR') {
      if (chunks !== 1 || length !== 13) fail('invalid');
      width = payload.readUInt32BE(0); height = payload.readUInt32BE(4); limits(width, height);
      if (payload[8] !== 8 || ![2, 6].includes(payload[9]) || payload[10] !== 0 || payload[11] !== 0 || payload[12] !== 0) fail('image');
    } else if (['acTL', 'iCCP', 'cHRM', 'eXIf'].includes(type) || (type === 'gAMA' && (length !== 4 || payload.readUInt32BE(0) !== 45455))) fail('image');
    else if (type === 'IDAT') data = true;
    else if (type === 'IEND') { if (length || !width || !data || offset + 12 !== b.length) fail('invalid'); end = true; }
    else if (/^[A-Z]/.test(type) && type !== 'PLTE') fail('image');
    offset += length + 12;
  }
  if (!end) fail('invalid'); return { kind: 'png', width, height };
}
function jpegInfo(bytes: Uint8Array): DocumentMetadata {
  const b = Buffer.from(bytes); if (b[0] !== 255 || b[1] !== 216 || b[b.length - 2] !== 255 || b[b.length - 1] !== 217) fail('invalid');
  let width = 0, height = 0, offset = 2;
  while (offset + 4 <= b.length) {
    if (b[offset++] !== 255) fail('invalid'); while (b[offset] === 255) offset++;
    const marker = b[offset++]; if (marker === 218) break;
    const length = b.readUInt16BE(offset); if (length < 2 || offset + length > b.length) fail('invalid');
    const p = b.subarray(offset + 2, offset + length);
    if ([192, 193, 194].includes(marker)) { if (p.length < 6 || p[0] !== 8 || ![1, 3].includes(p[5])) fail('image'); height = p.readUInt16BE(1); width = p.readUInt16BE(3); limits(width, height); }
    if (marker === 226 && p.subarray(0, 11).toString('ascii') === 'ICC_PROFILE') fail('image');
    if (marker === 225 && p.subarray(0, 6).equals(Buffer.from('Exif\0\0'))) {
      const t = p.subarray(6); if (t.length < 8) fail('invalid');
      const little = t.subarray(0, 2).toString() === 'II', u16 = (i: number) => little ? t.readUInt16LE(i) : t.readUInt16BE(i), u32 = (i: number) => little ? t.readUInt32LE(i) : t.readUInt32BE(i);
      if (!little && t.subarray(0, 2).toString() !== 'MM') fail('invalid');
      const start = u32(4); if (start + 2 > t.length) fail('invalid'); const count = u16(start);
      if (count > 2000 || start + 2 + count * 12 > t.length) fail('invalid');
      for (let i = 0; i < count; i++) { const at = start + 2 + i * 12; if (u16(at) === 274 && (u16(at + 2) !== 3 || u32(at + 4) !== 1 || u16(at + 8) !== 1)) fail('image'); }
    }
    offset += length;
  }
  if (!width) fail('invalid'); return { kind: 'jpeg', width, height };
}

export async function documentJob(job: DocumentJob): Promise<DocumentMetadata | DocumentOutput> {
  if (!(job.bytes instanceof Uint8Array) || job.bytes.length > backgroundLimits.binaryBytes || job.bytes.length < 16) fail('limits');
  // pdf-lib's JPEG reader uses the backing ArrayBuffer; detach from Node's pooled Buffer byte offsets.
  job = { ...job, bytes: new Uint8Array(job.bytes) };
  if (job.kind === 'pdf') {
    const pdf = await plainPdf(job.bytes), pages = pdf.getPageCount();
    if (job.action === 'inspect') return { kind: 'pdf', pages };
    if (job.action !== 'optimize') fail('invalid');
    const before = fingerprint(pdf);
    const candidate = await pdf.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false, objectsPerTick: 100 });
    if (candidate.length > backgroundLimits.outputBytes) fail('limits');
    const verified = await plainPdf(candidate);
    if (before !== fingerprint(verified)) fail('quality');
    const changed = candidate.length < job.bytes.length, bytes = changed ? candidate : job.bytes;
    return { bytes, pages, optimization: { inputBytes: job.bytes.length, candidateBytes: candidate.length, outputBytes: bytes.length, savedBytes: job.bytes.length - bytes.length, changed, ...(job.targetBytes ? { targetBytes: job.targetBytes, targetMet: bytes.length <= job.targetBytes } : {}) } };
  }
  const metadata = job.kind === 'png' ? pngInfo(job.bytes) : jpegInfo(job.bytes);
  if (job.action === 'inspect') return metadata;
  if (job.action !== 'convert') fail('invalid');
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const image = job.kind === 'png' ? await pdf.embedPng(job.bytes) : await pdf.embedJpg(job.bytes);
  if (image.width !== metadata.width || image.height !== metadata.height) fail('quality');
  const page = pdf.addPage([595.28, 841.89]), scale = Math.min(559.28 / image.width, 805.89 / image.height), w = image.width * scale, h = image.height * scale;
  page.drawImage(image, { x: (595.28 - w) / 2, y: (841.89 - h) / 2, width: w, height: h });
  const bytes = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
  await plainPdf(bytes); return { bytes, pages: 1 };
}

