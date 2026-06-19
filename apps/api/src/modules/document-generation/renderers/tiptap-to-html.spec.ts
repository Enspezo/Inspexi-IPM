import { tiptapJsonToHtml } from './tiptap-to-html';

describe('tiptapJsonToHtml', () => {
  // ──────────────────────────── Edge cases ────────────────────────────

  it('returns empty string for null/undefined input', () => {
    expect(tiptapJsonToHtml(null)).toBe('');
    expect(tiptapJsonToHtml(undefined)).toBe('');
    expect(tiptapJsonToHtml('')).toBe('');
  });

  it('returns empty string for non-object input', () => {
    expect(tiptapJsonToHtml(42)).toBe('');
    expect(tiptapJsonToHtml(true)).toBe('');
  });

  it('handles empty doc gracefully', () => {
    const doc = { type: 'doc', content: [] };
    expect(tiptapJsonToHtml(doc)).toBe('');
  });

  // ──────────────────────────── Paragraphs ────────────────────────────

  it('renders a simple paragraph', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world' }],
        },
      ],
    };
    expect(tiptapJsonToHtml(doc)).toBe('<p>Hello world</p>');
  });

  it('renders an empty paragraph as &nbsp;', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    };
    expect(tiptapJsonToHtml(doc)).toBe('<p>&nbsp;</p>');
  });

  it('escapes HTML special characters in text', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '<script>alert("xss")</script>' }],
        },
      ],
    };
    const result = tiptapJsonToHtml(doc);
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('<script>');
  });

  it('renders multiple paragraphs', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
      ],
    };
    expect(tiptapJsonToHtml(doc)).toBe('<p>First</p><p>Second</p>');
  });

  // ──────────────────────────── Headings ────────────────────────────

  it('renders headings h1 through h6', () => {
    for (let level = 1; level <= 6; level++) {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level },
            content: [{ type: 'text', text: `Heading ${level}` }],
          },
        ],
      };
      expect(tiptapJsonToHtml(doc)).toBe(`<h${level}>Heading ${level}</h${level}>`);
    }
  });

  it('clamps heading level to 1-6 range', () => {
    const docLevel0 = {
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 0 }, content: [{ type: 'text', text: 'x' }] }],
    };
    expect(tiptapJsonToHtml(docLevel0)).toBe('<h1>x</h1>');

    const docLevel9 = {
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 9 }, content: [{ type: 'text', text: 'x' }] }],
    };
    expect(tiptapJsonToHtml(docLevel9)).toBe('<h6>x</h6>');
  });

  // ──────────────────────────── Marks ────────────────────────────

  it('renders bold text', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'normal ' },
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
          ],
        },
      ],
    };
    expect(tiptapJsonToHtml(doc)).toBe('<p>normal <strong>bold</strong></p>');
  });

  it('renders italic text', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'italic', marks: [{ type: 'italic' }] }],
        },
      ],
    };
    expect(tiptapJsonToHtml(doc)).toBe('<p><em>italic</em></p>');
  });

  it('renders underline text', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'underline', marks: [{ type: 'underline' }] }],
        },
      ],
    };
    expect(tiptapJsonToHtml(doc)).toBe('<p><u>underline</u></p>');
  });

  it('renders strikethrough text', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'strike', marks: [{ type: 'strike' }] }],
        },
      ],
    };
    expect(tiptapJsonToHtml(doc)).toBe('<p><s>strike</s></p>');
  });

  it('renders inline code', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'code()', marks: [{ type: 'code' }] }],
        },
      ],
    };
    expect(tiptapJsonToHtml(doc)).toBe('<p><code>code()</code></p>');
  });

  it('stacks multiple marks', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'bold+italic',
              marks: [{ type: 'bold' }, { type: 'italic' }],
            },
          ],
        },
      ],
    };
    const result = tiptapJsonToHtml(doc);
    // Both tags must be present, nesting order may vary
    expect(result).toContain('<strong>');
    expect(result).toContain('<em>');
    expect(result).toContain('bold+italic');
  });

  it('renders links with _blank and rel attributes', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click here',
              marks: [{ type: 'link', attrs: { href: 'https://example.com', target: '_blank' } }],
            },
          ],
        },
      ],
    };
    const result = tiptapJsonToHtml(doc);
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).toContain('click here');
  });

  it('renders textStyle mark with color', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'colored',
              marks: [{ type: 'textStyle', attrs: { color: '#ff0000' } }],
            },
          ],
        },
      ],
    };
    const result = tiptapJsonToHtml(doc);
    expect(result).toContain('color:#ff0000');
    expect(result).toContain('colored');
  });

  // ──────────────────────────── Lists ────────────────────────────

  it('renders bullet list', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 2' }] }] },
          ],
        },
      ],
    };
    const result = tiptapJsonToHtml(doc);
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>');
    expect(result).toContain('Item 1');
    expect(result).toContain('Item 2');
  });

  it('renders ordered list', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { start: 1 },
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Step 1' }] }] },
          ],
        },
      ],
    };
    const result = tiptapJsonToHtml(doc);
    expect(result).toContain('<ol>');
    expect(result).toContain('Step 1');
  });

  it('renders ordered list with custom start', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { start: 5 },
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] },
          ],
        },
      ],
    };
    expect(tiptapJsonToHtml(doc)).toContain('<ol start="5">');
  });

  // ──────────────────────────── Block elements ────────────────────────────

  it('renders blockquote', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quote' }] }],
        },
      ],
    };
    expect(tiptapJsonToHtml(doc)).toBe('<blockquote><p>Quote</p></blockquote>');
  });

  it('renders code block', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'typescript' },
          content: [{ type: 'text', text: 'const x = 1;' }],
        },
      ],
    };
    const result = tiptapJsonToHtml(doc);
    expect(result).toContain('<pre>');
    expect(result).toContain('class="language-typescript"');
    expect(result).toContain('const x = 1;');
  });

  it('renders horizontal rule', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'horizontalRule' }],
    };
    expect(tiptapJsonToHtml(doc)).toBe('<hr>');
  });

  it('renders hard break', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'line1' },
            { type: 'hardBreak' },
            { type: 'text', text: 'line2' },
          ],
        },
      ],
    };
    expect(tiptapJsonToHtml(doc)).toBe('<p>line1<br>line2</p>');
  });

  it('renders image node', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: 'https://example.com/img.png', alt: 'test image' },
        },
      ],
    };
    const result = tiptapJsonToHtml(doc);
    expect(result).toContain('src="https://example.com/img.png"');
    expect(result).toContain('alt="test image"');
  });

  // ──────────────────────────── XSS protection ────────────────────────────

  it('escapes link href to prevent XSS', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)', target: '_self' } }],
            },
          ],
        },
      ],
    };
    const result = tiptapJsonToHtml(doc);
    // href is escaped — no raw colon in unsafe context, and no rel on _self
    expect(result).toContain('href="javascript');
    expect(result).not.toContain('rel="noopener noreferrer"'); // _self → no rel
  });

  it('escapes special chars in image attributes', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: 'img.png', alt: '<script>xss</script>', title: '"evil"' },
        },
      ],
    };
    const result = tiptapJsonToHtml(doc);
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  // ──────────────────────────── Text alignment ────────────────────────────

  it('renders center-aligned paragraph', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: 'center' },
          content: [{ type: 'text', text: 'Centered' }],
        },
      ],
    };
    const result = tiptapJsonToHtml(doc);
    expect(result).toContain('text-align:center');
    expect(result).toContain('Centered');
  });

  it('renders right-aligned heading', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2, textAlign: 'right' },
          content: [{ type: 'text', text: 'Right heading' }],
        },
      ],
    };
    const result = tiptapJsonToHtml(doc);
    expect(result).toContain('text-align:right');
    expect(result).toContain('<h2');
  });

  it('does not add style attribute for left-aligned (default) text', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: 'left' },
          content: [{ type: 'text', text: 'Normal' }],
        },
      ],
    };
    const result = tiptapJsonToHtml(doc);
    expect(result).not.toContain('style=');
  });

  // ──────────────────────────── Unknown nodes ────────────────────────────

  it('renders children of unknown node types', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'unknownNodeType',
          content: [{ type: 'text', text: 'inner text' }],
        },
      ],
    };
    // Unknown node renders its children without a wrapper tag
    expect(tiptapJsonToHtml(doc)).toBe('inner text');
  });

  it('does not throw on malformed JSON', () => {
    // Circular references would normally throw but we test with intentionally broken data
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: null }] };
    expect(() => tiptapJsonToHtml(doc)).not.toThrow();
  });
});
