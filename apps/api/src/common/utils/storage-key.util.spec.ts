import { sanitizeStorageFilename, sanitizeStorageExtension } from './storage-key.util';

describe('sanitizeStorageFilename', () => {
  it('keeps a normal filename intact', () => {
    expect(sanitizeStorageFilename('report.pdf')).toBe('report.pdf');
    expect(sanitizeStorageFilename('Foto 2026-01.jpg')).toBe('Foto 2026-01.jpg');
  });

  it('strips directory components and traversal sequences', () => {
    expect(sanitizeStorageFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeStorageFilename('..\\..\\windows\\system32')).toBe('system32');
    expect(sanitizeStorageFilename('a/b/c/evil.sh')).toBe('evil.sh');
  });

  it('never returns a value containing a path separator or ".."', () => {
    for (const input of ['../x', '..', '....//..//x', 'foo/../bar', '/abs/path.txt']) {
      const out = sanitizeStorageFilename(input);
      expect(out).not.toMatch(/[/\\]/);
      expect(out).not.toContain('..');
    }
  });

  it('falls back to a safe default for empty/dangerous-only input', () => {
    expect(sanitizeStorageFilename('')).toBe('bestand');
    expect(sanitizeStorageFilename(null)).toBe('bestand');
    expect(sanitizeStorageFilename(undefined)).toBe('bestand');
    expect(sanitizeStorageFilename('..')).toBe('bestand');
  });
});

describe('sanitizeStorageExtension', () => {
  it('extracts a clean lowercase extension', () => {
    expect(sanitizeStorageExtension('logo.PNG', 'png')).toBe('png');
    expect(sanitizeStorageExtension('avatar.jpeg')).toBe('jpeg');
  });

  it('strips separators so the extension cannot introduce a directory', () => {
    expect(sanitizeStorageExtension('foo.bar/baz', 'png')).toBe('png');
    expect(sanitizeStorageExtension('../../evil', 'png')).toBe('png');
  });

  it('falls back when there is no usable extension', () => {
    expect(sanitizeStorageExtension('noext', 'png')).toBe('png');
    expect(sanitizeStorageExtension('', 'bin')).toBe('bin');
  });
});
