// Doel in apps/api: src/modules/document-generation/pdf-generation.service.ts
//
// HTML → PDF via Puppeteer (headless Chromium). Eén gedeelde browser-instance.
// Deploy: Chromium-binary nodig in de image (zie FASE4-DOCGEN.md §deploy);
// pad via PUPPETEER_EXECUTABLE_PATH (anders gebruikt puppeteer z'n eigen download).

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import puppeteer, { Browser } from 'puppeteer';

export interface PdfOptions {
  format?: 'A4' | 'A3' | 'Letter';
  landscape?: boolean;
  marginTopMm?: number;
  marginBottomMm?: number;
  marginLeftMm?: number;
  marginRightMm?: number;
  headerHtml?: string;
  footerHtml?: string;
}

@Injectable()
export class PdfGenerationService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfGenerationService.name);
  private browser: Browser | null = null;

  constructor(private readonly config: ConfigService) {}

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.connected) return this.browser;
    const executablePath = this.config.get<string>('PUPPETEER_EXECUTABLE_PATH');
    this.browser = await puppeteer.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    return this.browser;
  }

  /** Render een volledige HTML-string naar een PDF-buffer. */
  async renderPdf(html: string, opts: PdfOptions = {}): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const mm = (n?: number) => `${n ?? 20}mm`;
      const pdf = await page.pdf({
        format: opts.format ?? 'A4',
        landscape: opts.landscape ?? false,
        printBackground: true,
        displayHeaderFooter: Boolean(opts.headerHtml || opts.footerHtml),
        headerTemplate: opts.headerHtml ?? '<span></span>',
        footerTemplate: opts.footerHtml ?? '<span></span>',
        margin: {
          top: mm(opts.marginTopMm),
          bottom: mm(opts.marginBottomMm),
          left: mm(opts.marginLeftMm),
          right: mm(opts.marginRightMm),
        },
      });
      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }

  async onModuleDestroy() {
    await this.browser?.close().catch((e) => this.logger.error('Browser close failed', e));
  }
}
