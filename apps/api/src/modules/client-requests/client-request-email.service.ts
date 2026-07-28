// WP-B9 mitigatie B-403: klantverzoeken (herinspectie / nieuwe opdracht) hebben nog
// geen stafzijde (wachtrij/notificaties = Epic 2, zie docs/herstelplan/
// 03-beslispunten-backlog.md §C). Tot die er is krijgt de organisatie bij élk nieuw
// verzoek een directe e-mail, zodat er geen aanvraag stilletjes verdwijnt.
//
// Naar het voorbeeld van repair-email.service.ts: eigen Resend-client + inline
// NL-fallback-HTML; logt bij falen en gooit nooit (de klant-flow mag niet stranden
// op een e-mailprobleem). Onderwerp/omschrijving zijn vrije klant-invoer — álle
// geïnterpoleerde waarden gaan door escapeHtml() tegen HTML-/phishing-injectie.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { escapeHtml } from '@/common';

const WRAP_START =
  '<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #374151;">';
const WRAP_END = '</div>';

export interface NewClientRequestNotice {
  to: string[];
  orgName: string;
  requestTypeLabel: string;
  subject: string;
  description: string | null;
  preferredDate: Date | null;
  contactName: string | null;
  clientUserName: string | null;
  relatedProjectName: string | null;
}

@Injectable()
export class ClientRequestEmailService {
  private readonly logger = new Logger(ClientRequestEmailService.name);
  private resend: Resend;
  private fromEmail: string;

  constructor(private config: ConfigService) {
    this.resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
    this.fromEmail = this.config.get<string>('RESEND_FROM_EMAIL', 'noreply@inspexi.nl');
  }

  /** Nieuw klantverzoek → directe e-mail naar de organisatie (backoffice/management). */
  async sendNewRequestNotice(params: NewClientRequestNotice): Promise<void> {
    const {
      to,
      orgName,
      requestTypeLabel,
      subject,
      description,
      preferredDate,
      contactName,
      clientUserName,
      relatedProjectName,
    } = params;
    if (to.length === 0) return;

    const row = (label: string, value: string | null) =>
      value
        ? `<tr>
            <td style="padding: 4px 12px 4px 0; color: #6B7280; white-space: nowrap; vertical-align: top;">${label}</td>
            <td style="padding: 4px 0;">${value}</td>
          </tr>`
        : '';
    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: `Nieuw klantverzoek — ${subject}`,
        html: `${WRAP_START}
          <h2 style="color: #111827;">Nieuw klantverzoek via het klantportaal</h2>
          <p>Er is een nieuw verzoek ingediend. Dit verzoek is (nog) niet zichtbaar in het
          stafportaal — neem contact op met de indiener om het af te handelen.</p>
          <table style="border-collapse: collapse; margin: 16px 0;">
            ${row('Type', escapeHtml(requestTypeLabel))}
            ${row('Onderwerp', escapeHtml(subject))}
            ${row('Omschrijving', escapeHtml(description))}
            ${row(
              'Voorkeursdatum',
              preferredDate ? preferredDate.toLocaleDateString('nl-NL') : null,
            )}
            ${row('Opdrachtgever', escapeHtml(contactName))}
            ${row('Ingediend door', escapeHtml(clientUserName))}
            ${row('Gerelateerde inspectie', escapeHtml(relatedProjectName))}
          </table>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
          <p style="color: #6B7280; font-size: 12px;">Verstuurd door ${escapeHtml(orgName)} via InspeXi Beheer</p>
        ${WRAP_END}`,
      });
    } catch (error) {
      this.logger.error(`Klantverzoek-notificatie naar ${to.join(', ')} mislukt`, error);
    }
  }
}
