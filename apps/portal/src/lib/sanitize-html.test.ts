import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from './sanitize-html';

describe('sanitizeHtml', () => {
  it('strips <script> tags entirely', () => {
    const out = sanitizeHtml('<p>Hallo</p><script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('<p>Hallo</p>');
  });

  it('strips inline event handlers (on*)', () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(1)">');
    expect(out.toLowerCase()).not.toContain('onerror');
    expect(out).not.toContain('alert(1)');
  });

  it('strips javascript: URIs', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">klik</a>');
    expect(out.toLowerCase()).not.toContain('javascript:');
  });

  it('strips external resource src (SSRF/tracking), keeps data: images', () => {
    const external = sanitizeHtml('<img src="https://evil.example/track.gif">');
    expect(external).not.toContain('https://evil.example');

    const inline = sanitizeHtml('<img src="data:image/png;base64,iVBORw0KGgo=">');
    expect(inline).toContain('data:image/png;base64');
  });

  it('drops <iframe> while preserving legitimate table markup', () => {
    const out = sanitizeHtml(
      '<table><tr><td>Cel</td></tr></table><iframe src="https://evil.example"></iframe>',
    );
    expect(out).not.toContain('<iframe');
    expect(out).toContain('<td>Cel</td>');
  });

  it('returns an empty string for null/undefined/empty input', () => {
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(undefined)).toBe('');
    expect(sanitizeHtml('')).toBe('');
  });
});
