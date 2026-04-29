import { Injectable, Logger } from '@nestjs/common';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PizZip = require('pizzip');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Docxtemplater = require('docxtemplater');

export interface QuoteLineData {
  omschrijving: string;
  aantal: string;
  eenheid: string;
  stukprijs: string;
  korting: string;
  btw: string;
  regeltotaal: string;
}

export interface QuoteRenderData {
  contact: {
    bedrijfsnaam: string;
    voornaam: string;
    achternaam: string;
    email: string;
  };
  offerte: {
    nummer: string;
    onderwerp: string;
    subtotaal: string;
    totaal: string;
    btw_totaal: string;
    korting_totaal: string;
    geldig_tot: string;
    datum: string;
  };
  organisatie: {
    naam: string;
  };
  afzender: {
    voornaam: string;
    achternaam: string;
    email: string;
  };
  offerteregels: QuoteLineData[];
  // Top-level totals (for table footer usage)
  subtotaal: string;
  korting_totaal: string;
  btw_totaal: string;
  totaal: string;
}

const currencyFormatter = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
});

const dateFormatter = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return dateFormatter.format(d);
}

/**
 * Build a Word XML (OOXML) table for the quote lines.
 * This is used as a fallback when the template has {{offerteregels}} as a simple
 * placeholder instead of the loop syntax {{#offerteregels}}...{{/offerteregels}}.
 */
function buildLinesTableXml(lines: QuoteLineData[]): string {
  const headerCells = [
    'Omschrijving',
    'Aantal',
    'Eenheid',
    'Stukprijs',
    'Korting',
    'BTW',
    'Totaal',
  ];

  const cellXml = (text: string, bold = false, align?: string) => {
    const pPr = align
      ? `<w:pPr><w:jc w:val="${align}"/>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}</w:pPr>`
      : bold
        ? '<w:pPr><w:rPr><w:b/></w:rPr></w:pPr>'
        : '';
    const rPr = bold ? '<w:rPr><w:b/><w:sz w:val="18"/></w:rPr>' : '<w:rPr><w:sz w:val="18"/></w:rPr>';
    return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p></w:tc>`;
  };

  // Header row
  const headerRow = `<w:tr>${headerCells.map((h) => cellXml(h, true)).join('')}</w:tr>`;

  // Data rows
  const dataRows = lines
    .map(
      (line) =>
        `<w:tr>${cellXml(line.omschrijving)}${cellXml(line.aantal, false, 'right')}${cellXml(line.eenheid)}${cellXml(line.stukprijs, false, 'right')}${cellXml(line.korting, false, 'right')}${cellXml(line.btw, false, 'right')}${cellXml(line.regeltotaal, false, 'right')}</w:tr>`,
    )
    .join('');

  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/><w:left w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/><w:right w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/></w:tblBorders></w:tblPr>${headerRow}${dataRows}</w:tbl>`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

@Injectable()
export class DocxRendererService {
  private readonly logger = new Logger(DocxRendererService.name);

  /**
   * Flatten nested render data so both {{nummer}} and {{offerte.nummer}} work.
   *
   * Spread order determines priority for conflicting keys:
   * 1. afzender first (lowest priority for shared keys like voornaam)
   * 2. organisatie
   * 3. contact (overwrites afzender's voornaam/achternaam/email)
   * 4. offerte (highest priority — overwrites top-level totals with same values)
   *
   * Afzender also gets prefixed versions (afzender_voornaam etc.) for explicit use.
   */
  private flattenRenderData(
    data: QuoteRenderData,
  ): Record<string, unknown> {
    return {
      ...data,
      // Flatten nested objects to top-level (order = priority for conflicts)
      ...data.afzender,
      ...data.organisatie,
      ...data.contact,
      ...data.offerte,
      // Prefixed afzender keys for explicit access (since contact overwrites shared keys)
      afzender_voornaam: data.afzender.voornaam,
      afzender_achternaam: data.afzender.achternaam,
      afzender_email: data.afzender.email,
    };
  }

  /**
   * Render a DOCX template buffer with the given data.
   * Returns a new DOCX buffer with all placeholders replaced.
   *
   * Supports two modes for offerteregels:
   * 1. Loop syntax: {{#offerteregels}}...{{/offerteregels}} in a table row → docxtemplater handles the loop
   * 2. Simple placeholder: {{offerteregels}} → replaced with a generated Word XML table
   *
   * All nested data is flattened to top-level so both {{nummer}} and {{offerte.nummer}} work.
   */
  renderTemplate(templateBuffer: Buffer, data: QuoteRenderData): Buffer {
    const zip = new PizZip(templateBuffer);

    // Check if the template uses loop syntax or simple placeholder
    const docXml = zip.file('word/document.xml')?.asText() || '';
    const usesLoopSyntax =
      docXml.includes('{{#offerteregels}}') ||
      docXml.includes('{{#quote_lines}}');
    const usesSimplePlaceholder =
      !usesLoopSyntax &&
      (docXml.includes('{{offerteregels}}') ||
        docXml.includes('{{quote_lines}}'));

    // Flatten nested data so both {{nummer}} and {{offerte.nummer}} resolve
    const flatData = this.flattenRenderData(data);

    if (usesSimplePlaceholder) {
      // Replace the simple placeholder with a Word XML table directly in the document XML
      this.logger.log(
        'Template uses simple {{offerteregels}} placeholder — injecting XML table',
      );
      const tableXml = buildLinesTableXml(data.offerteregels);
      const modifiedXml = this.replaceSimplePlaceholderWithTable(
        docXml,
        tableXml,
      );
      zip.file('word/document.xml', modifiedXml);

      // Remove offerteregels from data so docxtemplater doesn't try to render it
      const renderData = { ...flatData, offerteregels: undefined };

      const doc = new Docxtemplater(zip, {
        delimiters: { start: '{{', end: '}}' },
        paragraphLoop: true,
        linebreaks: true,
      });
      doc.render(renderData);
      return doc.getZip().generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      }) as Buffer;
    }

    // Loop syntax mode — let docxtemplater handle everything
    const doc = new Docxtemplater(zip, {
      delimiters: { start: '{{', end: '}}' },
      paragraphLoop: true,
      linebreaks: true,
    });
    doc.render(flatData);

    return doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    }) as Buffer;
  }

  /**
   * Replace a paragraph containing {{offerteregels}} or {{quote_lines}} with a Word XML table.
   * The placeholder is typically inside a <w:p>...</w:p> element, which we replace entirely.
   */
  private replaceSimplePlaceholderWithTable(
    docXml: string,
    tableXml: string,
  ): string {
    // Find the <w:p> element containing {{offerteregels}} or {{quote_lines}} and replace it
    // The placeholder might be split across multiple runs in the XML, but mammoth text extraction
    // confirmed it's present, so we handle both cases

    // First try: placeholder is in a single run (most common after Word saves)
    let result = docXml;

    // Match the entire paragraph containing the placeholder
    const patterns = [
      /(<w:p\b[^>]*>(?:(?!<w:p\b).)*?\{\{offerteregels\}\}(?:(?!<\/w:p>).)*?<\/w:p>)/s,
      /(<w:p\b[^>]*>(?:(?!<w:p\b).)*?\{\{quote_lines\}\}(?:(?!<\/w:p>).)*?<\/w:p>)/s,
    ];

    for (const pattern of patterns) {
      if (pattern.test(result)) {
        result = result.replace(pattern, tableXml);
        return result;
      }
    }

    // Fallback: the placeholder text might be split across XML runs.
    // Try to find and replace the text content directly
    const simplePatterns = [
      '{{offerteregels}}',
      '{{quote_lines}}',
    ];

    for (const placeholder of simplePatterns) {
      if (result.includes(placeholder)) {
        // Replace just the text, but this leaves the surrounding paragraph intact
        result = result.replace(placeholder, '');
        // Insert the table after the paragraph that contained the placeholder
        // Find the closing </w:p> after where the placeholder was
        const placeholderIndex = docXml.indexOf(placeholder);
        const closingPIndex = result.indexOf('</w:p>', placeholderIndex);
        if (closingPIndex > -1) {
          result =
            result.slice(0, closingPIndex + 6) +
            tableXml +
            result.slice(closingPIndex + 6);
        }
        return result;
      }
    }

    return result;
  }

  /**
   * Build the render data object from quote, contact, organization, and user entities.
   */
  buildRenderData(params: {
    quote: {
      quoteNumber: string;
      subject: string;
      subtotal: number;
      discountTotal: number;
      vatTotal: number;
      total: number;
      validUntil: Date | string | null;
      createdAt: Date | string;
      lines: Array<{
        description: string;
        quantity: number;
        unit: string;
        unitPrice: number;
        discountPct: number;
        vatRate: number;
        lineTotal: number;
      }>;
    };
    contact: {
      companyName?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
    };
    organization: {
      name: string;
    };
    user: {
      firstName?: string | null;
      lastName?: string | null;
      email: string;
    };
  }): QuoteRenderData {
    const { quote, contact, organization, user } = params;

    const subtotaal = formatCurrency(quote.subtotal);
    const korting_totaal = formatCurrency(quote.discountTotal);
    const btw_totaal = formatCurrency(quote.vatTotal);
    const totaal = formatCurrency(quote.total);

    return {
      contact: {
        bedrijfsnaam: contact.companyName || '',
        voornaam: contact.firstName || '',
        achternaam: contact.lastName || '',
        email: contact.email || '',
      },
      offerte: {
        nummer: quote.quoteNumber,
        onderwerp: quote.subject,
        subtotaal,
        totaal,
        btw_totaal,
        korting_totaal,
        geldig_tot: formatDate(quote.validUntil),
        datum: formatDate(quote.createdAt),
      },
      organisatie: {
        naam: organization.name,
      },
      afzender: {
        voornaam: user.firstName || '',
        achternaam: user.lastName || '',
        email: user.email,
      },
      offerteregels: quote.lines.map((line) => ({
        omschrijving: line.description,
        aantal: String(line.quantity),
        eenheid: line.unit,
        stukprijs: formatCurrency(line.unitPrice),
        korting: `${line.discountPct}%`,
        btw: `${line.vatRate}%`,
        regeltotaal: formatCurrency(line.lineTotal),
      })),
      subtotaal,
      korting_totaal,
      btw_totaal,
      totaal,
    };
  }
}
