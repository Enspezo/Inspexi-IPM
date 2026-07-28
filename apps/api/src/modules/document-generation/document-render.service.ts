// Bouwt de HTML voor een document uit een DocumentTemplate + (genormaliseerde) context.
// Ondersteunt de drie TemplateMode's:
//   - SECTIONS: Handlebars-secties (+ repeterende secties, condities, TOC)
//   - BLOCKS:   block-editor ContentBlock[] (gedelegeerd aan BlockHtmlRendererService)
//   - DOCX:     geüploade revisie — niet via HTML gerenderd (gooit een fout)
//
// De sectie-render-logica, condition-evaluatie en HTML-wrapper zijn geport uit de App-bron
// (document-generation/document-render.service.ts). De Prisma-gebonden `gatherData` /
// asset-tree-opbouw hoort bij generated-documents (Fase 4 vervolg) en zit hier NIET in;
// de context wordt door de aanroeper meegegeven.

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { SectionType, TemplateMode } from '@prisma/client';
import { handlebars } from './handlebars-setup';
import { generateTableOfContents } from './toc-generator';
import { BlockHtmlRendererService } from './renderers/block-html-renderer.service';
import type { DocumentData } from './types';

/** Een (eventueel geneste) sectie zoals opgeslagen in DocumentSection. */
export interface RenderSection {
  code: string;
  title: string;
  sectionType: SectionType;
  contentHtml?: string | null;
  repeatOn?: string | null;
  repeatItemTemplate?: string | null;
  condition?: string | null;
  sortOrder: number;
  pageBreakBefore: boolean;
  pageBreakAfter: boolean;
  includeInToc: boolean;
  parentSectionId?: string | null;
  childSections?: RenderSection[];
}

/** De template-meta die nodig is om te renderen (subset van DocumentTemplate). */
export interface RenderTemplateMeta {
  templateMode: TemplateMode;
  pageSize: string;
  orientation: string;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  headerHtml?: string | null;
  footerHtml?: string | null;
  coverPageHtml?: string | null;
  contentBlocks?: unknown;
}

@Injectable()
export class DocumentRenderService {
  private readonly logger = new Logger(DocumentRenderService.name);

  constructor(private readonly blockRenderer: BlockHtmlRendererService) {}

  /**
   * Render een document naar HTML op basis van de template-mode.
   */
  renderHtml(
    template: RenderTemplateMeta,
    sections: RenderSection[],
    context: DocumentData,
    options: { previewMode?: boolean } = {},
  ): string {
    switch (template.templateMode) {
      case TemplateMode.SECTIONS:
        return this.renderSectionsDocument(template, sections, context);
      case TemplateMode.BLOCKS:
        return this.renderBlocksDocument(template, options.previewMode ?? false);
      case TemplateMode.DOCX:
        // DOCX-revisies worden niet via HTML gerenderd; export gebruikt de geüploade revisie.
        throw new BadRequestException(
          'DOCX-mode rendert niet via HTML — gebruik de geüploade DOCX-revisie direct',
        );
      default:
        throw new BadRequestException(`Onbekende template-mode: ${String(template.templateMode)}`);
    }
  }

  // =====================================================
  // SECTIONS
  // =====================================================

  private renderSectionsDocument(
    template: RenderTemplateMeta,
    sections: RenderSection[],
    data: DocumentData,
  ): string {
    let html = '';

    // Cover page
    if (template.coverPageHtml) {
      html += '<div class="cover-page">\n';
      html += this.renderTemplate(template.coverPageHtml, data);
      html += '</div>\n';
      html += '<div class="page-break"></div>\n';
    }

    // Render root sections (sorted), children rendered recursively within renderSection
    const rootSections = sections
      .filter((s) => !s.parentSectionId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const section of rootSections) {
      html += this.renderSection(section, data);
    }

    // Generate and insert table of contents
    html = generateTableOfContents(html);

    // Wrap in full HTML document
    return this.wrapInDocument(html, template, data);
  }

  /** Render a Handlebars template string with data. */
  renderTemplate(html: string | null | undefined, data: DocumentData): string {
    if (!html) return '';
    try {
      const template = handlebars.compile(html);
      return template(data);
    } catch (error) {
      this.logger.error(`Fout bij renderen template: ${(error as Error).message}`);
      return `<!-- Template render error: ${(error as Error).message} -->`;
    }
  }

  /** Render a single document section (and its children). */
  renderSection(section: RenderSection, data: DocumentData): string {
    // Check condition
    if (section.condition && !this.evaluateCondition(section.condition, data)) {
      return '';
    }

    let html = '';

    if (section.pageBreakBefore) {
      html += '<div class="page-break"></div>\n';
    }

    const sectionId = `section-${section.code}`;
    const tocClass = section.includeInToc ? 'toc-entry' : '';

    switch (section.sectionType) {
      case SectionType.STATIC:
        html += `<section id="${sectionId}" class="${tocClass}">\n`;
        if (section.title) {
          html += `<h2 data-toc-title="${section.title}">${section.title}</h2>\n`;
        }
        html += this.renderTemplate(section.contentHtml, data);
        html += '</section>\n';
        break;

      case SectionType.REPEATING:
        html += `<section id="${sectionId}" class="${tocClass}">\n`;
        if (section.title) {
          html += `<h2 data-toc-title="${section.title}">${section.title}</h2>\n`;
        }
        html += this.renderRepeatingSection(section.repeatOn, section.repeatItemTemplate, data);
        html += '</section>\n';
        break;

      case SectionType.TABLE_OF_CONTENTS:
        html += `<section id="${sectionId}" class="table-of-contents">\n`;
        if (section.title) {
          html += `<h2>${section.title}</h2>\n`;
        }
        html += '{{TABLE_OF_CONTENTS}}\n';
        html += '</section>\n';
        break;

      case SectionType.SIGNATURE_BLOCK:
        html += `<section id="${sectionId}" class="signature-block ${tocClass}">\n`;
        if (section.title) {
          html += `<h2 data-toc-title="${section.title}">${section.title}</h2>\n`;
        }
        html += this.renderSignatureBlock(data);
        html += '</section>\n';
        break;

      case SectionType.CONDITIONAL:
        // Condition already checked above, render as static
        html += `<section id="${sectionId}" class="${tocClass}">\n`;
        if (section.title) {
          html += `<h2 data-toc-title="${section.title}">${section.title}</h2>\n`;
        }
        html += this.renderTemplate(section.contentHtml, data);
        html += '</section>\n';
        break;
    }

    // Render child sections
    if (section.childSections && section.childSections.length > 0) {
      for (const child of section.childSections) {
        html += this.renderSection(child, data);
      }
    }

    if (section.pageBreakAfter) {
      html += '<div class="page-break"></div>\n';
    }

    return html;
  }

  /** Evaluate a conditional expression against the data. */
  evaluateCondition(condition: string, data: DocumentData): boolean {
    try {
      // Supports: array length comparisons + simple boolean property access
      if (condition.includes('.length')) {
        const match = condition.match(/(\w+)\.length\s*([><=!]+)\s*(\d+)/);
        if (match) {
          const [, property, operator, valueStr] = match;
          const arr = data[property as keyof DocumentData];
          if (!Array.isArray(arr)) return false;

          const length = arr.length;
          const value = parseInt(valueStr, 10);

          switch (operator) {
            case '>':
              return length > value;
            case '>=':
              return length >= value;
            case '<':
              return length < value;
            case '<=':
              return length <= value;
            case '==':
            case '===':
              return length === value;
            case '!=':
            case '!==':
              return length !== value;
          }
        }
      }

      const prop = data[condition as keyof DocumentData];
      return Boolean(prop);
    } catch (error) {
      this.logger.warn(`Fout bij evalueren conditie "${condition}": ${(error as Error).message}`);
      return true; // Default to showing section on error
    }
  }

  /** Render a repeating section using Handlebars per item. */
  private renderRepeatingSection(
    repeatOn: string | null | undefined,
    itemTemplate: string | null | undefined,
    data: DocumentData,
  ): string {
    if (!repeatOn || !itemTemplate) return '';

    let items: unknown[];

    if (repeatOn.includes('.filter')) {
      items = this.evaluateFilterExpression(repeatOn, data);
    } else {
      items = (data[repeatOn as keyof DocumentData] as unknown[]) || [];
    }

    if (!Array.isArray(items)) return '';

    let html = '';
    const template = handlebars.compile(itemTemplate);

    for (let i = 0; i < items.length; i++) {
      const itemData = {
        ...data,
        item: items[i],
        index: i + 1,
        isFirst: i === 0,
        isLast: i === items.length - 1,
      };

      try {
        html += template(itemData);
      } catch (error) {
        this.logger.error(`Fout bij renderen item ${i}: ${(error as Error).message}`);
      }
    }

    return html;
  }

  /** Evaluate a (limited) filter expression like `assets.filter(a => a.type === "x")`. */
  private evaluateFilterExpression(expression: string, data: DocumentData): unknown[] {
    const arrayMatch = expression.match(/^(\w+)\.filter/);
    if (!arrayMatch) return [];

    const arrayName = arrayMatch[1];
    const arr = data[arrayName as keyof DocumentData];

    if (!Array.isArray(arr)) return [];

    const conditionMatch = expression.match(/=>\s*(.+)\)/);
    if (!conditionMatch) return arr;

    const condition = conditionMatch[1].trim();

    // ["a", "b"].includes(x.prop)
    const includesMatch = condition.match(/\[([^\]]+)\]\.includes\(\w+\.(\w+)\)/);
    if (includesMatch) {
      const valuesStr = includesMatch[1];
      const prop = includesMatch[2];
      const values = valuesStr.split(',').map((v) => v.trim().replace(/['"]/g, ''));

      return arr.filter((item) => {
        const itemObj = item as unknown as Record<string, unknown>;
        return values.includes(String(itemObj[prop]));
      });
    }

    // x.prop === "value"
    const eqMatch = condition.match(/\w+\.(\w+)\s*===?\s*['"]([\w-]+)['"]/);
    if (eqMatch) {
      const prop = eqMatch[1];
      const value = eqMatch[2];

      return arr.filter((item) => {
        const itemObj = item as unknown as Record<string, unknown>;
        return String(itemObj[prop]) === value;
      });
    }

    return arr;
  }

  /** Render a signature block from inspector/reviewer/client context. */
  private renderSignatureBlock(data: DocumentData): string {
    return `
      <div class="signatures">
        <div class="signature-row">
          <div class="signature-box">
            <p class="signature-label">Inspecteur</p>
            <p class="signature-name">${data.inspector.name}</p>
            <div class="signature-line"></div>
            <p class="signature-date">Datum: ________________</p>
          </div>
          ${
            data.reviewer
              ? `
          <div class="signature-box">
            <p class="signature-label">Controleur</p>
            <p class="signature-name">${data.reviewer.name}</p>
            <div class="signature-line"></div>
            <p class="signature-date">Datum: ________________</p>
          </div>
          `
              : ''
          }
        </div>
        <div class="signature-row">
          <div class="signature-box">
            <p class="signature-label">Opdrachtgever</p>
            <p class="signature-name">${data.client.contactPerson || '________________'}</p>
            <div class="signature-line"></div>
            <p class="signature-date">Datum: ________________</p>
          </div>
        </div>
      </div>
    `;
  }

  // =====================================================
  // BLOCKS
  // =====================================================

  private renderBlocksDocument(template: RenderTemplateMeta, previewMode: boolean): string {
    const blocks = Array.isArray(template.contentBlocks) ? (template.contentBlocks as unknown[]) : [];
    return this.blockRenderer.renderFullDocument(
      blocks as Parameters<BlockHtmlRendererService['renderFullDocument']>[0],
      {
        pageSize: template.pageSize,
        orientation: template.orientation,
        marginTop: template.marginTop,
        marginBottom: template.marginBottom,
        marginLeft: template.marginLeft,
        marginRight: template.marginRight,
        headerHtml: template.headerHtml,
        footerHtml: template.footerHtml,
        coverPageHtml: template.coverPageHtml,
        previewMode,
      },
    );
  }

  // =====================================================
  // WRAPPER
  // =====================================================

  /** Wrap rendered SECTIONS content in a full HTML document with print styles. */
  private wrapInDocument(
    content: string,
    template: { pageSize: string; orientation: string },
    data: DocumentData,
  ): string {
    return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.plan.reference} - ${data.plan.normTypeName}</title>
  <style>
    @page { size: ${template.pageSize} ${template.orientation}; }

    * { box-sizing: border-box; }

    /* B-312: 'Noto Sans CJK SC' in de stack zodat CJK-tekens niet stil wegvallen
       (Chromium tekent geen glyph zonder font; fonts-noto-cjk hoort in de render-image). */
    body {
      font-family: Arial, Helvetica, 'Noto Sans CJK SC', sans-serif;
      font-size: 10pt;
      line-height: 1.4;
      color: #333;
      margin: 0;
      padding: 0;
    }

    h1 { font-size: 18pt; margin: 24pt 0 12pt 0; }
    h2 { font-size: 14pt; margin: 18pt 0 9pt 0; }
    h3 { font-size: 12pt; margin: 12pt 0 6pt 0; }
    h4 { font-size: 11pt; margin: 9pt 0 6pt 0; }

    p { margin: 0 0 6pt 0; }

    /* B-312: fixed layout + breekbare celinhoud — een lange waarde zonder spaties
       mag een tabel nooit voorbij de paginabreedte duwen. */
    table { width: 100%; border-collapse: collapse; margin: 12pt 0; table-layout: fixed; }
    th, td { border: 1px solid #ccc; padding: 6pt 8pt; text-align: left; vertical-align: top; word-break: break-word; overflow-wrap: anywhere; }
    th { background-color: #f5f5f5; font-weight: bold; }

    .page-break { page-break-after: always; }

    .cover-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 90vh;
      text-align: center;
    }

    .photo-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10pt; margin: 12pt 0; }
    .photo-grid img { max-width: 100%; height: auto; border: 1px solid #ccc; }

    .finding-item { margin: 12pt 0; padding: 8pt; border: 1px solid #ddd; border-radius: 4pt; }

    .classification-badge { display: inline-block; padding: 2pt 8pt; border-radius: 4pt; font-weight: bold; font-size: 9pt; }
    .classification-1 { background: #fee2e2; color: #991b1b; }
    .classification-2 { background: #fef3c7; color: #92400e; }
    .classification-3 { background: #fef9c3; color: #854d0e; }
    .classification-4 { background: #dcfce7; color: #166534; }

    .signatures { margin-top: 48pt; }
    .signature-row { display: flex; gap: 48pt; margin-bottom: 36pt; }
    .signature-box { flex: 1; }
    .signature-label { font-weight: bold; margin-bottom: 6pt; }
    .signature-name { margin-bottom: 36pt; }
    .signature-line { border-top: 1px solid #333; margin-bottom: 6pt; }
    .signature-date { font-size: 9pt; color: #666; }

    .table-of-contents ul { list-style: none; padding: 0; }
    .table-of-contents li { margin: 6pt 0; }
    .table-of-contents a { color: #333; text-decoration: none; }
    .toc-level-1 { font-weight: bold; }
    .toc-level-2 { padding-left: 12pt; }
    .toc-level-3 { padding-left: 24pt; font-size: 9pt; }
  </style>
</head>
<body>
${content}
</body>
</html>`;
  }
}
