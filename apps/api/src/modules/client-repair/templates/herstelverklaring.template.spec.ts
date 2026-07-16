// Herstelverklaring-template (PRD-14 §14.7): render van de zelfstandige HTML
// (preview zonder handtekening) en de marker-gebaseerde handtekening-injectie
// bij ondertekening — de rest van het document moet byte-identiek blijven.
import {
  renderDeclarationHtml,
  injectSignatureIntoDeclarationHtml,
  type DeclarationContext,
} from './herstelverklaring.template';

const buildContext = (overrides: Partial<DeclarationContext> = {}): DeclarationContext => ({
  org: { name: 'InspeXi Demo', logoDataUri: null, primaryColor: '#1E40AF' },
  plan: {
    referenceNumber: 'RAP-2026-001',
    projectName: 'Demo-inspectie',
    address: 'Zuidas 1, 1234 AB Amsterdam',
    plannedDate: '1 juli 2026',
  },
  filler: { contactName: 'Piet Hersteller', companyName: 'Herstel BV', email: 'piet@herstel.nl' },
  findings: [
    {
      seq: 2,
      shortDescription: 'Kapotte kabel',
      locationDescription: 'Meterkast',
      normReference: 'NEN 1010',
      classificationLabel: 'Kritiek',
      classificationColor: '#dc2626',
      repairDescription: 'Kabel vervangen',
      photos: [{ dataUri: 'data:image/jpeg;base64,AAA' }],
    },
    {
      seq: 5,
      shortDescription: 'Losse wandcontactdoos',
      locationDescription: null,
      normReference: null,
      classificationLabel: 'Gering',
      classificationColor: '#ca8a04',
      repairDescription: 'Doos vastgezet',
      photos: [],
    },
  ],
  signature: { imageDataUri: null, signedAt: null, ipAddress: null },
  generatedAt: '2 juli 2026 10:00',
  ...overrides,
});

// Hulpjes om de regio's rond de handtekening-markers te vergelijken.
const beforeSig = (html: string) => html.slice(0, html.indexOf('<!--SIG_IMG_START-->'));
const betweenSig = (html: string) =>
  html.slice(html.indexOf('<!--SIG_IMG_END-->'), html.indexOf('<!--SIG_META_START-->'));
const afterSig = (html: string) => html.slice(html.indexOf('<!--SIG_META_END-->'));

describe('renderDeclarationHtml', () => {
  it('rendert org, plan-kop, invuller en alle constateringen met volgnummer + werkzaamheden', () => {
    const html = renderDeclarationHtml(buildContext());

    expect(html).toContain('InspeXi Demo');
    expect(html).toContain('RAP-2026-001');
    expect(html).toContain('Piet Hersteller');
    expect(html).toContain('Herstel BV');

    // Elke constatering: volgnummer + korte omschrijving + herstelomschrijving.
    expect(html).toContain('<span class="finding-num">2.</span>');
    expect(html).toContain('Kapotte kabel');
    expect(html).toContain('Kabel vervangen');
    expect(html).toContain('<span class="finding-num">5.</span>');
    expect(html).toContain('Losse wandcontactdoos');
    expect(html).toContain('Doos vastgezet');

    // Bewijsfoto als data-URI (self-contained voor de PDF-renderer).
    expect(html).toContain('data:image/jpeg;base64,AAA');

    // De verklaring-zin zelf.
    expect(html).toContain('Ondergetekende verklaart');
  });

  it("toont 'Nog niet ondertekend' en laat de SIG-markers staan zolang er geen handtekening is", () => {
    const html = renderDeclarationHtml(buildContext());

    expect(html).toContain('Nog niet ondertekend');
    expect(html).not.toContain('Ondertekend op');
    for (const marker of [
      '<!--SIG_IMG_START-->',
      '<!--SIG_IMG_END-->',
      '<!--SIG_META_START-->',
      '<!--SIG_META_END-->',
    ]) {
      expect(html).toContain(marker);
    }
  });
});

describe('injectSignatureIntoDeclarationHtml', () => {
  const signature = {
    imageDataUri: 'data:image/png;base64,SIG',
    signedAtLabel: '2 juli 2026 10:05',
    ipAddress: '1.2.3.4',
  };

  it('vervangt de gemarkeerde regio’s door de handtekening-img en de metadataregel (met IP)', () => {
    const html = renderDeclarationHtml(buildContext());
    const injected = injectSignatureIntoDeclarationHtml(html, signature);

    expect(injected).toContain(
      '<!--SIG_IMG_START--><img src="data:image/png;base64,SIG" alt="Handtekening" /><!--SIG_IMG_END-->',
    );
    expect(injected).toContain(
      '<!--SIG_META_START-->Ondertekend op 2 juli 2026 10:05 (IP: 1.2.3.4)<!--SIG_META_END-->',
    );
    expect(injected).not.toContain('Nog niet ondertekend');
  });

  it('laat het IP weg wanneer dat niet bekend is', () => {
    const html = renderDeclarationHtml(buildContext());
    const injected = injectSignatureIntoDeclarationHtml(html, { ...signature, ipAddress: null });

    expect(injected).toContain('Ondertekend op 2 juli 2026 10:05<!--SIG_META_END-->');
    expect(injected).not.toContain('(IP:');
  });

  it('laat de rest van het document byte-identiek (prefix, midden en suffix rond de markers)', () => {
    const html = renderDeclarationHtml(buildContext());
    const injected = injectSignatureIntoDeclarationHtml(html, signature);

    expect(beforeSig(injected)).toBe(beforeSig(html));
    expect(betweenSig(injected)).toBe(betweenSig(html));
    expect(afterSig(injected)).toBe(afterSig(html));
  });

  it('is idempotent-veilig: opnieuw injecteren op al-geïnjecteerde HTML vervangt schoon', () => {
    const html = renderDeclarationHtml(buildContext());
    const first = injectSignatureIntoDeclarationHtml(html, signature);
    const second = injectSignatureIntoDeclarationHtml(first, {
      imageDataUri: 'data:image/png;base64,SIG2',
      signedAtLabel: '3 juli 2026 09:00',
      ipAddress: null,
    });

    // Nieuwe handtekening staat erin, de oude is volledig weg.
    expect(second).toContain('data:image/png;base64,SIG2');
    expect(second).not.toContain('data:image/png;base64,SIG"');
    expect(second).toContain('Ondertekend op 3 juli 2026 09:00');
    expect(second).not.toContain('2 juli 2026 10:05');

    // De rest van het document is nog altijd identiek aan de originele render.
    expect(beforeSig(second)).toBe(beforeSig(html));
    expect(betweenSig(second)).toBe(betweenSig(html));
    expect(afterSig(second)).toBe(afterSig(html));
  });
});
