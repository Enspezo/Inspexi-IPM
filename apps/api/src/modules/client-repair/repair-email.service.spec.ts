// RepairEmailService (PRD-14 §14.8, review #1): invullernaam en werkzaamheden-
// omschrijving zijn vrije tekst van een (mogelijk anonieme) externe partij —
// álle geïnterpoleerde waarden moeten door escapeHtml() tegen HTML-/phishing-
// injectie in de mail naar PM/opdrachtgever. Verder: 'heer/mevrouw'-fallback en
// nooit-gooien bij een Resend-fout (de klant-flow mag niet stranden op e-mail).
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { RepairEmailService } from './repair-email.service';

// Resend nooit echt laden: de constructor krijgt een fake client waarvan we
// alleen emails.send() bekijken.
const mockEmailsSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockEmailsSend } })),
}));

describe('RepairEmailService', () => {
  let service: RepairEmailService;

  const config = {
    get: jest.fn((key: string, defaultValue?: string) =>
      key === 'RESEND_FROM_EMAIL' ? (defaultValue ?? 'noreply@inspexi.nl') : 're_test_key',
    ),
  } as unknown as ConfigService;

  // Injectie-payloads zoals een kwaadwillende hersteller ze zou invullen.
  const XSS_SCRIPT = `<script>alert(1)</script>`;
  const XSS_IMG = `<img src=x onerror="alert(1)">`;
  const ESCAPED_SCRIPT = '&lt;script&gt;alert(1)&lt;/script&gt;';
  const ESCAPED_IMG = '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;';

  const sentHtml = (): string => mockEmailsSend.mock.calls[0][0].html;

  const expectSanitized = (html: string) => {
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror="alert(1)"');
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockEmailsSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    service = new RepairEmailService(config);
  });

  describe('sendDeclarationConfirmation', () => {
    const params = {
      to: 'pm@test.nl',
      recipientName: XSS_SCRIPT,
      orgName: XSS_IMG,
      referenceNumber: '<b>RAP-1</b>',
      projectName: XSS_IMG,
      attachment: { filename: 'herstelverklaring.pdf', content: Buffer.from('pdf') },
    };

    it('escapet recipientName, projectName, orgName en referenceNumber in de HTML', async () => {
      await service.sendDeclarationConfirmation(params);

      expect(mockEmailsSend).toHaveBeenCalledTimes(1);
      const html = sentHtml();
      expect(html).toContain(`Beste ${ESCAPED_SCRIPT},`);
      expect(html).toContain(ESCAPED_IMG); // projectName én orgName
      expect(html).toContain('&lt;b&gt;RAP-1&lt;/b&gt;');
      expect(html).not.toContain('<b>RAP-1</b>');
      expectSanitized(html);

      // De verklaring-PDF reist mee als bijlage.
      expect(mockEmailsSend.mock.calls[0][0].attachments).toEqual([params.attachment]);
      expect(mockEmailsSend.mock.calls[0][0].to).toBe('pm@test.nl');
    });

    it("valt terug op 'heer/mevrouw' bij een lege invullernaam", async () => {
      await service.sendDeclarationConfirmation({ ...params, recipientName: null });

      expect(sentHtml()).toContain('Beste heer/mevrouw,');
    });

    it('laat de rapportnummer-passage weg zonder referenceNumber', async () => {
      await service.sendDeclarationConfirmation({ ...params, referenceNumber: null });

      expect(sentHtml()).not.toContain('rapportnummer');
    });

    it('logt en gooit NIET wanneer Resend faalt', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      mockEmailsSend.mockRejectedValue(new Error('resend down'));

      await expect(service.sendDeclarationConfirmation(params)).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('sendConflictNotice', () => {
    const params = {
      to: 'pm@test.nl',
      orgName: XSS_IMG,
      referenceNumber: '<b>RAP-1</b>',
      projectName: XSS_SCRIPT,
      findingDescription: XSS_IMG,
      winner: { description: XSS_SCRIPT, photoCount: 2 },
      loser: { description: XSS_IMG, photoCount: 0 },
    };

    it('escapet findingDescription, projectName, orgName en beide werkzaamheden-omschrijvingen', async () => {
      await service.sendConflictNotice(params);

      const html = sentHtml();
      expect(html).toContain(ESCAPED_SCRIPT); // projectName + winner.description
      expect(html).toContain(ESCAPED_IMG); // findingDescription + orgName + loser.description
      expect(html).toContain('&lt;b&gt;RAP-1&lt;/b&gt;');
      expectSanitized(html);
      // Foto-aantallen van beide meldingen staan naast elkaar.
      expect(html).toContain("2 foto('s)");
      expect(html).toContain("0 foto('s)");
    });

    it("toont '—' voor een melding zonder omschrijving", async () => {
      await service.sendConflictNotice({
        ...params,
        winner: { description: null, photoCount: 1 },
      });

      expect(sentHtml()).toContain('—');
    });

    it('logt en gooit NIET wanneer Resend faalt', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      mockEmailsSend.mockRejectedValue(new Error('resend down'));

      await expect(service.sendConflictNotice(params)).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('sendReinspectionProposal', () => {
    const params = {
      to: 'pm@test.nl',
      orgName: XSS_SCRIPT,
      referenceNumber: '<b>RAP-1</b>',
      projectName: XSS_IMG,
    };

    it('escapet projectName, orgName en referenceNumber', async () => {
      await service.sendReinspectionProposal(params);

      const html = sentHtml();
      expect(html).toContain(ESCAPED_SCRIPT);
      expect(html).toContain(ESCAPED_IMG);
      expect(html).toContain('&lt;b&gt;RAP-1&lt;/b&gt;');
      expectSanitized(html);
    });

    it('logt en gooit NIET wanneer Resend faalt', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      mockEmailsSend.mockRejectedValue(new Error('resend down'));

      await expect(service.sendReinspectionProposal(params)).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });
});
