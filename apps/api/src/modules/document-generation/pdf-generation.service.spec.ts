import { ConfigService } from '@nestjs/config';
import { PdfGenerationService } from './pdf-generation.service';

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
