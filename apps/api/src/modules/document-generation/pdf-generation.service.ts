// HTML → PDF via Puppeteer (headless Chromium). Eén gedeelde browser-instance.
// Deploy: Chromium-binary nodig in de image (zie FASE4-DOCGEN.md §deploy);
// pad via PUPPETEER_EXECUTABLE_PATH (anders gebruikt puppeteer z'n eigen download).
//
// De browser wordt LAZY gestart (pas bij de eerste renderPdf), zodat het importeren
// van deze module geen Chromium spawnt — belangrijk voor unit/e2e tests.

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import puppeteer, { Browser } from 'puppeteer';
import type { PdfOptions } from './types';

/** Harde timeout (ms) voor setContent én page.pdf — voorkomt onbegrensd wachten. */
const RENDER_TIMEOUT_MS = 30_000;

/**
 * Beslist per resource-request of hij door mag tijdens het renderen. De renderer mag
 * GEEN externe/lokale bronnen ophalen: alleen het initiële document en ingesloten
 * `data:`-afbeeldingen zijn toegestaan. Alles met schema `file:`, `http(s):` of een
 * interne host wordt geblokkeerd (SSRF/lokale-bestandslezing-mitigatie).
 *
 * Pure functie zodat de interceptie-beslissing los te unit-testen is.
 */
export function isRenderRequestAllowed(url: string, isNavigationRequest: boolean): boolean {
  if (isNavigationRequest) return true; // het setContent-document zelf
  return url.startsWith('data:') || url.startsWith('about:');
}

@Injectable()
export class PdfGenerationService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfGenerationService.name);
  private browser: Browser | null = null;

  constructor(private readonly config: ConfigService) {}

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    const executablePath = this.config.get<string>('PUPPETEER_EXECUTABLE_PATH');
    this.logger.log('Puppeteer browser starten...');
    this.browser = await puppeteer.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
      ],
    });
    return this.browser;
  }

  /** Render een volledige HTML-string naar een PDF-buffer. */
  async renderPdf(html: string, opts: PdfOptions = {}): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      // Hardening: geen JS-uitvoering en geen netwerk/bestand-toegang tijdens render.
      // Neutraliseert zowel de publieke signatureImage-vector als staf-editedContent.
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (isRenderRequestAllowed(req.url(), req.isNavigationRequest())) {
          void req.continue();
        } else {
          void req.abort();
        }
      });

      // Externe requests worden toch geblokkeerd → 'load' i.p.v. 'networkidle0'.
      await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });
      const mm = (n?: number) => `${n ?? 20}mm`;
      const headerHtml = this.formatHeaderFooter(opts.headerHtml);
      const footerHtml = this.formatHeaderFooter(opts.footerHtml);
      const pdf = await page.pdf({
        format: opts.format ?? 'A4',
        landscape: opts.landscape ?? false,
        printBackground: true,
        timeout: RENDER_TIMEOUT_MS,
        displayHeaderFooter: Boolean(opts.headerHtml || opts.footerHtml),
        headerTemplate: headerHtml,
        footerTemplate: footerHtml,
        margin: {
          top: mm(opts.marginTopMm),
          bottom: mm(opts.marginBottomMm),
          left: mm(opts.marginLeftMm),
          right: mm(opts.marginRightMm),
        },
      });
      this.logger.log(`PDF gegenereerd: ${pdf.length} bytes`);
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  /**
   * Zet onze header/footer-placeholders om naar Puppeteer's `<span class="...">`
   * tokens en wikkel in een minimale container met klein lettertype.
   */
  private formatHeaderFooter(template: string | undefined): string {
    if (!template) return '<span></span>';

    const formatted = template
      .replace(/\{\{pageNumber\}\}/g, '<span class="pageNumber"></span>')
      .replace(/\{\{totalPages\}\}/g, '<span class="totalPages"></span>')
      .replace(/\{\{date\}\}/g, '<span class="date"></span>')
      .replace(/\{\{title\}\}/g, '<span class="title"></span>')
      .replace(/\{\{url\}\}/g, '<span class="url"></span>');

    return `<div style="font-size: 8pt; width: 100%; padding: 0 10mm; font-family: Arial, sans-serif;">${formatted}</div>`;
  }

  async onModuleDestroy() {
    await this.browser?.close().catch((e) => this.logger.error('Browser sluiten mislukt', e));
    this.browser = null;
  }
}
