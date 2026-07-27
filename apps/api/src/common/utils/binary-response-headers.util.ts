import type { Response } from 'express';

/**
 * Zet de vaste beveiligingsheaders op een route die door de gebruiker geüploade
 * bytes terugserveert (B-507 / WP-B4).
 *
 * - `X-Content-Type-Options: nosniff` — de browser mag het Content-Type niet
 *   "verbeteren" op basis van de inhoud; zonder deze header kan een als
 *   afbeelding geserveerd bestand alsnog als HTML/JS geïnterpreteerd worden.
 * - `Content-Security-Policy: default-src 'none'; sandbox` — mocht er tóch
 *   actieve inhoud doorheen komen, dan draait die in een sandbox zonder enige
 *   herkomst: geen scripts, geen netwerk, geen toegang tot het app-origin.
 * - `Content-Disposition` — browsers negeren dit bij `<img src>`, dus `inline`
 *   kost niets voor de normale weergave, maar bij directe navigatie naar de URL
 *   is de bestandsnaam vastgelegd (en `attachment` voor onbekende inhoud).
 *
 * De filename wordt door de aanroeper server-side samengesteld (nooit uit
 * `originalname`), dus header-injectie is uitgesloten.
 */
export function setBinaryResponseHeaders(
  res: Response,
  options: {
    mimeType: string;
    contentLength: number;
    filename: string;
    disposition: 'inline' | 'attachment';
    cacheControl: string;
    /** Wisselt mee met de opslagsleutel, zodat vervangen/verwijderen zichtbaar wordt. */
    etag?: string;
  },
): void {
  res.set({
    'Content-Type': options.mimeType,
    'Content-Length': options.contentLength.toString(),
    'Content-Disposition': `${options.disposition}; filename="${options.filename}"`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': options.cacheControl,
  });
  if (options.etag) {
    res.set({ ETag: options.etag });
  }
}
