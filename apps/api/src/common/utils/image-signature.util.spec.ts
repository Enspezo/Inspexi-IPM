import { BadRequestException } from '@nestjs/common';
import {
  detectImageType,
  assertAllowedImageUpload,
  resolveImageResponseType,
} from './image-signature.util';

/** Minimale, maar echte magic-byte-prefixen + wat vulling (min. 12 bytes). */
const pngBuffer = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]),
]);
const jpegBuffer = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from([0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
]);
const webpBuffer = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 ', 'ascii'),
]);
const pdfBuffer = Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj', 'binary');
const svgBuffer = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.domain)</script></svg>',
  'utf8',
);

describe('detectImageType', () => {
  it('herkent PNG, JPEG en WebP aan hun magic bytes', () => {
    expect(detectImageType(pngBuffer)).toEqual({ mimeType: 'image/png', extension: 'png' });
    expect(detectImageType(jpegBuffer)).toEqual({ mimeType: 'image/jpeg', extension: 'jpg' });
    expect(detectImageType(webpBuffer)).toEqual({ mimeType: 'image/webp', extension: 'webp' });
  });

  it('weigert SVG, PDF, HTML en GIF', () => {
    expect(detectImageType(svgBuffer)).toBeNull();
    expect(detectImageType(pdfBuffer)).toBeNull();
    expect(detectImageType(Buffer.from('<!DOCTYPE html><html><body>x', 'utf8'))).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a............', 'ascii'))).toBeNull();
  });

  it('weigert lege, te korte en ontbrekende buffers', () => {
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
    expect(detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(detectImageType(undefined)).toBeNull();
    expect(detectImageType(null)).toBeNull();
  });

  it('trapt niet in een RIFF-container die geen WebP is (bv. WAV)', () => {
    const wav = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from('WAVEfmt ', 'ascii'),
    ]);
    expect(detectImageType(wav)).toBeNull();
  });
});

describe('assertAllowedImageUpload', () => {
  it('accepteert echte PNG/JPEG/WebP en geeft het gedetecteerde type terug', () => {
    expect(assertAllowedImageUpload({ buffer: pngBuffer, mimetype: 'image/png' })).toEqual({
      mimeType: 'image/png',
      extension: 'png',
    });
    expect(assertAllowedImageUpload({ buffer: webpBuffer, mimetype: 'image/webp' })).toEqual({
      mimeType: 'image/webp',
      extension: 'webp',
    });
  });

  it('laat de inhoud winnen van een verkeerd geclaimd (maar toegestaan) mimetype', () => {
    // Browsers sturen voor een hernoemd bestand het type van de extensie mee;
    // wij slaan op wat de bytes zeggen — nooit wat de client beweert.
    expect(assertAllowedImageUpload({ buffer: jpegBuffer, mimetype: 'image/png' })).toEqual({
      mimeType: 'image/jpeg',
      extension: 'jpg',
    });
  });

  it('weigert een PDF die zich als PNG voordoet (B-507)', () => {
    expect(() => assertAllowedImageUpload({ buffer: pdfBuffer, mimetype: 'image/png' })).toThrow(
      BadRequestException,
    );
    expect(() => assertAllowedImageUpload({ buffer: pdfBuffer, mimetype: 'image/png' })).toThrow(
      /geen geldige PNG-, JPEG- of WebP-afbeelding/,
    );
  });

  it('weigert een SVG met script, ook als die zich als PNG voordoet (B-507)', () => {
    expect(() => assertAllowedImageUpload({ buffer: svgBuffer, mimetype: 'image/png' })).toThrow(
      BadRequestException,
    );
  });

  it('weigert image/svg+xml al op de whitelist (D3: SVG geschrapt)', () => {
    expect(() =>
      assertAllowedImageUpload({ buffer: svgBuffer, mimetype: 'image/svg+xml' }),
    ).toThrow(/Alleen PNG, JPEG en WebP/);
  });

  it('weigert een ontbrekend of leeg bestand', () => {
    expect(() => assertAllowedImageUpload({ mimetype: 'image/png' })).toThrow(BadRequestException);
    expect(() =>
      assertAllowedImageUpload({ buffer: Buffer.alloc(0), mimetype: 'image/png' }),
    ).toThrow(BadRequestException);
  });
});

describe('resolveImageResponseType', () => {
  it('serveert herkende afbeeldingen inline met het gedetecteerde type', () => {
    expect(resolveImageResponseType(pngBuffer, 'logo')).toEqual({
      mimeType: 'image/png',
      filename: 'logo.png',
      disposition: 'inline',
    });
    expect(resolveImageResponseType(jpegBuffer, 'avatar')).toEqual({
      mimeType: 'image/jpeg',
      filename: 'avatar.jpg',
      disposition: 'inline',
    });
  });

  it('serveert onbekende inhoud (bv. een legacy .svg-sleutel) nooit als afbeelding', () => {
    const result = resolveImageResponseType(svgBuffer, 'logo');
    expect(result.mimeType).toBe('application/octet-stream');
    expect(result.mimeType).not.toBe('image/svg+xml');
    expect(result.disposition).toBe('attachment');
    expect(result.filename).toBe('logo.bin');
  });

  it('saneert de basisnaam zodat de header niet te injecteren is', () => {
    const result = resolveImageResponseType(pngBuffer, 'lo"go\r\nX-Evil: 1');
    // Aanhalingstekens, CR/LF en spaties sneuvelen; alleen [a-z0-9-] blijft over.
    expect(result.filename).toBe('logoX-Evil1.png');
    expect(result.filename).not.toMatch(/["\r\n]/);
  });
});
