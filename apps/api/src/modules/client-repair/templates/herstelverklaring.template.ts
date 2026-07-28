// Herstelverklaring (PRD-14 §14.7) — code-based Handlebars-template.
// Bewust géén org-configureerbare DocumentTemplate in v1 (zie PRD §14.13); de
// HTML is volledig self-contained (inline CSS, foto's als data-URI's) zodat
// dezelfde string zowel de htmlPreview als de Puppeteer-PDF voedt (de
// PDF-renderer blokkeert alle niet-data:-requests).

import { handlebars } from '../../document-generation/handlebars-setup';

export interface DeclarationPhoto {
  dataUri: string;
}

export interface DeclarationFinding {
  seq: number;
  shortDescription: string;
  locationDescription: string | null;
  normReference: string | null;
  classificationLabel: string;
  classificationColor: string;
  repairDescription: string;
  photos: DeclarationPhoto[];
}

export interface DeclarationContext {
  org: { name: string; logoDataUri: string | null; primaryColor: string };
  plan: {
    referenceNumber: string | null;
    projectName: string;
    address: string;
    plannedDate: string | null;
  };
  filler: { contactName: string; companyName: string | null; email: string | null };
  findings: DeclarationFinding[];
  signature: {
    /** data-URL van de canvas-handtekening; null in de preview (nog niet ondertekend). */
    imageDataUri: string | null;
    signedAt: string | null;
    ipAddress: string | null;
  };
  generatedAt: string;
}

const TEMPLATE = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<title>Herstelverklaring {{plan.referenceNumber}}</title>
<style>
  * { box-sizing: border-box; }
  /* B-312: 'Noto Sans CJK SC' in de stack zodat CJK-tekens niet stil wegvallen. */
  body { font-family: Helvetica, Arial, 'Noto Sans CJK SC', sans-serif; color: #111827; font-size: 12px; margin: 0; padding: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; color: {{org.primaryColor}}; }
  h2 { font-size: 14px; margin: 24px 0 8px; border-bottom: 2px solid {{org.primaryColor}}; padding-bottom: 4px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
  .logo { max-height: 60px; max-width: 200px; }
  /* B-312: fixed layout + breekbare celinhoud tegen paginabrede uitloop. */
  .meta-table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; table-layout: fixed; }
  .meta-table td { padding: 3px 8px 3px 0; vertical-align: top; word-break: break-word; overflow-wrap: anywhere; }
  .meta-table td:first-child { color: #6b7280; width: 160px; }
  .finding { border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-bottom: 14px; page-break-inside: avoid; }
  .finding-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
  .finding-num { font-weight: bold; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 9999px; color: #fff; font-size: 10px; }
  .label { color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 8px; }
  .photos { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .photos img { width: 140px; height: 105px; object-fit: cover; border-radius: 4px; border: 1px solid #e5e7eb; }
  .declaration { margin-top: 28px; padding: 14px; background: #f9fafb; border-radius: 6px; font-size: 12.5px; }
  .signature-block { margin-top: 24px; display: flex; gap: 48px; page-break-inside: avoid; }
  .signature-box { min-width: 260px; }
  .signature-box img { max-height: 90px; }
  .signature-line { border-top: 1px solid #9ca3af; margin-top: 8px; padding-top: 4px; color: #6b7280; font-size: 10px; }
  .footer { margin-top: 32px; color: #9ca3af; font-size: 10px; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Herstelverklaring</h1>
      <div>{{org.name}}</div>
    </div>
    {{#if org.logoDataUri}}<img class="logo" src="{{org.logoDataUri}}" alt="{{org.name}}" />{{/if}}
  </div>

  <table class="meta-table">
    <tr><td>Rapportnummer</td><td>{{default plan.referenceNumber '—'}}</td></tr>
    <tr><td>Inspectie</td><td>{{plan.projectName}}</td></tr>
    <tr><td>Adres</td><td>{{default plan.address '—'}}</td></tr>
    <tr><td>Inspectiedatum</td><td>{{default plan.plannedDate '—'}}</td></tr>
    <tr><td>Ingevuld door</td><td>{{filler.contactName}}{{#if filler.companyName}} ({{filler.companyName}}){{/if}}</td></tr>
    {{#if filler.email}}<tr><td>E-mail</td><td>{{filler.email}}</td></tr>{{/if}}
  </table>

  <h2>Herstelde constateringen</h2>
  {{#each findings}}
  <div class="finding">
    <div class="finding-head">
      <span class="finding-num">{{seq}}.</span>
      <span>{{shortDescription}}</span>
      <span class="badge" style="background: {{classificationColor}}">{{classificationLabel}}</span>
    </div>
    {{#if locationDescription}}<div><span class="label">Locatie</span><br />{{locationDescription}}</div>{{/if}}
    {{#if normReference}}<div><span class="label">Normverwijzing</span><br />{{normReference}}</div>{{/if}}
    <div><span class="label">Uitgevoerde werkzaamheden</span><br />{{repairDescription}}</div>
    {{#if photos.length}}
    <div class="photos">
      {{#each photos}}<img src="{{dataUri}}" alt="Bewijsfoto" />{{/each}}
    </div>
    {{/if}}
  </div>
  {{/each}}

  <div class="declaration">
    Ondergetekende verklaart dat de bovengenoemde constateringen zijn hersteld zoals omschreven.
  </div>

  <div class="signature-block">
    <div class="signature-box">
      <!--SIG_IMG_START-->{{#if signature.imageDataUri}}<img src="{{signature.imageDataUri}}" alt="Handtekening" />{{else}}<div style="height:90px"></div>{{/if}}<!--SIG_IMG_END-->
      <div class="signature-line">
        Handtekening — {{filler.contactName}}<br />
        <!--SIG_META_START-->{{#if signature.signedAt}}Ondertekend op {{signature.signedAt}}{{#if signature.ipAddress}} (IP: {{signature.ipAddress}}){{/if}}{{else}}Nog niet ondertekend{{/if}}<!--SIG_META_END-->
      </div>
    </div>
  </div>

  <div class="footer">Gegenereerd op {{generatedAt}} via het online-herstelportaal van {{org.name}}.</div>
</body>
</html>`;

const compiled = handlebars.compile(TEMPLATE);

export function renderDeclarationHtml(context: DeclarationContext): string {
  return compiled(context);
}

/**
 * Vervangt bij ondertekening de gemarkeerde handtekening-regio's in de eerder
 * gegenereerde (preview-)HTML door de definitieve handtekening + metadata, zonder
 * de rest van het document opnieuw op te bouwen. `signatureImageDataUri` is al
 * gevalideerd via IsSafeDataImage; naam/datum/IP zijn server-side waarden.
 */
export function injectSignatureIntoDeclarationHtml(
  html: string,
  signature: { imageDataUri: string; signedAtLabel: string; ipAddress: string | null },
): string {
  const escapedImg = `<img src="${signature.imageDataUri}" alt="Handtekening" />`;
  const meta = `Ondertekend op ${signature.signedAtLabel}${
    signature.ipAddress ? ` (IP: ${signature.ipAddress})` : ''
  }`;
  return html
    .replace(
      /<!--SIG_IMG_START-->[\s\S]*?<!--SIG_IMG_END-->/,
      `<!--SIG_IMG_START-->${escapedImg}<!--SIG_IMG_END-->`,
    )
    .replace(
      /<!--SIG_META_START-->[\s\S]*?<!--SIG_META_END-->/,
      `<!--SIG_META_START-->${meta}<!--SIG_META_END-->`,
    );
}
