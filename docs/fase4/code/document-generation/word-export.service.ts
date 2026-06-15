// Doel in apps/api: src/modules/document-generation/word-export.service.ts
//
// HTML → Word (.docx) via html-docx-js. Levert een Buffer voor opslag/download.

import { Injectable } from '@nestjs/common';
// @ts-expect-error — html-docx-js heeft geen volledige types; asBlob bestaat in Node als Buffer.
import * as htmlDocx from 'html-docx-js';

@Injectable()
export class WordExportService {
  /** Wikkel de body-HTML in een minimaal document en converteer naar .docx-buffer. */
  async htmlToDocx(html: string, opts?: { stylesCss?: string }): Promise<Buffer> {
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8">${
      opts?.stylesCss ? `<style>${opts.stylesCss}</style>` : ''
    }</head><body>${html}</body></html>`;
    // html-docx-js asBlob() geeft in Node een Buffer terug.
    const out = htmlDocx.asBlob(doc) as Buffer;
    return Buffer.isBuffer(out) ? out : Buffer.from(out as unknown as ArrayBuffer);
  }
}
