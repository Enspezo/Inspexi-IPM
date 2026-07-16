// Directe e-mails van de herstel-flow (PRD-14 §14.8), naar het voorbeeld van
// planning-email.service.ts: eigen Resend-client + inline NL-fallback-HTML.
// Alle methodes loggen bij falen en gooien nooit — de klant-flow (sign/claim)
// mag niet stranden op een e-mailprobleem.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

const WRAP_START =
  '<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #374151;">';
const WRAP_END = '</div>';

@Injectable()
export class RepairEmailService {
  private readonly logger = new Logger(RepairEmailService.name);
  private resend: Resend;
  private fromEmail: string;

  constructor(private config: ConfigService) {
    this.resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
    this.fromEmail = this.config.get<string>('RESEND_FROM_EMAIL', 'noreply@inspexi.nl');
  }

  /** Bevestiging + verklaring-PDF naar de invuller en/of de opdrachtgever. */
  async sendDeclarationConfirmation(params: {
    to: string;
    recipientName: string | null;
    orgName: string;
    referenceNumber: string | null;
    projectName: string;
    attachment: { filename: string; content: Buffer };
  }): Promise<void> {
    const { to, recipientName, orgName, referenceNumber, projectName, attachment } = params;
    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: `Herstelverklaring ondertekend — ${referenceNumber ?? projectName}`,
        html: `${WRAP_START}
          <h2 style="color: #111827;">Herstelverklaring ondertekend</h2>
          <p>Beste ${recipientName ?? 'heer/mevrouw'},</p>
          <p>De herstelverklaring voor inspectie <strong>${projectName}</strong>${
            referenceNumber ? ` (rapportnummer <strong>${referenceNumber}</strong>)` : ''
          } is digitaal ondertekend. U vindt de ondertekende verklaring als bijlage bij deze e-mail.</p>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
          <p style="color: #6B7280; font-size: 12px;">Verstuurd door ${orgName} via InspeXi Beheer</p>
        ${WRAP_END}`,
        attachments: [attachment],
      });
    } catch (error) {
      this.logger.error(`Herstelverklaring-bevestiging naar ${to} mislukt`, error);
    }
  }

  /** Conflictmelding: beide werkzaamheden-omschrijvingen + foto-aantallen naast elkaar. */
  async sendConflictNotice(params: {
    to: string;
    orgName: string;
    referenceNumber: string | null;
    projectName: string;
    findingDescription: string;
    winner: { description: string | null; photoCount: number };
    loser: { description: string | null; photoCount: number };
  }): Promise<void> {
    const { to, orgName, referenceNumber, projectName, findingDescription, winner, loser } = params;
    const block = (title: string, r: { description: string | null; photoCount: number }) => `
      <td style="vertical-align: top; padding: 8px; border: 1px solid #E5E7EB; width: 50%;">
        <strong>${title}</strong><br />
        ${r.description ?? '—'}<br />
        <span style="color: #6B7280; font-size: 12px;">${r.photoCount} foto('s)</span>
      </td>`;
    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: `Dubbele herstelmelding — ${referenceNumber ?? projectName}`,
        html: `${WRAP_START}
          <h2 style="color: #111827;">Dubbele herstelmelding</h2>
          <p>Voor de constatering <strong>${findingDescription}</strong> van inspectie
          <strong>${projectName}</strong>${referenceNumber ? ` (rapportnummer ${referenceNumber})` : ''}
          zijn twee herstelmeldingen binnengekomen. De eerste melding is doorgevoerd; de tweede is
          bewaard maar <strong>niet</strong> doorgevoerd.</p>
          <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
            <tr>${block('Doorgevoerde melding', winner)}${block('Niet doorgevoerde melding', loser)}</tr>
          </table>
          <p>Controleer of aanvullende actie nodig is.</p>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
          <p style="color: #6B7280; font-size: 12px;">Verstuurd door ${orgName} via InspeXi Beheer</p>
        ${WRAP_END}`,
      });
    } catch (error) {
      this.logger.error(`Conflictmelding naar ${to} mislukt`, error);
    }
  }

  /** Herinspectie-voorstel: alle kritieke constateringen zijn hersteld gemeld. */
  async sendReinspectionProposal(params: {
    to: string;
    orgName: string;
    referenceNumber: string | null;
    projectName: string;
  }): Promise<void> {
    const { to, orgName, referenceNumber, projectName } = params;
    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: `Alle kritieke constateringen hersteld gemeld — ${referenceNumber ?? projectName}`,
        html: `${WRAP_START}
          <h2 style="color: #111827;">Administratieve herinspectie inplannen?</h2>
          <p>Alle kritieke constateringen van inspectie <strong>${projectName}</strong>${
            referenceNumber ? ` (rapportnummer ${referenceNumber})` : ''
          } zijn hersteld gemeld. Wilt u een administratieve herinspectie inplannen?</p>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
          <p style="color: #6B7280; font-size: 12px;">Verstuurd door ${orgName} via InspeXi Beheer</p>
        ${WRAP_END}`,
      });
    } catch (error) {
      this.logger.error(`Herinspectie-voorstel naar ${to} mislukt`, error);
    }
  }
}
