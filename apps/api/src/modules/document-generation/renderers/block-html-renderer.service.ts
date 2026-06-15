/**
 * BlockHtmlRendererService
 * Ported verbatim from Inspexi-App (document-templates/renderers/block-html-renderer.service.ts).
 *
 * Converteert een array van ContentBlocks (uit de block editor) naar een
 * volledig HTML-document dat klaar is voor:
 *   - PDF generatie (via Puppeteer)
 *   - HTML preview in de portal
 *
 * Half-width blocks worden naast elkaar gezet in een twee-koloms rij.
 * Inspection-specifieke blocks (findings_table, signature_block, etc.)
 * genereren een placeholder-wrapper die bij het daadwerkelijk renderen
 * van een inspectierapport ingevuld wordt met echte data.
 */

import { Injectable } from '@nestjs/common';
import { tiptapJsonToHtml } from './tiptap-to-html';

// ──────────────────────────── Types ────────────────────────────

interface ContentBlock {
  id: string;
  type: string;
  width: 'full' | 'half';
  order: number;
  content: Record<string, unknown>;
}

interface RenderContext {
  /** Taal voor lokalisatie van labels (default: 'nl') */
  locale?: 'nl' | 'en';
  /** Als true: inspection blocks krijgen visueel onderscheidende stijl */
  previewMode?: boolean;
}

// ──────────────────────────── Block renderers ────────────────────────────

function renderRichText(content: Record<string, unknown>): string {
  const json = content['tiptapJson'];
  if (!json) {
    const rawHtml = content['rawHtml'] as string | undefined;
    if (rawHtml) return rawHtml;
    return '<p>&nbsp;</p>';
  }
  return tiptapJsonToHtml(json);
}

function renderImage(content: Record<string, unknown>): string {
  const url = (content['url'] as string | undefined) ?? '';
  const storageKey = content['storageKey'] as string | undefined;
  const alt = (content['alt'] as string | undefined) ?? '';
  const title = content['title'] as string | undefined;

  if (!url && !storageKey) {
    return `<div class="block-image-placeholder" style="
      border:2px dashed #d1d5db;
      border-radius:8px;
      padding:32px;
      text-align:center;
      color:#9ca3af;
      font-size:14px;
    ">📷 Afbeelding niet beschikbaar</div>`;
  }

  const src = url || `[STORAGE:${storageKey}]`;
  const titleAttr = title ? ` title="${title}"` : '';
  return `<figure style="margin:0;text-align:center;">
  <img src="${src}" alt="${alt}"${titleAttr} style="max-width:100%;height:auto;border-radius:4px;">
  ${title ? `<figcaption style="font-size:12px;color:#6b7280;margin-top:4px;">${title}</figcaption>` : ''}
</figure>`;
}

function renderDivider(content: Record<string, unknown>): string {
  const style = (content['style'] as string | undefined) ?? 'solid';
  const color = (content['color'] as string | undefined) ?? '#e5e7eb';
  return `<hr style="border:none;border-top:1px ${style} ${color};margin:8px 0;">`;
}

function renderSpacer(content: Record<string, unknown>): string {
  const height = (content['height'] as number | undefined) ?? 32;
  return `<div style="height:${height}px;display:block;"></div>`;
}

function renderPlaceholder(content: Record<string, unknown>, previewMode = false): string {
  const placeholder = (content['placeholder'] as string | undefined) ?? '';
  const label = (content['label'] as string | undefined) ?? placeholder;

  if (previewMode) {
    return `<span class="block-placeholder" style="
      background:#fef9c3;
      border:1px dashed #fbbf24;
      border-radius:4px;
      padding:0 6px;
      font-size:13px;
      color:#92400e;
      font-family:monospace;
    ">{{${label}}}</span>`;
  }
  // In productie wordt de placeholder later ingevuld door de rapport renderer
  return `{{${placeholder}}}`;
}

function renderToc(content: Record<string, unknown>, previewMode = false): string {
  const title = (content['title'] as string | undefined) ?? 'Inhoudsopgave';
  const showPageNumbers = (content['showPageNumbers'] as boolean | undefined) ?? true;

  if (previewMode) {
    return `<div class="block-toc-placeholder" style="
      border:2px dashed #d1d5db;
      border-radius:8px;
      padding:16px 24px;
      background:#f9fafb;
    ">
      <div style="font-weight:600;font-size:16px;margin-bottom:8px;color:#374151;">${title}</div>
      <div style="font-size:13px;color:#9ca3af;font-style:italic;">
        Inhoudsopgave wordt automatisch gegenereerd
        ${showPageNumbers ? '(met paginanummers)' : '(zonder paginanummers)'}
      </div>
    </div>`;
  }

  return `<!-- TOC: title="${title}" showPageNumbers="${showPageNumbers}" -->`;
}

function renderFindingsTable(content: Record<string, unknown>, previewMode = false): string {
  const showClassification = (content['showClassification'] as boolean | undefined) ?? true;
  const showNormRef = (content['showNormReference'] as boolean | undefined) ?? true;
  const showPhotos = (content['showPhotos'] as boolean | undefined) ?? false;
  const groupBy = (content['groupBy'] as string | undefined) ?? 'none';

  const configSummary = [
    showClassification ? 'classificatie' : null,
    showNormRef ? 'normreferentie' : null,
    showPhotos ? "foto's" : null,
    groupBy !== 'none' ? `groep: ${groupBy}` : null,
  ].filter(Boolean).join(', ');

  if (previewMode) {
    return `<div class="block-inspection" style="
      border:2px dashed #bfdbfe;
      border-radius:8px;
      padding:16px 24px;
      background:#eff6ff;
    ">
      <div style="font-weight:600;font-size:14px;color:#1e40af;margin-bottom:4px;">📋 Bevindingentabel</div>
      <div style="font-size:12px;color:#3b82f6;">${configSummary || 'Standaard weergave'}</div>
    </div>`;
  }

  return `<!-- FINDINGS_TABLE: showClassification="${showClassification}" showNormReference="${showNormRef}" showPhotos="${showPhotos}" groupBy="${groupBy}" -->`;
}

function renderAssetSummary(content: Record<string, unknown>, previewMode = false): string {
  const showTechnical = (content['showTechnicalData'] as boolean | undefined) ?? true;
  const showFindings = (content['showFindings'] as boolean | undefined) ?? true;
  const showMeasurements = (content['showMeasurements'] as boolean | undefined) ?? false;

  if (previewMode) {
    const items = [
      showTechnical ? 'technische data' : null,
      showFindings ? 'bevindingen' : null,
      showMeasurements ? 'meetdata' : null,
    ].filter(Boolean).join(', ');

    return `<div class="block-inspection" style="
      border:2px dashed #bbf7d0;
      border-radius:8px;
      padding:16px 24px;
      background:#f0fdf4;
    ">
      <div style="font-weight:600;font-size:14px;color:#166534;margin-bottom:4px;">🏗️ Installatie-overzicht</div>
      <div style="font-size:12px;color:#16a34a;">${items || 'Standaard weergave'}</div>
    </div>`;
  }

  return `<!-- ASSET_SUMMARY: showTechnicalData="${showTechnical}" showFindings="${showFindings}" showMeasurements="${showMeasurements}" -->`;
}

function renderMeasurementData(content: Record<string, unknown>, previewMode = false): string {
  const showPassFail = (content['showPassFail'] as boolean | undefined) ?? true;
  const showNotes = (content['showNotes'] as boolean | undefined) ?? true;

  if (previewMode) {
    return `<div class="block-inspection" style="
      border:2px dashed #fde68a;
      border-radius:8px;
      padding:16px 24px;
      background:#fffbeb;
    ">
      <div style="font-weight:600;font-size:14px;color:#92400e;margin-bottom:4px;">📊 Meetgegevens</div>
      <div style="font-size:12px;color:#d97706;">
        ${showPassFail ? 'Geslaagd/gezakt · ' : ''}${showNotes ? 'Notities' : ''}
      </div>
    </div>`;
  }

  return `<!-- MEASUREMENT_DATA: showPassFail="${showPassFail}" showNotes="${showNotes}" -->`;
}

function renderSignatureBlock(content: Record<string, unknown>, previewMode = false): string {
  const roles = (content['signerRoles'] as string[] | undefined) ?? ['inspector'];
  const showDate = (content['showDate'] as boolean | undefined) ?? true;
  const showFunction = (content['showFunction'] as boolean | undefined) ?? true;

  const roleLabels: Record<string, string> = {
    inspector: 'Inspecteur',
    reviewer: 'Controleur',
    client: 'Opdrachtgever',
    installation_responsible: 'Installatieverantwoordelijke',
  };

  if (previewMode) {
    const columns = roles.map(role => `
      <div style="flex:1;min-width:0;border-top:1px solid #d1d5db;padding-top:8px;">
        <div style="font-size:13px;font-weight:600;color:#374151;">${roleLabels[role] ?? role}</div>
        ${showFunction ? '<div style="font-size:11px;color:#9ca3af;margin-top:2px;">Functie: _______________</div>' : ''}
        <div style="font-size:11px;color:#9ca3af;margin-top:2px;">Handtekening: _______________</div>
        ${showDate ? '<div style="font-size:11px;color:#9ca3af;margin-top:2px;">Datum: _______________</div>' : ''}
      </div>`).join('');

    return `<div style="margin-top:32px;">
      <div style="display:flex;gap:32px;flex-wrap:wrap;">${columns}</div>
    </div>`;
  }

  return `<!-- SIGNATURE_BLOCK: roles="${roles.join(',')}" showDate="${showDate}" showFunction="${showFunction}" -->`;
}

// ──────────────────────────── Lay-out helpers ────────────────────────────

/**
 * Groepeer aaneengesloten half-width blocks in rijen.
 * Elk paar van twee halve blocks vormt een rij.
 * Een enkel half-width block aan het einde krijgt een eigen rij.
 */
function groupIntoRows(blocks: ContentBlock[]): Array<ContentBlock[]> {
  const rows: Array<ContentBlock[]> = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];
    if (block.width === 'half') {
      const next = blocks[i + 1];
      if (next && next.width === 'half') {
        rows.push([block, next]);
        i += 2;
      } else {
        rows.push([block]);
        i += 1;
      }
    } else {
      rows.push([block]);
      i += 1;
    }
  }

  return rows;
}

// ──────────────────────────── Service ────────────────────────────

@Injectable()
export class BlockHtmlRendererService {
  /**
   * Render een enkele ContentBlock naar HTML.
   */
  renderBlock(block: ContentBlock, ctx: RenderContext = {}): string {
    const preview = ctx.previewMode ?? false;
    const c = block.content;

    switch (block.type) {
      case 'rich_text':
        return renderRichText(c);
      case 'image':
        return renderImage(c);
      case 'divider':
        return renderDivider(c);
      case 'spacer':
        return renderSpacer(c);
      case 'placeholder':
        return renderPlaceholder(c, preview);
      case 'toc':
        return renderToc(c, preview);
      case 'findings_table':
        return renderFindingsTable(c, preview);
      case 'asset_summary':
        return renderAssetSummary(c, preview);
      case 'measurement_data':
        return renderMeasurementData(c, preview);
      case 'signature_block':
        return renderSignatureBlock(c, preview);
      default:
        // Onbekend block type — render placeholder in preview mode
        if (preview) {
          return `<div style="border:1px dashed #e5e7eb;padding:12px;border-radius:4px;color:#9ca3af;font-size:13px;">
            [Onbekend block type: ${block.type}]
          </div>`;
        }
        return `<!-- UNKNOWN_BLOCK: ${block.type} -->`;
    }
  }

  /**
   * Render een array van ContentBlocks naar een HTML-fragment (geen <html>/<body> wrapper).
   * Half-width blocks worden naast elkaar gezet.
   */
  renderBlocksToFragment(blocks: ContentBlock[], ctx: RenderContext = {}): string {
    const sorted = [...blocks].sort((a, b) => a.order - b.order);
    const rows = groupIntoRows(sorted);

    return rows.map(row => {
      if (row.length === 2) {
        // Twee halve blocks → flexbox rij
        const [left, right] = row;
        return `<div style="display:flex;gap:24px;width:100%;">
  <div style="flex:1;min-width:0;">${this.renderBlock(left, ctx)}</div>
  <div style="flex:1;min-width:0;">${this.renderBlock(right, ctx)}</div>
</div>`;
      }

      const [block] = row;
      if (block.width === 'half') {
        // Enkel half-width block (zonder partner) → 50% breed
        return `<div style="width:50%;">${this.renderBlock(block, ctx)}</div>`;
      }

      return this.renderBlock(block, ctx);
    }).join('\n');
  }

  /**
   * Render een volledig HTML-document met standaard stijlen.
   * Geschikt voor PDF generatie of iframe preview.
   */
  renderFullDocument(
    blocks: ContentBlock[],
    options: {
      title?: string;
      pageSize?: string;
      orientation?: string;
      marginTop?: number;
      marginBottom?: number;
      marginLeft?: number;
      marginRight?: number;
      headerHtml?: string | null;
      footerHtml?: string | null;
      coverPageHtml?: string | null;
      previewMode?: boolean;
      locale?: 'nl' | 'en';
    } = {},
  ): string {
    const {
      title = 'Document',
      pageSize = 'A4',
      orientation = 'portrait',
      marginTop = 20,
      marginBottom = 20,
      marginLeft = 20,
      marginRight = 20,
      headerHtml,
      footerHtml,
      coverPageHtml,
      previewMode = false,
      locale = 'nl',
    } = options;

    const ctx: RenderContext = { previewMode, locale };
    const bodyContent = this.renderBlocksToFragment(blocks, ctx);

    // @page CSS regel voor paginagrootte en marges (voor Puppeteer)
    const pageRule = `@page {
  size: ${pageSize} ${orientation};
  margin: ${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm;
}`;

    const headerSection = headerHtml
      ? `<header class="page-header">${headerHtml}</header>`
      : '';

    const footerSection = footerHtml
      ? `<footer class="page-footer">${footerHtml}</footer>`
      : '';

    const coverSection = coverPageHtml
      ? `<section class="cover-page" style="page-break-after:always;">${coverPageHtml}</section>`
      : '';

    return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    ${pageRule}

    *, *::before, *::after { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #111827;
    }

    /* Typografie */
    h1 { font-size: 28px; font-weight: 700; margin: 0 0 16px; line-height: 1.3; }
    h2 { font-size: 22px; font-weight: 700; margin: 0 0 14px; line-height: 1.3; }
    h3 { font-size: 18px; font-weight: 600; margin: 0 0 12px; line-height: 1.3; }
    h4 { font-size: 16px; font-weight: 600; margin: 0 0 10px; }
    h5 { font-size: 14px; font-weight: 600; margin: 0 0 8px; }
    h6 { font-size: 13px; font-weight: 600; margin: 0 0 8px; }

    p { margin: 0 0 12px; }
    p:last-child { margin-bottom: 0; }

    ul, ol { margin: 0 0 12px; padding-left: 24px; }
    li { margin-bottom: 4px; }

    blockquote {
      border-left: 3px solid #d1d5db;
      margin: 0 0 12px 0;
      padding: 8px 16px;
      color: #6b7280;
    }

    pre {
      background: #f3f4f6;
      border-radius: 6px;
      padding: 12px 16px;
      overflow-x: auto;
      margin: 0 0 12px;
    }

    code {
      background: #f3f4f6;
      border-radius: 3px;
      padding: 1px 5px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 13px;
    }

    pre code {
      background: none;
      padding: 0;
      font-size: 13px;
    }

    a { color: #2563eb; text-decoration: underline; }

    img { max-width: 100%; height: auto; }

    hr {
      border: none;
      border-top: 1px solid #e5e7eb;
      margin: 16px 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
    }

    th, td {
      border: 1px solid #e5e7eb;
      padding: 8px 12px;
      text-align: left;
    }

    th {
      background: #f9fafb;
      font-weight: 600;
    }

    /* Inhoudsgebied */
    .page-content {
      padding: 0;
    }

    .page-content > * + * {
      margin-top: 16px;
    }

    /* Header / footer (alleen zichtbaar in preview) */
    .page-header, .page-footer {
      font-size: 12px;
      color: #6b7280;
    }

    ${previewMode ? `
    /* Preview-only styling */
    .page-header {
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 12px;
      margin-bottom: 24px;
    }
    .page-footer {
      border-top: 1px solid #e5e7eb;
      padding-top: 12px;
      margin-top: 24px;
    }
    body { padding: 32px; max-width: 800px; margin: 0 auto; }
    ` : ''}
  </style>
</head>
<body>
  ${coverSection}
  ${headerSection}
  <main class="page-content">
${bodyContent}
  </main>
  ${footerSection}
</body>
</html>`;
  }
}
