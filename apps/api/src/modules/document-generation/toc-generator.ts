// ===========================================
// Table of Contents Generator
// Ported verbatim from Inspexi-App (document-generation/toc-generator.ts).
// ===========================================

/**
 * Generate a table of contents from rendered HTML.
 * Scans for h1, h2, h3 elements with data-toc-title attributes.
 * Replaces {{TABLE_OF_CONTENTS}} placeholder with generated TOC.
 */
export function generateTableOfContents(html: string): string {
  // Find all headings with data-toc-title or within toc-entry sections
  const headingRegex = /<(h[1-3])([^>]*)>([^<]*)<\/\1>/gi;
  const tocTitleRegex = /data-toc-title="([^"]+)"/;

  interface TocEntry {
    level: number;
    title: string;
    id: string;
  }

  const entries: TocEntry[] = [];
  let match: RegExpExecArray | null;

  // Find all headings
  while ((match = headingRegex.exec(html)) !== null) {
    const [, tag, attributes, content] = match;

    // Get heading level
    const level = parseInt(tag.charAt(1), 10);

    // Get title (prefer data-toc-title attribute, fallback to content)
    const tocTitleMatch = attributes.match(tocTitleRegex);
    const title = tocTitleMatch ? tocTitleMatch[1] : content.trim();

    // Skip empty titles
    if (!title) continue;

    // Find section ID (look backwards for nearest section with id)
    const beforeMatch = html.substring(0, match.index);
    const lastSectionMatch = beforeMatch.match(/<section[^>]*id="([^"]+)"[^>]*>\s*$/);

    // Or check if heading itself has an id
    const headingIdMatch = attributes.match(/id="([^"]+)"/);
    const id = headingIdMatch?.[1] || lastSectionMatch?.[1] || `heading-${entries.length}`;

    entries.push({ level, title, id });
  }

  // Generate TOC HTML
  if (entries.length === 0) {
    // Remove placeholder if no entries found
    return html.replace(/\{\{TABLE_OF_CONTENTS\}\}/g, '<p><em>Geen inhoudsopgave beschikbaar</em></p>');
  }

  let tocHtml = '<nav class="toc">\n<ul>\n';
  let prevLevel = 1;

  for (const entry of entries) {
    // Handle nesting
    if (entry.level > prevLevel) {
      for (let i = prevLevel; i < entry.level; i++) {
        tocHtml += '<ul>\n';
      }
    } else if (entry.level < prevLevel) {
      for (let i = entry.level; i < prevLevel; i++) {
        tocHtml += '</ul>\n</li>\n';
      }
    } else if (prevLevel > 1 || entries.indexOf(entry) > 0) {
      tocHtml += '</li>\n';
    }

    tocHtml += `<li class="toc-level-${entry.level}"><a href="#${entry.id}">${entry.title}</a>`;
    prevLevel = entry.level;
  }

  // Close remaining tags
  for (let i = 1; i < prevLevel; i++) {
    tocHtml += '</li>\n</ul>\n';
  }
  tocHtml += '</li>\n</ul>\n</nav>';

  // Replace placeholder
  return html.replace(/\{\{TABLE_OF_CONTENTS\}\}/g, tocHtml);
}

/**
 * Add anchors to headings for TOC linking.
 * This ensures all h1, h2, h3 have unique IDs.
 */
export function addHeadingAnchors(html: string): string {
  let counter = 0;

  return html.replace(/<(h[1-3])([^>]*)>([^<]*)<\/\1>/gi, (match, tag, attributes, content) => {
    // Check if already has an id
    if (/id="/.test(attributes)) {
      return match;
    }

    // Generate unique id from content
    const slug = content
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const id = slug ? `${slug}-${counter++}` : `heading-${counter++}`;

    return `<${tag}${attributes} id="${id}">${content}</${tag}>`;
  });
}
