// ===========================================
// Handlebars Setup - Custom Helpers for Document Generation
// Ported verbatim from Inspexi-App (document-generation/handlebars-setup.ts).
// ===========================================

import Handlebars from 'handlebars';

/**
 * Initialize Handlebars with custom helpers for document generation.
 */
export function setupHandlebars(): typeof Handlebars {
  // =====================================================
  // DATE FORMATTING
  // =====================================================

  /**
   * Format a date value
   * Usage: {{formatDate date "DD-MM-YYYY"}}
   */
  Handlebars.registerHelper('formatDate', (date: Date | string | null | undefined, format: string) => {
    if (!date) return '';

    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    // Support common formats
    switch (format) {
      case 'DD-MM-YYYY':
        return `${day}-${month}-${year}`;
      case 'DD/MM/YYYY':
        return `${day}/${month}/${year}`;
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`;
      case 'DD MMMM YYYY': {
        const monthNames = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
          'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
        return `${parseInt(day)} ${monthNames[d.getMonth()]} ${year}`;
      }
      case 'DD-MM-YYYY HH:mm':
        return `${day}-${month}-${year} ${hours}:${minutes}`;
      default:
        return `${day}-${month}-${year}`;
    }
  });

  // =====================================================
  // NUMBER FORMATTING
  // =====================================================

  /**
   * Format a number with decimals
   * Usage: {{formatNumber value 2}}
   */
  Handlebars.registerHelper('formatNumber', (value: number | string | null | undefined, decimals: number = 0) => {
    if (value === null || value === undefined) return '';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '';

    return num.toLocaleString('nl-NL', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  });

  /**
   * Format as currency (EUR)
   * Usage: {{formatCurrency value}}
   */
  Handlebars.registerHelper('formatCurrency', (value: number | string | null | undefined) => {
    if (value === null || value === undefined) return '';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '';

    return num.toLocaleString('nl-NL', {
      style: 'currency',
      currency: 'EUR',
    });
  });

  // =====================================================
  // COMPARISON HELPERS
  // =====================================================

  Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
  Handlebars.registerHelper('neq', (a: unknown, b: unknown) => a !== b);
  Handlebars.registerHelper('gt', (a: number, b: number) => a > b);
  Handlebars.registerHelper('gte', (a: number, b: number) => a >= b);
  Handlebars.registerHelper('lt', (a: number, b: number) => a < b);
  Handlebars.registerHelper('lte', (a: number, b: number) => a <= b);

  Handlebars.registerHelper('and', (...args: unknown[]) => {
    // Remove the options object that Handlebars passes as last argument
    const conditions = args.slice(0, -1);
    return conditions.every(Boolean);
  });

  Handlebars.registerHelper('or', (...args: unknown[]) => {
    const conditions = args.slice(0, -1);
    return conditions.some(Boolean);
  });

  Handlebars.registerHelper('not', (value: unknown) => !value);

  // =====================================================
  // OBJECT/ARRAY HELPERS
  // =====================================================

  /**
   * Lookup nested property
   * Usage: {{lookup object "nested.property"}}
   */
  Handlebars.registerHelper('lookup', (obj: Record<string, unknown> | null | undefined, path: string) => {
    if (!obj || !path) return undefined;

    return path.split('.').reduce((current: unknown, key: string) => {
      if (current && typeof current === 'object' && key in current) {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  });

  Handlebars.registerHelper('length', (arr: unknown[] | null | undefined) => {
    return Array.isArray(arr) ? arr.length : 0;
  });

  Handlebars.registerHelper('isEmpty', (arr: unknown[] | null | undefined) => {
    return !arr || !Array.isArray(arr) || arr.length === 0;
  });

  Handlebars.registerHelper('isNotEmpty', (arr: unknown[] | null | undefined) => {
    return arr && Array.isArray(arr) && arr.length > 0;
  });

  Handlebars.registerHelper('join', (arr: unknown[] | null | undefined, separator: string = ', ') => {
    if (!arr || !Array.isArray(arr)) return '';
    return arr.join(separator);
  });

  Handlebars.registerHelper('first', (arr: unknown[] | null | undefined, n: number) => {
    if (!arr || !Array.isArray(arr)) return [];
    return arr.slice(0, n);
  });

  // =====================================================
  // STRING HELPERS
  // =====================================================

  Handlebars.registerHelper('uppercase', (str: string | null | undefined) => {
    return str ? str.toUpperCase() : '';
  });

  Handlebars.registerHelper('lowercase', (str: string | null | undefined) => {
    return str ? str.toLowerCase() : '';
  });

  Handlebars.registerHelper('capitalize', (str: string | null | undefined) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  });

  Handlebars.registerHelper('truncate', (str: string | null | undefined, length: number) => {
    if (!str) return '';
    if (str.length <= length) return str;
    return str.substring(0, length) + '...';
  });

  Handlebars.registerHelper('default', (value: unknown, defaultValue: unknown) => {
    return value !== null && value !== undefined && value !== '' ? value : defaultValue;
  });

  // =====================================================
  // MATH HELPERS
  // =====================================================

  Handlebars.registerHelper('add', (a: number, b: number) => (a || 0) + (b || 0));
  Handlebars.registerHelper('subtract', (a: number, b: number) => (a || 0) - (b || 0));
  Handlebars.registerHelper('multiply', (a: number, b: number) => (a || 0) * (b || 0));
  Handlebars.registerHelper('divide', (a: number, b: number) => {
    if (!b) return 0;
    return (a || 0) / b;
  });

  // =====================================================
  // INDEX/COUNTER HELPERS
  // =====================================================

  Handlebars.registerHelper('inc', (value: number) => (value || 0) + 1);

  Handlebars.registerHelper('padStart', (value: number | string, length: number, char: string = '0') => {
    return String(value).padStart(length, char);
  });

  // =====================================================
  // CLASSIFICATION HELPERS
  // =====================================================

  /**
   * Get classification color class based on value
   * Usage: {{classificationClass classification}}
   */
  Handlebars.registerHelper('classificationClass', (classification: string | number | null | undefined) => {
    if (!classification) return '';
    const value = typeof classification === 'string' ? classification : String(classification);

    // SCIOS IB22 style classifications (1, 2, 3, 4)
    if (['1', '2', '3', '4'].includes(value)) {
      return `classification-${value}`;
    }

    // NEN style classifications (A, B, C, D, E)
    const letter = value.charAt(0).toUpperCase();
    if (['A', 'B', 'C', 'D', 'E'].includes(letter)) {
      return `classification-${letter.toLowerCase()}`;
    }

    return '';
  });

  /**
   * Get classification color based on value (for inline styles)
   * Usage: {{classificationColor classification}}
   */
  Handlebars.registerHelper('classificationColor', (classification: string | number | null | undefined) => {
    if (!classification) return '#666666';
    const value = typeof classification === 'string' ? classification : String(classification);

    // SCIOS IB22 style (1=kritiek/rood, 2=serieus/oranje, 3=aandacht/geel, 4=info/groen)
    const sciosColors: Record<string, string> = {
      '1': '#dc2626', // red
      '2': '#ea580c', // orange
      '3': '#ca8a04', // yellow
      '4': '#16a34a', // green
    };

    // NEN style (A=kritiek, B=serieus, C=aandacht, D=acceptabel, E=info)
    const nenColors: Record<string, string> = {
      A: '#dc2626',
      B: '#ea580c',
      C: '#ca8a04',
      D: '#2563eb',
      E: '#16a34a',
    };

    if (sciosColors[value]) return sciosColors[value];

    const letter = value.charAt(0).toUpperCase();
    if (nenColors[letter]) return nenColors[letter];

    return '#666666';
  });

  // =====================================================
  // TABLE OF CONTENTS PLACEHOLDER
  // =====================================================

  /**
   * Table of contents placeholder - replaced after rendering
   * Usage: {{tableOfContents}}
   */
  Handlebars.registerHelper('tableOfContents', () => {
    return new Handlebars.SafeString('{{TABLE_OF_CONTENTS}}');
  });

  // =====================================================
  // RAW HTML OUTPUT
  // =====================================================

  /**
   * Output raw HTML without escaping
   * Usage: {{{raw htmlContent}}}
   */
  Handlebars.registerHelper('raw', (html: string | null | undefined) => {
    return html ? new Handlebars.SafeString(html) : '';
  });

  return Handlebars;
}

// Export configured Handlebars instance
export const handlebars = setupHandlebars();
