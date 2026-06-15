// Foto-thumbnail-generatie (Fase 4) — vult de in Fase 3 uitgestelde `thumbnailPath`.
// Dep: sharp (staat al in apps/api/package.json).

import sharp from 'sharp';

/** Maakt een (max 400px) JPEG-thumbnail voor lijst/preview; respecteert EXIF-oriëntatie. */
export async function makeThumbnail(buffer: Buffer, maxPx = 400): Promise<Buffer> {
  return sharp(buffer)
    .rotate() // respecteer EXIF-oriëntatie
    .resize(maxPx, maxPx, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
}
