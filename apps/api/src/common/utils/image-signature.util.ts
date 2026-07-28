import { BadRequestException } from '@nestjs/common';

/**
 * Content-gebaseerde herkenning van geüploade rasterafbeeldingen (B-507 / WP-B4).
 *
 * Waarom niet `file.mimetype`: die header komt rechtstreeks van de client (multer
 * kopieert de multipart Content-Type) en is dus volledig attacker-controlled.
 * Waarom ook niet `file.originalname`: de extensie daaruit bepaalde voorheen de
 * opslagsleutel én — via die sleutel — het Content-Type bij het downloaden. Een
 * SVG met `;type=image/png` glipte zo langs de whitelist, werd als `.svg`
 * opgeslagen en als `image/svg+xml` teruggeserveerd (uitvoerbaar op het
 * app-origin). Beide velden zijn hier daarom hooguit een hint; de **inhoud**
 * beslist.
 *
 * Bewust een eigen, kleine signature-check in plaats van de `file-type`-library:
 * die is vanaf v17 ESM-only en botst met de CJS-build van de API. We hebben maar
 * drie formaten nodig en die hebben alle drie een eenduidige magic-byte-prefix.
 */

/** Mimetypes die we toestaan voor logo's en avatars. SVG staat er bewust NIET bij. */
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export interface DetectedImageType {
  /** Het mimetype zoals afgeleid uit de bytes — dit slaan we op en serveren we. */
  mimeType: AllowedImageMimeType;
  /** Canonieke extensie voor de opslagsleutel (nooit uit `originalname`). */
  extension: 'png' | 'jpg' | 'webp';
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

/**
 * Herkent PNG, JPEG en WebP aan hun magic bytes. Alles anders (SVG, PDF, HTML,
 * GIF, ZIP, …) levert `null` — fail closed.
 */
export function detectImageType(buffer: Buffer | undefined | null): DetectedImageType | null {
  if (!buffer || buffer.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { mimeType: 'image/png', extension: 'png' };
  }

  // JPEG: FF D8 FF (SOI + eerste markerbyte)
  if (buffer.subarray(0, 3).equals(JPEG_SIGNATURE)) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }

  // WebP: RIFF <4 bytes lengte> WEBP
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }

  return null;
}

/**
 * Valideert een geüploade afbeelding en geeft het **gedetecteerde** type terug.
 *
 * Twee poorten:
 *  1. het door de client geclaimde mimetype moet in de whitelist staan (snelle
 *     afwijzing met een begrijpelijke melding, zoals de portal hem al toont);
 *  2. de inhoud moet daadwerkelijk PNG/JPEG/WebP zijn.
 *
 * Een mismatch tussen claim en inhoud (bv. een JPEG die als `image/png` wordt
 * aangeboden — dat doet een browser bij een verkeerd hernoemd bestand) is geen
 * fout: de gedetecteerde waarde wint en wordt opgeslagen. Wat de client beweert
 * verlaat dus nooit meer deze functie.
 */
export function assertAllowedImageUpload(file: {
  buffer?: Buffer;
  mimetype?: string;
}): DetectedImageType {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file?.mimetype as AllowedImageMimeType)) {
    throw new BadRequestException(
      'Alleen PNG, JPEG en WebP afbeeldingen zijn toegestaan',
    );
  }

  const detected = detectImageType(file?.buffer);
  if (!detected) {
    throw new BadRequestException(
      'De inhoud van het bestand is geen geldige PNG-, JPEG- of WebP-afbeelding',
    );
  }

  return detected;
}

/**
 * PDF-herkenning: `%PDF-` moet binnen de eerste 1024 bytes voorkomen (de
 * PDF-spec staat rommel vóór de header toe; vrijwel alle bestanden beginnen
 * op offset 0, maar met deze marge wijzen we geen echte PDF's af).
 */
export function detectPdf(buffer: Buffer | undefined | null): boolean {
  if (!buffer || buffer.length < 5) return false;
  return buffer.subarray(0, 1024).includes('%PDF-');
}

/** Mimetypes voor upload-routes die scans/foto's óf een PDF verwachten (certificaten, kalibraties). SVG bewust niet. */
export const ALLOWED_PDF_OR_IMAGE_MIME_TYPES = [
  'application/pdf',
  ...ALLOWED_IMAGE_MIME_TYPES,
] as const;

export interface DetectedUploadType {
  mimeType: string;
  extension: 'png' | 'jpg' | 'webp' | 'pdf';
}

/**
 * Als `assertAllowedImageUpload`, maar met PDF als extra toegestaan formaat.
 * Zelfde twee poorten: claim op de whitelist, inhoud beslist wat het is.
 */
export function assertAllowedPdfOrImageUpload(file: {
  buffer?: Buffer;
  mimetype?: string;
}): DetectedUploadType {
  if (
    !ALLOWED_PDF_OR_IMAGE_MIME_TYPES.includes(
      file?.mimetype as (typeof ALLOWED_PDF_OR_IMAGE_MIME_TYPES)[number],
    )
  ) {
    throw new BadRequestException('Alleen PDF, PNG, JPEG en WebP bestanden zijn toegestaan');
  }

  const raster = detectImageType(file?.buffer);
  if (raster) return raster;
  if (detectPdf(file?.buffer)) return { mimeType: 'application/pdf', extension: 'pdf' };

  throw new BadRequestException(
    'De inhoud van het bestand is geen geldige PDF of PNG-/JPEG-/WebP-afbeelding',
  );
}

/**
 * Serve-side sniff voor download-routes die PDF's én afbeeldingen kunnen
 * bevatten. Onherkenbare inhoud (legacy SVG-rijen, gespoofte uploads van vóór
 * deze fix) degradeert naar `application/octet-stream` — het opgeslagen
 * (client-geclaimde) mimetype verlaat de service nooit als Content-Type.
 */
export function resolveUploadedContentType(buffer: Buffer | undefined | null): {
  mimeType: string;
  extension: string;
} {
  const raster = detectImageType(buffer);
  if (raster) return raster;
  if (detectPdf(buffer)) return { mimeType: 'application/pdf', extension: 'pdf' };
  return { mimeType: 'application/octet-stream', extension: 'bin' };
}

/**
 * Gedeelde whitelist voor generieke bijlage-uploads (documenten, offerte-,
 * offertesjabloon- en e-mailsjabloon-bijlagen). Stond voorheen 3× gekopieerd
 * (en bij offerte-bijlagen helemaal niet). SVG en CSV blijven hier toegestaan:
 * deze bestanden worden uitsluitend met `attachment` + nosniff + sandbox-CSP
 * teruggeserveerd en renderen dus nooit op het app-origin.
 */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'application/zip',
] as const;

const OOXML_OR_ZIP_MIME_TYPES = new Set<string>([
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const RASTER_IMAGE_MIME_TYPES = new Set<string>(ALLOWED_IMAGE_MIME_TYPES);

/**
 * Kruiscontrole claim ↔ inhoud voor gemengde whitelists: claims mét een
 * betrouwbare signature moeten die ook in de bytes waarmaken. Claims zonder
 * signature passeren bewust ongecontroleerd:
 *  - `text/csv` / `image/svg+xml`: platte tekst, geen magic bytes;
 *  - legacy Office (`application/msword` e.d.): browsers sturen
 *    `application/vnd.ms-excel` óók voor .csv-bestanden, dus een OLE2-check
 *    zou echte uploads afwijzen.
 * De download-headers (attachment + nosniff + sandbox) blijven het vangnet.
 */
export function assertUploadContentMatchesClaim(file: {
  buffer?: Buffer;
  mimetype?: string;
}): void {
  const mimetype = file?.mimetype ?? '';

  if (RASTER_IMAGE_MIME_TYPES.has(mimetype) && !detectImageType(file?.buffer)) {
    throw new BadRequestException(
      'De inhoud van het bestand is geen geldige PNG-, JPEG- of WebP-afbeelding',
    );
  }
  if (mimetype === 'application/pdf' && !detectPdf(file?.buffer)) {
    throw new BadRequestException('De inhoud van het bestand is geen geldige PDF');
  }
  if (
    OOXML_OR_ZIP_MIME_TYPES.has(mimetype) &&
    !(file?.buffer && file.buffer.subarray(0, 2).toString('ascii') === 'PK')
  ) {
    throw new BadRequestException('De inhoud van het bestand is geen geldig ZIP-/Office-bestand');
  }
}

/**
 * Combineert de bijlage-whitelist met de claim↔inhoud-kruiscontrole; voor
 * upload-routes van generieke bijlagen.
 */
export function assertAllowedAttachmentUpload(file: {
  buffer?: Buffer;
  mimetype?: string;
}): void {
  if (
    !ALLOWED_ATTACHMENT_MIME_TYPES.includes(
      file?.mimetype as (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number],
    )
  ) {
    throw new BadRequestException(
      'Bestandstype niet toegestaan. Toegestane types: PDF, afbeeldingen (JPEG, PNG, SVG, WebP), Word, Excel, PowerPoint, CSV, ZIP.',
    );
  }
  assertUploadContentMatchesClaim(file);
}

/**
 * Bepaalt hoe een opgeslagen afbeelding teruggeserveerd wordt.
 *
 * Ook hier beslissen de bytes, niet de extensie in de opslagsleutel: rijen die
 * vóór deze fix zijn aangemaakt kunnen nog op `.svg` eindigen. Zulke (en verder
 * elke onherkenbare) inhoud gaat er als `application/octet-stream` + `attachment`
 * uit — nooit als `image/svg+xml`, dus nooit uitvoerbaar op het app-origin.
 */
export function resolveImageResponseType(
  buffer: Buffer,
  /** Basisnaam voor de Content-Disposition — alleen [a-z0-9-], nooit user input. */
  baseName: string,
): {
  mimeType: string;
  filename: string;
  disposition: 'inline' | 'attachment';
} {
  const safeBase = baseName.replace(/[^a-z0-9-]/gi, '') || 'bestand';
  const detected = detectImageType(buffer);
  if (!detected) {
    return {
      mimeType: 'application/octet-stream',
      filename: `${safeBase}.bin`,
      disposition: 'attachment',
    };
  }
  return {
    mimeType: detected.mimeType,
    filename: `${safeBase}.${detected.extension}`,
    disposition: 'inline',
  };
}
