// HTML → Word (.docx) via html-docx-js. Levert een Buffer voor opslag/download.
//
// NB: `@types/html-docx-js` levert de typedeclaraties, dus geen @ts-expect-error nodig.
// HTML-opschoning (grid/flex → tabellen, rem/em → pt, etc.) geport uit de App-bron
// zodat Word de output redelijk weergeeft.

import { Injectable, Logger } from '@nestjs/common';
import * as htmlDocx from 'html-docx-js';

@Injectable()
export class WordExportService {
  private readonly logger = new Logger(WordExportService.name);

  /** Wikkel de (opgeschoonde) body-HTML in een minimaal document en converteer naar .docx-buffer. */
  async htmlToDocx(html: string, opts?: { stylesCss?: string }): Promise<Buffer> {
    const cleaned = this.prepareHtmlForWord(html);
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8">${
      opts?.stylesCss ? `<style>${opts.stylesCss}</style>` : ''
    }</head><body>${cleaned}</body></html>`;

    // html-docx-js asBlob() geeft in Node een Buffer terug; in de browser een Blob.
    const out = htmlDocx.asBlob(doc) as Buffer | Blob;
    if (Buffer.isBuffer(out)) {
      this.logger.log(`Word-document gegenereerd: ${out.length} bytes`);
      return out;
    }
    const arrayBuffer = await (out as Blob).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Prepare HTML for Word conversion — removes unsupported elements and adjusts styling.
   */
  private prepareHtmlForWord(html: string): string {
    let cleaned = html;

    // Remove page-break divs (Word handles page breaks differently)
    cleaned = cleaned.replace(/<div class="page-break"><\/div>/gi, '');

    // Convert CSS grid/flex photo grids to tables for better Word compatibility
    cleaned = this.convertPhotoGridToTable(cleaned);

    // Remove navigation links from the TOC (links don't work the same in Word)
    cleaned = cleaned.replace(/<nav class="toc">[\s\S]*?<\/nav>/gi, (match) => {
      return match.replace(/<a[^>]*>/gi, '').replace(/<\/a>/gi, '');
    });

    // Add Word-specific styles
    cleaned = this.addWordStyles(cleaned);

    // Clean up remaining unsupported CSS
    cleaned = this.cleanCssForWord(cleaned);

    return cleaned;
  }

  /** Convert photo grid divs to 2-column tables for Word compatibility. */
  private convertPhotoGridToTable(html: string): string {
    return html.replace(/<div class="photo-grid">([\s\S]*?)<\/div>/gi, (_match, content) => {
      const imgRegex = /<img[^>]*>/gi;
      const images: string[] = [];
      let imgMatch: RegExpExecArray | null;

      while ((imgMatch = imgRegex.exec(content)) !== null) {
        images.push(imgMatch[0]);
      }

      if (images.length === 0) return '';

      let tableHtml = '<table style="width: 100%; border-collapse: collapse;">';
      for (let i = 0; i < images.length; i += 2) {
        tableHtml += '<tr>';
        tableHtml += `<td style="width: 50%; padding: 5pt; vertical-align: top;">${images[i]}</td>`;
        if (images[i + 1]) {
          tableHtml += `<td style="width: 50%; padding: 5pt; vertical-align: top;">${images[i + 1]}</td>`;
        } else {
          tableHtml += '<td style="width: 50%;"></td>';
        }
        tableHtml += '</tr>';
      }
      tableHtml += '</table>';
      return tableHtml;
    });
  }

  /** Add Word-specific style overrides. */
  private addWordStyles(html: string): string {
    const wordStyles = `
      <style>
        body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.15; }
        h1 { font-size: 16pt; margin-top: 24pt; margin-bottom: 6pt; }
        h2 { font-size: 14pt; margin-top: 18pt; margin-bottom: 4pt; }
        h3 { font-size: 12pt; margin-top: 14pt; margin-bottom: 4pt; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1pt solid #999; padding: 4pt 6pt; }
        th { background-color: #f0f0f0; }
        img { max-width: 100%; height: auto; }
        .signature-box { margin: 24pt 0; }
        .signature-line { border-top: 1pt solid black; margin-top: 36pt; }
      </style>
    `;

    if (html.includes('</head>')) {
      return html.replace('</head>', `${wordStyles}</head>`);
    } else if (html.includes('<body>')) {
      return html.replace('<body>', `${wordStyles}<body>`);
    }
    return wordStyles + html;
  }

  /** Clean CSS properties that Word doesn't support well. */
  private cleanCssForWord(html: string): string {
    html = html.replace(/display:\s*grid[^;]*;/gi, '');
    html = html.replace(/grid-template-columns[^;]*;/gi, '');
    html = html.replace(/gap[^;]*;/gi, '');
    html = html.replace(/display:\s*flex[^;]*;/gi, '');
    html = html.replace(/flex[^;]*;/gi, '');
    html = html.replace(/justify-content[^;]*;/gi, '');
    html = html.replace(/align-items[^;]*;/gi, '');
    html = html.replace(/var\([^)]+\)/gi, 'inherit');
    html = html.replace(/@page[^{]*\{[^}]*\}/gi, '');
    html = html.replace(/(\d+(?:\.\d+)?)\s*rem/gi, (_m, value) => `${Math.round(parseFloat(value) * 12)}pt`);
    html = html.replace(/(\d+(?:\.\d+)?)\s*em/gi, (_m, value) => `${Math.round(parseFloat(value) * 12)}pt`);
    return html;
  }
}
