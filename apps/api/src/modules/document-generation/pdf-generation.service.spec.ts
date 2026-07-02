import { isRenderRequestAllowed } from './pdf-generation.service';

describe('isRenderRequestAllowed (Puppeteer request interception)', () => {
  it('allows the initial navigation (setContent) document', () => {
    expect(isRenderRequestAllowed('about:blank', true)).toBe(true);
  });

  it('allows embedded data: images', () => {
    expect(isRenderRequestAllowed('data:image/png;base64,iVBORw0KGgo=', false)).toBe(true);
  });

  it('aborts file: URLs (local-file read)', () => {
    expect(isRenderRequestAllowed('file:///etc/passwd', false)).toBe(false);
  });

  it('aborts http(s)/internal-host URLs (SSRF)', () => {
    expect(isRenderRequestAllowed('http://169.254.169.254/latest/meta-data', false)).toBe(false);
    expect(isRenderRequestAllowed('http://localhost:3000/internal', false)).toBe(false);
    expect(isRenderRequestAllowed('http://127.0.0.1/x', false)).toBe(false);
    expect(isRenderRequestAllowed('https://evil.example/x.png', false)).toBe(false);
  });
});
