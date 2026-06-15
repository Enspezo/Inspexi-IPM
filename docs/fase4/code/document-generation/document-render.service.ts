// Doel in apps/api: src/modules/document-generation/document-render.service.ts
//
// SKELET. Bouwt de HTML voor een document uit een DocumentTemplate + inspectiedata.
// Ondersteunt de drie TemplateMode's: SECTIONS (Handlebars-secties), BLOCKS (block-editor
// ContentBlock[]), DOCX (geüploade revisie — niet via HTML gerenderd).
//
// >>> PORT FROM APP SOURCE <<<  De volledige Handlebars-helpers, block-renderers,
// placeholder-resolutie en TOC-generatie staan in Inspexi-App:
//   apps/api/src/modules/document-generation/{handlebars-setup,toc-generator}.ts +
//   document-templates/renderers/*. Neem die logica hier over; dit bestand legt alleen
//   de structuur + de Beheer-integratiepunten vast.

import { Injectable } from '@nestjs/common';
import Handlebars from 'handlebars';
import { TemplateMode } from '@prisma/client';

/** Genormaliseerde context die uit een InspectionPlan (+ relaties) wordt opgebouwd. */
export interface DocumentContext {
  organization: Record<string, unknown>;
  contact: Record<string, unknown>;
  plan: Record<string, unknown>;
  assets: Array<Record<string, unknown>>;
  findings: Array<Record<string, unknown>>;
  measurements?: Array<Record<string, unknown>>;
  generatedAt: string;
}

@Injectable()
export class DocumentRenderService {
  private readonly hbs = Handlebars.create();

  constructor() {
    this.registerHelpers();
  }

  /** >>> PORT: registreer alle helpers uit handlebars-setup.ts (date, currency, classify, ...) */
  private registerHelpers(): void {
    this.hbs.registerHelper('formatDate', (v: string) =>
      v ? new Date(v).toLocaleDateString('nl-NL') : '—',
    );
    // ... overige helpers porten uit de App.
  }

  /**
   * Render een document naar HTML op basis van de template-mode.
   * @param template DocumentTemplate-row (mode, secties of contentBlocks, header/footer/cover)
   * @param context  opgebouwd uit het inspectieplan
   */
  async renderHtml(
    template: { templateMode: TemplateMode; contentBlocks?: unknown; coverPageHtml?: string | null; stylesCss?: string | null },
    sections: Array<{ contentHtml: string | null; repeatOn: string | null; repeatItemTemplate: string | null }>,
    context: DocumentContext,
  ): Promise<string> {
    switch (template.templateMode) {
      case TemplateMode.SECTIONS:
        return this.renderSections(sections, context);
      case TemplateMode.BLOCKS:
        return this.renderBlocks(template.contentBlocks, context);
      case TemplateMode.DOCX:
        // DOCX-revisies worden niet via HTML gerenderd; export gebruikt de geüploade revisie.
        throw new Error('DOCX-mode rendert niet via HTML — gebruik de DOCX-revisie direct');
    }
  }

  /** >>> PORT: secties + repeterende secties via Handlebars (zie App document-render.service.ts) */
  private renderSections(
    sections: Array<{ contentHtml: string | null; repeatOn: string | null; repeatItemTemplate: string | null }>,
    context: DocumentContext,
  ): string {
    const parts: string[] = [];
    for (const s of sections) {
      if (s.repeatOn && s.repeatItemTemplate) {
        const items = (context as any)[s.repeatOn] ?? [];
        const tpl = this.hbs.compile(s.repeatItemTemplate);
        for (const item of items) parts.push(tpl({ ...context, item }));
      } else if (s.contentHtml) {
        parts.push(this.hbs.compile(s.contentHtml)(context));
      }
    }
    return parts.join('\n');
  }

  /** >>> PORT: block-editor ContentBlock[] → HTML (rich_text, findings_table, asset_summary, toc, ...) */
  private renderBlocks(contentBlocks: unknown, _context: DocumentContext): string {
    const blocks = Array.isArray(contentBlocks) ? contentBlocks : [];
    // Implementeer per BlockType een renderer (zie packages/shared block-editor types).
    return blocks.map(() => '').join('\n');
  }
}
