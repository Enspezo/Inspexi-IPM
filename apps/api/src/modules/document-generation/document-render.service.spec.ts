import { BadRequestException } from '@nestjs/common';
import { SectionType, TemplateMode } from '@prisma/client';
import { DocumentRenderService, RenderSection, RenderTemplateMeta } from './document-render.service';
import { BlockHtmlRendererService } from './renderers/block-html-renderer.service';
import { buildSampleContext } from './sample-context';

function baseTemplate(overrides: Partial<RenderTemplateMeta> = {}): RenderTemplateMeta {
  return {
    templateMode: TemplateMode.SECTIONS,
    pageSize: 'A4',
    orientation: 'portrait',
    marginTop: 20,
    marginBottom: 20,
    marginLeft: 25,
    marginRight: 20,
    headerHtml: null,
    footerHtml: null,
    coverPageHtml: null,
    contentBlocks: null,
    ...overrides,
  };
}

function section(overrides: Partial<RenderSection>): RenderSection {
  return {
    code: 'sec',
    title: 'Sectie',
    sectionType: SectionType.STATIC,
    contentHtml: null,
    repeatOn: null,
    repeatItemTemplate: null,
    condition: null,
    sortOrder: 0,
    pageBreakBefore: false,
    pageBreakAfter: false,
    includeInToc: true,
    parentSectionId: null,
    childSections: [],
    ...overrides,
  };
}

describe('DocumentRenderService', () => {
  let service: DocumentRenderService;

  beforeEach(() => {
    service = new DocumentRenderService(new BlockHtmlRendererService());
  });

  describe('mode dispatch', () => {
    it('renders SECTIONS mode as a full HTML document with Handlebars output', () => {
      const ctx = buildSampleContext();
      const html = service.renderHtml(
        baseTemplate(),
        [section({ code: 'intro', title: 'Inleiding', contentHtml: '<p>Ref: {{plan.reference}}</p>' })],
        ctx,
      );
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain(`Ref: ${ctx.plan.reference}`);
      expect(html).toContain('Inleiding');
    });

    it('delegates BLOCKS mode to the block renderer (full document)', () => {
      const blocks = [
        {
          id: '1',
          type: 'rich_text',
          width: 'full',
          order: 0,
          content: {
            tiptapJson: {
              type: 'doc',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Blokinhoud' }] }],
            },
          },
        },
      ];
      const html = service.renderHtml(
        baseTemplate({ templateMode: TemplateMode.BLOCKS, contentBlocks: blocks }),
        [],
        buildSampleContext(),
      );
      expect(html).toContain('<main class="page-content">');
      expect(html).toContain('Blokinhoud');
    });

    it('throws for DOCX mode (not rendered via HTML)', () => {
      expect(() =>
        service.renderHtml(baseTemplate({ templateMode: TemplateMode.DOCX }), [], buildSampleContext()),
      ).toThrow(BadRequestException);
    });
  });

  describe('SECTIONS rendering', () => {
    it('expands a REPEATING section over a context array (repeatOn)', () => {
      const html = service.renderHtml(
        baseTemplate(),
        [
          section({
            code: 'assets',
            title: 'Installaties',
            sectionType: SectionType.REPEATING,
            repeatOn: 'assets',
            repeatItemTemplate: '<li>{{item.name}}</li>',
          }),
        ],
        buildSampleContext(),
      );
      expect(html).toContain('<li>Hoofdverdeler HV-01</li>');
      expect(html).toContain('<li>Onderverdeler OV-12</li>');
    });

    it('renders a CONDITIONAL section when its condition is met', () => {
      const html = service.renderHtml(
        baseTemplate(),
        [
          section({
            code: 'cond',
            title: 'Bevindingen aanwezig',
            sectionType: SectionType.CONDITIONAL,
            condition: 'findings.length > 0',
            contentHtml: '<p>Er zijn bevindingen.</p>',
          }),
        ],
        buildSampleContext(),
      );
      expect(html).toContain('Er zijn bevindingen.');
    });

    it('omits a CONDITIONAL section when its condition is not met', () => {
      const html = service.renderHtml(
        baseTemplate(),
        [
          section({
            code: 'cond',
            title: 'Veel bevindingen',
            sectionType: SectionType.CONDITIONAL,
            condition: 'findings.length > 5',
            contentHtml: '<p>Dit hoort niet zichtbaar te zijn.</p>',
          }),
        ],
        buildSampleContext(),
      );
      expect(html).not.toContain('Dit hoort niet zichtbaar te zijn.');
    });

    it('replaces the TABLE_OF_CONTENTS placeholder with a generated TOC', () => {
      const html = service.renderHtml(
        baseTemplate(),
        [
          section({ code: 'toc', title: 'Inhoudsopgave', sectionType: SectionType.TABLE_OF_CONTENTS, sortOrder: 0 }),
          section({ code: 'intro', title: 'Inleiding', sortOrder: 1, contentHtml: '<p>Tekst</p>' }),
        ],
        buildSampleContext(),
      );
      expect(html).toContain('<nav class="toc">');
      // The static section's heading should appear as a TOC entry link.
      expect(html).toContain('Inleiding');
      expect(html).not.toContain('{{TABLE_OF_CONTENTS}}');
    });

    it('renders a cover page when provided', () => {
      const html = service.renderHtml(
        baseTemplate({ coverPageHtml: '<h1>{{organization.name}}</h1>' }),
        [],
        buildSampleContext(),
      );
      expect(html).toContain('cover-page');
      expect(html).toContain('InspeXi Demo B.V.');
    });
  });

  // B-312: tabellen mogen nooit voorbij de paginabreedte groeien en CJK-tekens
  // mogen niet stil wegvallen — beide wrappers dragen de fix in hun print-CSS.
  describe('render-CSS — tabeloverflow + CJK-fontstack (B-312)', () => {
    it('SECTIONS-wrapper bevat table-layout: fixed + breekbare cellen + CJK-font', () => {
      const html = service.renderHtml(baseTemplate(), [], buildSampleContext());
      expect(html).toContain('table-layout: fixed');
      expect(html).toContain('word-break: break-word');
      expect(html).toContain('overflow-wrap: anywhere');
      expect(html).toContain("'Noto Sans CJK SC'");
    });

    it('BLOCKS-wrapper bevat table-layout: fixed + breekbare cellen + CJK-font', () => {
      const html = service.renderHtml(
        baseTemplate({ templateMode: TemplateMode.BLOCKS, contentBlocks: [] }),
        [],
        buildSampleContext(),
      );
      expect(html).toContain('table-layout: fixed');
      expect(html).toContain('word-break: break-word');
      expect(html).toContain('overflow-wrap: anywhere');
      expect(html).toContain("'Noto Sans CJK SC'");
    });
  });
});
