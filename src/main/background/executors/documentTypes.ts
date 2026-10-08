import type { DocumentKind, OptimizationReport } from '../../../shared/background';

export const documentErrors = {
  invalid: 'This file is corrupt or is not a supported document. Choose a valid PDF, PNG, or JPEG.',
  protected: 'Encrypted or password-protected PDFs are not supported. Export an unprotected copy first.',
  signed: 'Signed PDFs are not optimized because rewriting would invalidate their signatures.',
  interactive: 'This PDF has forms, annotations, scripts, attachments, layers, or external actions. Optimize a plain document copy instead.',
  image: 'Choose an 8-bit RGB/RGBA PNG or RGB/grayscale JPEG. Animated, CMYK, custom-profile, or rotated EXIF images need exporting to a supported image first.',
  limits: 'The document exceeds the limit: 5 MB, 200 PDF pages, or 12 million image pixels.',
  quality: 'The optimized PDF did not preserve its page geometry and content streams. No output was saved.',
  worker: 'The document worker could not finish. Try a smaller supported file or retry the run.',
} as const;
export type DocumentErrorCode = keyof typeof documentErrors;
export class DocumentFailure extends Error {
  constructor(public code: DocumentErrorCode) { super(documentErrors[code]); }
}
export interface DocumentMetadata { kind: Exclude<DocumentKind, 'text'>; pages?: number; width?: number; height?: number }
export interface DocumentOutput { bytes: Uint8Array; pages: number; optimization?: OptimizationReport }
export interface DocumentJob { action: 'inspect' | 'convert' | 'optimize'; kind: Exclude<DocumentKind, 'text'>; bytes: Uint8Array; targetBytes?: number }

