import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PdfGenerationService, isRenderRequestAllowed } from './pdf-generation.service';
import { buildSampleContext } from './sample-context';

/**
 * Unit-test voor de render-concurrency-semafoor (M5). We stubben `getBrowser` zodat
 * er geen echte Chromium wordt gestart; elke render blijft "hangen" totdat de test
 * hem vrijgeeft, zodat we het aantal gelijktijdig actieve renders kunnen meten.
 */
describe('PdfGenerationService — render concurrency', () => {
  const makeConfig = (overrides: Record<string, string | undefined> = {}) =>
    ({ get: (key: string) => overrides[key] }) as unknown as ConfigService;

  /** Bouw een service met een gestubde browser; page.pdf blokkeert op een externe gate. */
  function buildService(config: ConfigService) {
    const service = new PdfGenerationService(config);

    let active = 0;
    let peak = 0;
    const gates: Array<() => void> = [];

    const fakePage = () => ({
      setJavaScriptEnabled: jest.fn().mockResolvedValue(undefined),
      setRequestInterception: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockImplementation(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => gates.push(resolve));
        active -= 1;
        return Buffer.from('pdf');
      }),
      close: jest.fn().mockResolvedValue(undefined),
    });

    (service as unknown as { getBrowser: () => Promise<unknown> }).getBrowser = jest
      .fn()
      .mockResolvedValue({ newPage: jest.fn().mockImplementation(async () => fakePage()) });

    return {
      service,
      peak: () => peak,
      pending: () => gates.length,
      releaseOne: () => gates.shift()?.(),
      releaseAll: () => {
        while (gates.length) gates.shift()?.();
      },
    };
  }

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  it('begrenst gelijktijdige renders tot de standaardlimiet (3)', async () => {
    const h = buildService(makeConfig());
    const renders = Array.from({ length: 6 }, () => h.service.renderPdf('<p>x</p>'));

    await flush();
    expect(h.peak()).toBe(3); // niet meer dan 3 tegelijk actief

    h.releaseAll();
    await flush();
    h.releaseAll();
    await Promise.all(renders);
    expect(h.peak()).toBe(3);
  });

  it('respecteert PDF_MAX_CONCURRENCY override', async () => {
    const h = buildService(makeConfig({ PDF_MAX_CONCURRENCY: '2' }));
    const renders = Array.from({ length: 5 }, () => h.service.renderPdf('<p>x</p>'));

    await flush();
    expect(h.peak()).toBe(2);

    // Slot geeft direct door aan de wachtrij: 1 vrijgeven → 1 nieuwe start.
    h.releaseOne();
    await flush();
    expect(h.peak()).toBe(2);

    h.releaseAll();
    await flush();
    h.releaseAll();
    await Promise.all(renders);
  });
});

/**
 * B-311: header/footer-formatting — Puppeteer-tokens blijven werken, datalaag-
 * placeholders gaan door dezelfde Handlebars-resolver als de body, en het
 * vangnet stript onoplosbare `{{…}}`-tokens met een waarschuwing (mét template-id).
 */
describe('PdfGenerationService — header/footer placeholders (B-311)', () => {
  const makeConfig = () => ({ get: () => undefined }) as unknown as ConfigService;

  /** Service met gestubde browser die de page.pdf-opties vastlegt. */
  function buildCapturingService() {
    const service = new PdfGenerationService(makeConfig());
    const pdfCalls: Array<Record<string, unknown>> = [];

    const fakePage = {
      setJavaScriptEnabled: jest.fn().mockResolvedValue(undefined),
      setRequestInterception: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockImplementation(async (opts: Record<string, unknown>) => {
        pdfCalls.push(opts);
        return Buffer.from('pdf');
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (service as unknown as { getBrowser: () => Promise<unknown> }).getBrowser = jest
      .fn()
      .mockResolvedValue({ newPage: jest.fn().mockResolvedValue(fakePage) });

    return { service, pdfCalls };
  }

  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('vertaalt de vijf Puppeteer-tokens naar hun <span>-vorm', async () => {
    const { service, pdfCalls } = buildCapturingService();
    await service.renderPdf('<p>x</p>', {
      footerHtml: 'Pagina {{pageNumber}} van {{totalPages}} — {{date}} {{title}} {{url}}',
    });

    const footer = pdfCalls[0].footerTemplate as string;
    expect(footer).toContain('<span class="pageNumber"></span>');
    expect(footer).toContain('<span class="totalPages"></span>');
    expect(footer).toContain('<span class="date"></span>');
    expect(footer).toContain('<span class="title"></span>');
    expect(footer).toContain('<span class="url"></span>');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('lost datalaag-placeholders op via de gedeelde Handlebars-resolver (headerFooterContext)', async () => {
    const { service, pdfCalls } = buildCapturingService();
    const context = buildSampleContext();
    await service.renderPdf('<p>x</p>', {
      headerHtml: '<div>{{organization.name}} — Inspectieplan</div>',
      footerHtml: '<div>{{client.name}} · Pagina {{pageNumber}} van {{totalPages}}</div>',
      headerFooterContext: context,
      templateId: 'tpl-1',
    });

    const header = pdfCalls[0].headerTemplate as string;
    const footer = pdfCalls[0].footerTemplate as string;
    expect(header).toContain('InspeXi Demo B.V. — Inspectieplan');
    expect(header).not.toContain('{{organization.name}}');
    // Puppeteer-tokens overleven de Handlebars-pass (eerst naar spans omgezet).
    expect(footer).toContain('Voorbeeld Klant N.V.');
    expect(footer).toContain('<span class="pageNumber"></span>');
    expect(footer).toContain('<span class="totalPages"></span>');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('HTML-escapet opgeloste waarden (zelfde escaping als de body-resolver)', async () => {
    const { service, pdfCalls } = buildCapturingService();
    const context = buildSampleContext();
    context.organization.name = 'A&B <Installaties>';
    await service.renderPdf('<p>x</p>', {
      headerHtml: '<div>{{organization.name}}</div>',
      headerFooterContext: context,
    });

    const header = pdfCalls[0].headerTemplate as string;
    expect(header).toContain('A&amp;B &lt;Installaties&gt;');
    expect(header).not.toContain('<Installaties>');
  });

  it('stript onoplosbare placeholders (geen context) en waarschuwt mét template-id', async () => {
    const { service, pdfCalls } = buildCapturingService();
    await service.renderPdf('<p>x</p>', {
      headerHtml: '<div>{{organization.name}} — Inspectieplan</div>',
      templateId: 'tpl-311',
    });

    const header = pdfCalls[0].headerTemplate as string;
    expect(header).not.toContain('{{organization.name}}');
    expect(header).toContain('— Inspectieplan');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('{{organization.name}}'),
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('tpl-311'));
  });

  it('stript een mét context nog steeds onbekende (niet-parsebare) placeholder en waarschuwt', async () => {
    const { service, pdfCalls } = buildCapturingService();
    await service.renderPdf('<p>x</p>', {
      // `{{#if}}` zonder sluitblok compileert niet → resolver-pass faalt →
      // vangnet stript het token alsnog.
      headerHtml: '<div>{{#if kapot}}</div>',
      headerFooterContext: buildSampleContext(),
      templateId: 'tpl-312',
    });

    const header = pdfCalls[0].headerTemplate as string;
    expect(header).not.toContain('{{');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('tpl-312'));
  });

  it('wikkelt header/footer in een container met CJK-font in de stack (B-312)', async () => {
    const { service, pdfCalls } = buildCapturingService();
    await service.renderPdf('<p>x</p>', { headerHtml: '<div>Kop</div>' });
    expect(pdfCalls[0].headerTemplate as string).toContain("'Noto Sans CJK SC'");
  });
});

describe('isRenderRequestAllowed (Puppeteer request interception)', () => {
  it('allows the initial navigation (setContent) document', () => {
    expect(isRenderRequestAllowed('about:blank', true)).toBe(true);
  });

  it('allows embedded data: images', () => {
    expect(isRenderRequestAllowed('data:image/png;base64,iVBORw0KGgo=', false)).toBe(true);
  });

  it('aborts file: URLs (local-file read)', () => {
    expect(isRenderRequestAllowed('file:///etc/passwd', false)).toBe(false);
  });

  it('aborts http(s)/internal-host URLs (SSRF)', () => {
    expect(isRenderRequestAllowed('http://169.254.169.254/latest/meta-data', false)).toBe(false);
    expect(isRenderRequestAllowed('http://localhost:3000/internal', false)).toBe(false);
    expect(isRenderRequestAllowed('http://127.0.0.1/x', false)).toBe(false);
    expect(isRenderRequestAllowed('https://evil.example/x.png', false)).toBe(false);
  });
});
