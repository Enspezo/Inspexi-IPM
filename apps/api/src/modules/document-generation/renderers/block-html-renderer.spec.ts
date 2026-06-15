import { Test, TestingModule } from '@nestjs/testing';
import { BlockHtmlRendererService } from './block-html-renderer.service';

describe('BlockHtmlRendererService', () => {
  let service: BlockHtmlRendererService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BlockHtmlRendererService],
    }).compile();

    service = module.get<BlockHtmlRendererService>(BlockHtmlRendererService);
  });

  // ──────────────────────────── renderBlock ────────────────────────────

  describe('renderBlock', () => {
    it('renders a rich_text block', () => {
      const result = service.renderBlock({
        id: '1',
        type: 'rich_text',
        width: 'full',
        order: 0,
        content: {
          tiptapJson: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
          },
        },
      });
      expect(result).toContain('<p>Hello</p>');
    });

    it('renders a divider block with solid style', () => {
      const result = service.renderBlock({
        id: '2',
        type: 'divider',
        width: 'full',
        order: 0,
        content: { style: 'solid', color: '#e5e7eb' },
      });
      expect(result).toContain('<hr');
      expect(result).toContain('solid');
    });

    it('renders a spacer block with correct height', () => {
      const result = service.renderBlock({
        id: '3',
        type: 'spacer',
        width: 'full',
        order: 0,
        content: { height: 64 },
      });
      expect(result).toContain('height:64px');
    });

    it('renders a spacer block with default height when missing', () => {
      const result = service.renderBlock({
        id: '4',
        type: 'spacer',
        width: 'full',
        order: 0,
        content: {},
      });
      expect(result).toContain('height:32px');
    });

    it('renders placeholder as {{key}} in production mode', () => {
      const result = service.renderBlock(
        {
          id: '5',
          type: 'placeholder',
          width: 'full',
          order: 0,
          content: { placeholder: 'organization.name', label: 'Organisatienaam' },
        },
        { previewMode: false },
      );
      expect(result).toBe('{{organization.name}}');
    });

    it('renders placeholder with yellow highlight in preview mode', () => {
      const result = service.renderBlock(
        {
          id: '6',
          type: 'placeholder',
          width: 'full',
          order: 0,
          content: { placeholder: 'client.name', label: 'Klantnaam' },
        },
        { previewMode: true },
      );
      expect(result).toContain('{{Klantnaam}}');
      expect(result).toContain('fef9c3'); // yellow background
    });

    it('renders image placeholder when no URL or storage key', () => {
      const result = service.renderBlock({
        id: '7',
        type: 'image',
        width: 'full',
        order: 0,
        content: {},
      });
      expect(result).toContain('block-image-placeholder');
    });

    it('renders image with url when provided', () => {
      const result = service.renderBlock({
        id: '8',
        type: 'image',
        width: 'full',
        order: 0,
        content: { url: 'https://example.com/photo.jpg', alt: 'test' },
      });
      expect(result).toContain('src="https://example.com/photo.jpg"');
      expect(result).toContain('alt="test"');
    });

    it('renders findings_table as HTML comment in non-preview mode', () => {
      const result = service.renderBlock(
        {
          id: '9',
          type: 'findings_table',
          width: 'full',
          order: 0,
          content: { showClassification: true, groupBy: 'asset' },
        },
        { previewMode: false },
      );
      expect(result).toContain('<!-- FINDINGS_TABLE:');
    });

    it('renders findings_table as styled block in preview mode', () => {
      const result = service.renderBlock(
        {
          id: '10',
          type: 'findings_table',
          width: 'full',
          order: 0,
          content: {},
        },
        { previewMode: true },
      );
      expect(result).toContain('block-inspection');
      expect(result).toContain('Bevindingentabel');
    });

    it('renders signature_block with signer columns in preview mode', () => {
      const result = service.renderBlock(
        {
          id: '11',
          type: 'signature_block',
          width: 'full',
          order: 0,
          content: { signerRoles: ['inspector', 'client'], showDate: true },
        },
        { previewMode: true },
      );
      expect(result).toContain('Inspecteur');
      expect(result).toContain('Opdrachtgever');
      expect(result).toContain('Datum');
    });

    it('renders unknown block type as comment in non-preview mode', () => {
      const result = service.renderBlock(
        {
          id: '12',
          type: 'custom_widget',
          width: 'full',
          order: 0,
          content: {},
        },
        { previewMode: false },
      );
      expect(result).toContain('<!-- UNKNOWN_BLOCK: custom_widget -->');
    });
  });

  // ──────────────────────────── renderBlocksToFragment ────────────────────────────

  describe('renderBlocksToFragment', () => {
    it('sorts blocks by order', () => {
      const result = service.renderBlocksToFragment([
        { id: 'b', type: 'rich_text', width: 'full', order: 2, content: { tiptapJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] } } },
        { id: 'a', type: 'rich_text', width: 'full', order: 1, content: { tiptapJson: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] } } },
      ]);
      const firstIdx = result.indexOf('first');
      const secondIdx = result.indexOf('second');
      expect(firstIdx).toBeLessThan(secondIdx);
    });

    it('wraps two consecutive half-width blocks in a flexbox row', () => {
      const result = service.renderBlocksToFragment([
        { id: 'l', type: 'divider', width: 'half', order: 1, content: {} },
        { id: 'r', type: 'divider', width: 'half', order: 2, content: {} },
      ]);
      expect(result).toContain('display:flex');
      // Both dividers should appear
      const hrCount = (result.match(/<hr/g) ?? []).length;
      expect(hrCount).toBe(2);
    });

    it('wraps a lone half-width block in a 50% container', () => {
      const result = service.renderBlocksToFragment([
        { id: 'x', type: 'divider', width: 'half', order: 1, content: {} },
      ]);
      expect(result).toContain('width:50%');
    });

    it('does not wrap full-width blocks in flex', () => {
      const result = service.renderBlocksToFragment([
        { id: 'a', type: 'divider', width: 'full', order: 1, content: {} },
        { id: 'b', type: 'divider', width: 'full', order: 2, content: {} },
      ]);
      expect(result).not.toContain('display:flex');
    });

    it('handles empty block array', () => {
      expect(service.renderBlocksToFragment([])).toBe('');
    });
  });

  // ──────────────────────────── renderFullDocument ────────────────────────────

  describe('renderFullDocument', () => {
    it('returns a valid HTML document', () => {
      const result = service.renderFullDocument([]);
      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<html');
      expect(result).toContain('<head>');
      expect(result).toContain('<body>');
      expect(result).toContain('</html>');
    });

    it('includes @page CSS with correct page size', () => {
      const result = service.renderFullDocument([], { pageSize: 'Letter', orientation: 'landscape' });
      expect(result).toContain('size: Letter landscape');
    });

    it('includes margins in @page CSS', () => {
      const result = service.renderFullDocument([], {
        marginTop: 15,
        marginRight: 20,
        marginBottom: 15,
        marginLeft: 20,
      });
      expect(result).toContain('margin: 15mm 20mm 15mm 20mm');
    });

    it('includes header HTML when provided', () => {
      const result = service.renderFullDocument([], { headerHtml: '<div>Test Header</div>' });
      expect(result).toContain('<header class="page-header">');
      expect(result).toContain('Test Header');
    });

    it('includes footer HTML when provided', () => {
      const result = service.renderFullDocument([], { footerHtml: '<div>Page {{pageNumber}}</div>' });
      expect(result).toContain('<footer class="page-footer">');
      expect(result).toContain('Page {{pageNumber}}');
    });

    it('includes cover page when provided', () => {
      const result = service.renderFullDocument([], { coverPageHtml: '<div>Cover</div>' });
      expect(result).toContain('page-break-after:always');
      expect(result).toContain('Cover');
    });

    it('includes preview-specific styles in previewMode', () => {
      const result = service.renderFullDocument([], { previewMode: true });
      expect(result).toContain('max-width: 800px');
    });

    it('sets correct lang attribute', () => {
      const resultNl = service.renderFullDocument([], { locale: 'nl' });
      expect(resultNl).toContain('lang="nl"');

      const resultEn = service.renderFullDocument([], { locale: 'en' });
      expect(resultEn).toContain('lang="en"');
    });

    it('renders block content inside the document', () => {
      const result = service.renderFullDocument(
        [
          {
            id: '1',
            type: 'rich_text',
            width: 'full',
            order: 1,
            content: {
              tiptapJson: {
                type: 'doc',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Document content' }] }],
              },
            },
          },
        ],
        { previewMode: false },
      );
      expect(result).toContain('Document content');
      expect(result).toContain('<main class="page-content">');
    });
  });
});
