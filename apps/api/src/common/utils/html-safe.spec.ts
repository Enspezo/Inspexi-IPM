import { escapeHtml, isSafeDataImage, MAX_DATA_IMAGE_BYTES } from './html-safe';

describe('escapeHtml', () => {
  it('escapes the five HTML-sensitive characters', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;',
    );
  });

  it('escapes & first so entities are not double-broken', () => {
    expect(escapeHtml('a & b < c')).toBe('a &amp; b &lt; c');
  });

  it('returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('isSafeDataImage', () => {
  // 1x1 transparent PNG.
  const validPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  it('accepts a valid base64 png/jpeg/webp data URL', () => {
    expect(isSafeDataImage(validPng)).toBe(true);
    expect(isSafeDataImage('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(true);
    expect(isSafeDataImage('data:image/webp;base64,UklGRg==')).toBe(true);
  });

  it('rejects non-data schemes (SSRF / local-file vectors)', () => {
    expect(isSafeDataImage('file:///etc/passwd')).toBe(false);
    expect(isSafeDataImage('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isSafeDataImage('https://evil.example/x.png')).toBe(false);
    expect(isSafeDataImage('http://localhost:3000/internal')).toBe(false);
  });

  it('rejects embedded tags / quote-breakout in the payload', () => {
    expect(isSafeDataImage('data:image/png;base64,AAA"><script>alert(1)</script>')).toBe(false);
    expect(isSafeDataImage('data:image/png;base64,AAA" onerror="alert(1)')).toBe(false);
  });

  it('rejects disallowed image subtypes', () => {
    expect(isSafeDataImage('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(false);
    expect(isSafeDataImage('data:text/html;base64,PGgxPjwvaDE+')).toBe(false);
  });

  it('rejects payloads exceeding the max decoded size', () => {
    // Build a base64 string whose decoded length is just over the limit.
    const overBytes = MAX_DATA_IMAGE_BYTES + 1;
    const base64Len = Math.ceil(overBytes / 3) * 4;
    const huge = 'data:image/png;base64,' + 'A'.repeat(base64Len);
    expect(isSafeDataImage(huge)).toBe(false);
  });

  it('rejects non-string / empty input', () => {
    expect(isSafeDataImage(undefined)).toBe(false);
    expect(isSafeDataImage(null)).toBe(false);
    expect(isSafeDataImage(12345)).toBe(false);
    expect(isSafeDataImage('data:image/png;base64,')).toBe(false);
  });
});
