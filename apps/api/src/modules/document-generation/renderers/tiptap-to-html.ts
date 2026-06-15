/**
 * TipTap / ProseMirror JSON → HTML converter (server-side, no DOM)
 * Ported verbatim from Inspexi-App (document-templates/renderers/tiptap-to-html.ts).
 *
 * Ondersteunt de standaard TipTap extensies die in de block editor
 * geconfigureerd zijn: paragraphs, headings, bold, italic, underline,
 * strike, link, bullet list, ordered list, blockquote, code, code block,
 * hard break, horizontal rule.
 */

// ──────────────────────────── Types ────────────────────────────

interface PmMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  marks?: PmMark[];
  text?: string;
}

// ──────────────────────────── Utilities ────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function attrs(obj: Record<string, string | number | null | undefined>): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => ` ${k}="${escapeHtml(String(v))}"`)
    .join('');
}

// ──────────────────────────── Mark renderer ────────────────────────────

function applyMarks(text: string, marks: PmMark[]): string {
  let result = text;
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        result = `<strong>${result}</strong>`;
        break;
      case 'italic':
        result = `<em>${result}</em>`;
        break;
      case 'underline':
        result = `<u>${result}</u>`;
        break;
      case 'strike':
        result = `<s>${result}</s>`;
        break;
      case 'code':
        result = `<code>${result}</code>`;
        break;
      case 'link': {
        const href = mark.attrs?.href as string | undefined;
        const target = (mark.attrs?.target as string | undefined) ?? '_blank';
        const rel = target === '_blank' ? ' rel="noopener noreferrer"' : '';
        result = `<a href="${escapeHtml(href ?? '#')}" target="${escapeHtml(target)}"${rel}>${result}</a>`;
        break;
      }
      case 'textStyle': {
        // Kleur / font-size via inline style
        const color = mark.attrs?.color as string | undefined;
        const fontSize = mark.attrs?.fontSize as string | undefined;
        if (color || fontSize) {
          const style = [
            color ? `color:${color}` : '',
            fontSize ? `font-size:${fontSize}` : '',
          ].filter(Boolean).join(';');
          result = `<span style="${style}">${result}</span>`;
        }
        break;
      }
      default:
        break;
    }
  }
  return result;
}

// ──────────────────────────── Node renderer ────────────────────────────

/** Geeft een optioneel style-attribuut terug voor text-align (TipTap TextAlign extension) */
function textAlignStyle(node: PmNode): string {
  const align = node.attrs?.textAlign as string | undefined;
  if (!align || align === 'left') return '';
  return ` style="text-align:${align}"`;
}

function renderNode(node: PmNode): string {
  switch (node.type) {
    case 'doc':
      return (node.content ?? []).map(renderNode).join('');

    case 'paragraph': {
      const inner = renderChildren(node);
      const style = textAlignStyle(node);
      return inner ? `<p${style}>${inner}</p>` : `<p${style}>&nbsp;</p>`;
    }

    case 'heading': {
      const level = (node.attrs?.level as number | undefined) ?? 1;
      const l = Math.min(Math.max(level, 1), 6);
      const style = textAlignStyle(node);
      return `<h${l}${style}>${renderChildren(node)}</h${l}>`;
    }

    case 'bulletList':
      return `<ul>${renderChildren(node)}</ul>`;

    case 'orderedList': {
      const start = (node.attrs?.start as number | undefined) ?? 1;
      const startAttr = start !== 1 ? ` start="${start}"` : '';
      return `<ol${startAttr}>${renderChildren(node)}</ol>`;
    }

    case 'listItem':
      return `<li>${renderChildren(node)}</li>`;

    case 'blockquote':
      return `<blockquote>${renderChildren(node)}</blockquote>`;

    case 'codeBlock': {
      const lang = node.attrs?.language as string | undefined;
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      return `<pre><code${langAttr}>${renderChildren(node)}</code></pre>`;
    }

    case 'horizontalRule':
      return '<hr>';

    case 'hardBreak':
      return '<br>';

    case 'image': {
      const src = (node.attrs?.src as string | undefined) ?? '';
      const alt = (node.attrs?.alt as string | undefined) ?? '';
      const title = node.attrs?.title as string | undefined;
      return `<img${attrs({ src, alt, title })}>`;
    }

    case 'text': {
      const escaped = escapeHtml(node.text ?? '');
      if (node.marks && node.marks.length > 0) {
        return applyMarks(escaped, node.marks);
      }
      return escaped;
    }

    default:
      // Onbekend node type — probeer children te renderen
      return renderChildren(node);
  }
}

function renderChildren(node: PmNode): string {
  return (node.content ?? []).map(renderNode).join('');
}

// ──────────────────────────── Public API ────────────────────────────

/**
 * Converteer TipTap/ProseMirror JSON naar een HTML string.
 * @param json Het ProseMirror document object (type: "doc")
 * @returns HTML string
 */
export function tiptapJsonToHtml(json: unknown): string {
  if (!json || typeof json !== 'object') return '';
  try {
    return renderNode(json as PmNode);
  } catch {
    return '';
  }
}
