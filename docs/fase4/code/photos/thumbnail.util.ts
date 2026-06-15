// Doel in apps/api: src/modules/photos/thumbnail.util.ts
//
// Thumbnail-generatie (Fase 4) — vult de in Fase 3 uitgestelde `thumbnailPath`.
// Dep: pnpm --filter <api> add sharp
//
// Integratie in photos.service.upload():
//   const thumb = await makeThumbnail(file.buffer);
//   const thumbKey = `${orgId}/photos/thumb/${uuid}.jpg`;
//   await this.storage.upload(thumbKey, thumb, 'image/jpeg');
//   ... Photo.create({ ..., thumbnailPath: thumbKey })
//
// Signed URLs: als de provider ze ondersteunt, geef in pull/upload een getekende URL i.p.v.
// de download-route:
//   const s = this.storage as SignedUrlCapableStorage;
//   const url = s.supportsSignedUrls?.() ? await s.getSignedUrl(key) : `/api/v1/photos/${id}/download`;

import sharp from 'sharp';

/** Maakt een vierkante-ish thumbnail (max 400px), JPEG, voor lijst/preview. */
export async function makeThumbnail(buffer: Buffer, maxPx = 400): Promise<Buffer> {
  return sharp(buffer)
    .rotate() // respecteer EXIF-oriëntatie
    .resize(maxPx, maxPx, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
}
