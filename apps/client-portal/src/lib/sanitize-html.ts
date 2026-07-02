import DOMPurify from 'dompurify';

// Centrale HTML-sanitatie voor alles wat via `dangerouslySetInnerHTML` gerenderd wordt
// (server-gegenereerde document-/e-mail-HTML én attacker-controlled uploads zoals een XLSX die
// SheetJS naar HTML omzet). DOMPurify verwijdert standaard al <script> en on*-handlers; de hook
// hieronder strlooit daarbovenop verwijzingen naar EXTERNE resources (SSRF/tracking/exfil via
// <img src>, <iframe>, srcset, poster, …) terwijl inline data:-afbeeldingen en relatieve paden
// blijven. Legitieme opmaak (tabellen, koppen, inline-styles) blijft behouden.

const RESOURCE_ATTRS = ['src', 'srcset', 'poster', 'background', 'xlink:href'];

let hookRegistered = false;
function ensureHook(): void {
  if (hookRegistered) return;
  hookRegistered = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element;
    if (typeof el.getAttribute !== 'function') return;
    for (const attr of RESOURCE_ATTRS) {
      const value = el.getAttribute(attr);
      if (value && /^\s*https?:\/\//i.test(value)) {
        el.removeAttribute(attr);
      }
    }
  });
}

/**
 * Saniteer onvertrouwde HTML vóór injectie. Strip scripts, on*-handlers, gevaarlijke tags
 * (script/style/iframe/object/embed/link/form) en externe resource-verwijzingen.
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return '';
  ensureHook();
  return DOMPurify.sanitize(dirty, {
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'link', 'form'],
  });
}
