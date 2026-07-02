// HTML-veiligheid voor door gebruikers/ondertekenaars aangeleverde strings die in
// gegenereerde document-HTML terechtkomen (Puppeteer-render). Voorkomt HTML/attribuut-
// injectie (XSS/SSRF via <img src>) bij interpolatie in template-strings.

/** Maximaal toegestane gedecodeerde grootte van een `data:`-afbeelding (5 MB). */
export const MAX_DATA_IMAGE_BYTES = 5 * 1024 * 1024;

/** Alleen deze image-subtypes zijn toegestaan als data-URL handtekening. */
const SAFE_DATA_IMAGE_RE = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Escape de vijf HTML-gevoelige tekens; veilig voor zowel tekst- als attribuut-context. */
export function escapeHtml(value: string | null | undefined): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * True als `value` een veilige, ingesloten base64 data-image is:
 * - schema exact `data:image/(png|jpeg|jpg|webp);base64,`
 * - geldige base64-payload (geen andere tekens → geen URL/tag-injectie)
 * - gedecodeerde grootte ≤ MAX_DATA_IMAGE_BYTES
 * Alles met `file:`/`http(s):`/overige schema's of ingebedde tags faalt.
 */
export function isSafeDataImage(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = SAFE_DATA_IMAGE_RE.exec(value);
  if (!match) return false;
  const base64 = match[2];
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const decodedBytes = Math.floor((base64.length * 3) / 4) - padding;
  return decodedBytes > 0 && decodedBytes <= MAX_DATA_IMAGE_BYTES;
}
