import { BadRequestException, ValidationPipe, ValidationError } from '@nestjs/common';

/**
 * Centrale NL-vertaallaag voor class-validator-meldingen (WP-C1 / B-501, B-155).
 *
 * class-validator rendert per constraint een Engelse default-tekst
 * ("defaultVat must not be less than 0"). In plaats van ~200 decorators een
 * eigen `message` te geven, vertaalt deze `exceptionFactory` de bekende
 * default-templates naar het Nederlands. Bestaande expliciete (Nederlandse)
 * `message:`-decorators matchen géén van de Engelse patronen en blijven dus
 * ongewijzigd leidend.
 *
 * Geneste padprefixen als `lines.0.quantity` (restpunt WP-B5) worden hier ook
 * leesbaar gemaakt: "Regel 1: quantity mag niet meer zijn dan 1000000".
 */

/** NL-labels voor bekende array-properties in geneste validatiepaden. */
const ARRAY_SEGMENT_LABELS: Record<string, string> = {
  lines: 'Regel',
  items: 'Item',
  tiers: 'Staffel',
  slots: 'Tijdslot',
  blocks: 'Blok',
  attachments: 'Bijlage',
  addresses: 'Adres',
  photos: 'Foto',
  rules: 'Regel',
  followUpRules: 'Opvolgregel',
  exceptions: 'Uitzondering',
  markers: 'Marker',
  values: 'Waarde',
  records: 'Record',
  resolutions: 'Oplossing',
};

/**
 * Vertalingen van de class-validator default-templates. De patronen zijn
 * verankerd en specifiek genoeg dat eigen (Nederlandse) messages nooit matchen.
 * Volgorde is relevant: specifiekere patronen eerst.
 */
const DEFAULT_TEMPLATE_TRANSLATIONS: Array<{
  pattern: RegExp;
  toNl: (m: RegExpMatchArray) => string;
}> = [
  // @Min / @Max
  { pattern: /^(.+) must not be less than (.+)$/, toNl: (m) => `${m[1]} moet minimaal ${m[2]} zijn` },
  { pattern: /^(.+) must not be greater than (.+)$/, toNl: (m) => `${m[1]} mag maximaal ${m[2]} zijn` },
  // @MinLength / @MaxLength / @Length
  {
    pattern: /^(.+) must be longer than or equal to (\d+) characters?$/,
    toNl: (m) => `${m[1]} moet minimaal ${m[2]} teken${m[2] === '1' ? '' : 's'} bevatten`,
  },
  {
    pattern: /^(.+) must be shorter than or equal to (\d+) characters?$/,
    toNl: (m) => `${m[1]} mag maximaal ${m[2]} teken${m[2] === '1' ? '' : 's'} bevatten`,
  },
  // @ArrayMinSize / @ArrayMaxSize / @ArrayNotEmpty
  {
    pattern: /^(.+) must contain at least (\d+) elements?$/,
    toNl: (m) => `${m[1]} moet minimaal ${m[2]} item${m[2] === '1' ? '' : 's'} bevatten`,
  },
  {
    pattern: /^(.+) must contain no more than (\d+) elements?$/,
    toNl: (m) => `${m[1]} mag maximaal ${m[2]} item${m[2] === '1' ? '' : 's'} bevatten`,
  },
  { pattern: /^(.+) should not be empty$/, toNl: (m) => `${m[1]} mag niet leeg zijn` },
  { pattern: /^(.+) should not be null or undefined$/, toNl: (m) => `${m[1]} is verplicht` },
  // Types
  { pattern: /^(.+) must be a string$/, toNl: (m) => `${m[1]} moet tekst zijn` },
  {
    pattern: /^(.+) must be a number conforming to the specified constraints$/,
    toNl: (m) => `${m[1]} moet een getal zijn`,
  },
  { pattern: /^(.+) must be a number string$/, toNl: (m) => `${m[1]} moet een numerieke waarde zijn` },
  { pattern: /^(.+) must be an integer number$/, toNl: (m) => `${m[1]} moet een geheel getal zijn` },
  { pattern: /^(.+) must be a positive number$/, toNl: (m) => `${m[1]} moet een positief getal zijn` },
  { pattern: /^(.+) must be a boolean value$/, toNl: (m) => `${m[1]} moet ja of nee zijn` },
  { pattern: /^(.+) must be an array$/, toNl: (m) => `${m[1]} moet een lijst zijn` },
  { pattern: /^(.+) must be an object$/, toNl: (m) => `${m[1]} moet een object zijn` },
  // Formaten
  { pattern: /^(.+) must be an email$/, toNl: (m) => `${m[1]} moet een geldig e-mailadres zijn` },
  { pattern: /^(.+) must be a UUID$/, toNl: (m) => `${m[1]} moet een geldige identificatie (UUID) zijn` },
  { pattern: /^(.+) must be an? URL address$/, toNl: (m) => `${m[1]} moet een geldige URL zijn` },
  {
    pattern: /^(.+) must be a valid ISO 8601 date string$/,
    toNl: (m) => `${m[1]} moet een geldige datum zijn`,
  },
  { pattern: /^(.+) must be a Date instance$/, toNl: (m) => `${m[1]} moet een geldige datum zijn` },
  {
    pattern: /^(.+) must be a valid phone number$/,
    toNl: (m) => `${m[1]} moet een geldig telefoonnummer zijn`,
  },
  { pattern: /^(.+) must be a hexadecimal color$/, toNl: (m) => `${m[1]} moet een geldige kleurcode zijn` },
  {
    pattern: /^(.+) must match \/(.+)\/ regular expression$/,
    toNl: (m) => `${m[1]} heeft een ongeldig formaat`,
  },
  // @IsEnum / @IsIn
  {
    pattern: /^(.+) must be one of the following values: ?(.*)$/,
    toNl: (m) => `${m[1]} moet een van de volgende waarden zijn: ${m[2]}`,
  },
  // forbidNonWhitelisted
  { pattern: /^property (.+) should not exist$/, toNl: (m) => `Onbekend veld: ${m[1]}` },
  // nested validation
  {
    pattern: /^nested property (.+) must be either object or array$/,
    toNl: (m) => `${m[1]} heeft een ongeldige structuur`,
  },
];

/** Vertaal één gerenderde constraint-tekst; onbekende (custom) teksten blijven ongemoeid. */
export function translateValidationMessage(message: string): string {
  for (const { pattern, toNl } of DEFAULT_TEMPLATE_TRANSLATIONS) {
    const match = message.match(pattern);
    if (match) {
      return toNl(match);
    }
  }
  return message;
}

/**
 * Maak van padsegmenten vóór de leaf-property een NL-prefix.
 * `['lines', '0']` → `"Regel 1: "`; niet-array-segmenten worden doorgegeven.
 */
function formatPathPrefix(segments: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const next = segments[i + 1];
    if (next !== undefined && /^\d+$/.test(next)) {
      const label = ARRAY_SEGMENT_LABELS[segment] ?? segment;
      parts.push(`${label} ${Number(next) + 1}`);
      i++; // index-segment is verwerkt
    } else if (/^\d+$/.test(segment)) {
      // Kale index zonder benoemde parent (top-level array-DTO)
      parts.push(`Item ${Number(segment) + 1}`);
    } else {
      parts.push(segment);
    }
  }
  return parts.length > 0 ? `${parts.join(' → ')}: ` : '';
}

/** Recursief alle constraint-meldingen verzamelen, met NL-prefix voor geneste paden. */
function collectMessages(error: ValidationError, parentPath: string[], out: string[]): void {
  if (error.constraints) {
    const prefix = formatPathPrefix(parentPath);
    for (const message of Object.values(error.constraints)) {
      out.push(`${prefix}${translateValidationMessage(message)}`);
    }
  }
  for (const child of error.children ?? []) {
    collectMessages(child, [...parentPath, error.property], out);
  }
}

/** `exceptionFactory` voor de globale ValidationPipe: NL-meldingen, zelfde body-shape. */
export function nlValidationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const messages: string[] = [];
  for (const error of errors) {
    collectMessages(error, [], messages);
  }
  return new BadRequestException(messages.length > 0 ? messages : 'Ongeldige aanvraag');
}

/**
 * De app-brede ValidationPipe-configuratie (main.ts én e2e-bootstraps die het
 * productiecontract willen testen).Nieuw gedrag hier toevoegen, niet inline.
 */
export function createAppValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    exceptionFactory: nlValidationExceptionFactory,
  });
}
