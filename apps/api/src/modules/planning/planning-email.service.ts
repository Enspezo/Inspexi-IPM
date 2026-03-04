import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EmailTemplateType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../../common/services/storage/storage.interface';
import { renderTemplate, wrapInEmailLayout } from '../email-templates/template-renderer';

interface ConfirmationEmailParams {
  to: string;
  recipientName: string;
  productName: string;
  scheduledDate: Date | null;
  durationHours: number | null;
  locationName?: string;
  orgName: string;
  portalUrl: string;
  orgId?: string;
}

interface RescheduleEmailParams {
  to: string;
  recipientName: string;
  productName: string;
  reason: string;
  orgName: string;
  newPortalUrl: string;
  orgId?: string;
}

interface AcceptationRequestEmailParams {
  to: string;
  recipientName: string;
  productName: string;
  scheduledDate: Date | null;
  orgName: string;
  /** e.g. "Sessie 2/5" — shown in subject and heading for multi-day items */
  sessionLabel?: string;
  orgId?: string;
}

interface SessionConfirmationEmailParams {
  to: string;
  recipientName: string;
  productName: string;
  sessionNumber: number;
  totalSessions: number;
  scheduledDate: Date | null;
  durationHours: number | null;
  locationName?: string;
  orgName: string;
  portalUrl: string;
  orgId?: string;
}

@Injectable()
export class PlanningEmailService {
  private readonly logger = new Logger(PlanningEmailService.name);
  private resend: Resend;
  private fromEmail: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
  ) {
    this.resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
    this.fromEmail = this.config.get<string>('RESEND_FROM_EMAIL', 'noreply@inspexi.nl');
  }

  private async tryCustomTemplate(
    orgId: string | undefined,
    type: EmailTemplateType,
    variables: Record<string, Record<string, string>>,
    orgName?: string,
  ): Promise<{ subject: string; html: string; attachments: Array<{ filename: string; content: Buffer }> } | null> {
    if (!orgId) return null;
    try {
      const template = await this.prisma.emailTemplate.findFirst({
        where: { orgId, type, isActive: true },
      });
      if (!template) return null;

      const rendered = renderTemplate(
        { subject: template.subject, bodyHtml: template.bodyHtml },
        variables,
      );

      // Load template attachments
      const templateAttachments = await this.prisma.emailTemplateAttachment.findMany({
        where: { emailTemplateId: template.id },
        orderBy: { sortOrder: 'asc' },
      });
      const attachments: Array<{ filename: string; content: Buffer }> = [];
      for (const att of templateAttachments) {
        try {
          const buffer = await this.storage.download(att.storageKey);
          attachments.push({ filename: att.originalName, content: buffer });
        } catch (err) {
          this.logger.error(`Failed to load email template attachment ${att.originalName}`, err);
        }
      }

      return {
        subject: rendered.subject,
        html: wrapInEmailLayout(rendered.html, orgName),
        attachments,
      };
    } catch (error) {
      this.logger.error(`Failed to load custom template for ${type}`, error);
      return null;
    }
  }

  private formatDate(date: Date | null): string {
    if (!date) return 'Datum wordt nog bepaald';
    return date.toLocaleDateString('nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  private formatTime(date: Date | null): string {
    if (!date) return '';
    return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }

  private formatDuration(hours: number | null): string {
    if (!hours) return '';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (m === 0) return `${h} uur`;
    return `${h} uur ${m} minuten`;
  }

  async sendConfirmation(params: ConfirmationEmailParams): Promise<void> {
    const { to, recipientName, productName, scheduledDate, durationHours, locationName, orgName, portalUrl, orgId } = params;

    const dateStr = this.formatDate(scheduledDate);
    const timeStr = this.formatTime(scheduledDate);
    const durationStr = this.formatDuration(durationHours);

    try {
      const custom = await this.tryCustomTemplate(orgId, EmailTemplateType.AFSPRAAK_BEVESTIGING, {
        organisatie: { naam: orgName, email: this.fromEmail },
        contact: { bedrijfsnaam: '', voornaam: recipientName, achternaam: '', email: to },
        afspraak: {
          datum: dateStr,
          tijd: timeStr,
          duur: durationStr,
          locatie: locationName ?? '',
          product: productName,
          url: portalUrl,
        },
      }, orgName);

      if (custom) {
        await this.resend.emails.send({ from: this.fromEmail, to, subject: custom.subject, html: custom.html, attachments: custom.attachments.length > 0 ? custom.attachments : undefined });
        return;
      }

      await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: `Afspraakbevestiging: ${productName} — ${orgName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1E40AF;">Afspraakbevestiging</h2>
            <p>Beste ${recipientName},</p>
            <p>Hierbij bevestigen wij uw afspraak.</p>
            <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; width: 40%;">Dienst:</td>
                <td style="padding: 8px 0;">${productName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Datum:</td>
                <td style="padding: 8px 0;">${dateStr}</td>
              </tr>
              ${timeStr ? `<tr><td style="padding: 8px 0; font-weight: bold;">Tijd:</td><td style="padding: 8px 0;">${timeStr}</td></tr>` : ''}
              ${durationStr ? `<tr><td style="padding: 8px 0; font-weight: bold;">Duur:</td><td style="padding: 8px 0;">${durationStr}</td></tr>` : ''}
              ${locationName ? `<tr><td style="padding: 8px 0; font-weight: bold;">Locatie:</td><td style="padding: 8px 0;">${locationName}</td></tr>` : ''}
            </table>
            <p>
              <a href="${portalUrl}" style="background: #1E40AF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Afspraakdetails bekijken
              </a>
            </p>
            <p style="color: #6B7280; font-size: 14px;">
              U kunt via de afspraakpagina ook vragen stellen of een verzoek indienen om de afspraak te verzetten.
            </p>
            <p>Met vriendelijke groet,<br>${orgName}</p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send confirmation email to ${to}`, error);
    }
  }

  async sendRescheduleNotification(params: RescheduleEmailParams): Promise<void> {
    const { to, recipientName, productName, reason, orgName, newPortalUrl, orgId } = params;

    try {
      const custom = await this.tryCustomTemplate(orgId, EmailTemplateType.AFSPRAAK_VERPLAATST, {
        organisatie: { naam: orgName, email: this.fromEmail },
        contact: { bedrijfsnaam: '', voornaam: recipientName, achternaam: '', email: to },
        afspraak: {
          datum: '',
          tijd: '',
          duur: '',
          locatie: '',
          product: productName,
          url: newPortalUrl,
        },
      }, orgName);

      if (custom) {
        await this.resend.emails.send({ from: this.fromEmail, to, subject: custom.subject, html: custom.html, attachments: custom.attachments.length > 0 ? custom.attachments : undefined });
        return;
      }

      await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: `Afspraak verzet: ${productName} — ${orgName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #D97706;">Afspraak verzet</h2>
            <p>Beste ${recipientName},</p>
            <p>Helaas moet de volgende afspraak verzet worden:</p>
            <p><strong>${productName}</strong></p>
            <p><strong>Reden:</strong> ${reason}</p>
            <p>Een nieuwe afspraak wordt zo spoedig mogelijk ingepland. U ontvangt dan een nieuwe bevestiging.</p>
            <p>
              <a href="${newPortalUrl}" style="background: #1E40AF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Bekijk nieuwe afspraak
              </a>
            </p>
            <p>Met vriendelijke groet,<br>${orgName}</p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send reschedule notification to ${to}`, error);
    }
  }

  async sendAcceptationRequest(params: AcceptationRequestEmailParams): Promise<void> {
    const { to, recipientName, productName, scheduledDate, orgName, sessionLabel, orgId } = params;
    const dateStr = this.formatDate(scheduledDate);
    const timeStr = this.formatTime(scheduledDate);
    const subjectPrefix = sessionLabel ? `Acceptatieverzoek ${sessionLabel}: ` : 'Acceptatieverzoek afspraak: ';
    const headingLabel = sessionLabel ? `${sessionLabel}: ` : '';

    try {
      const custom = await this.tryCustomTemplate(orgId, EmailTemplateType.AFSPRAAK_ACCEPTATIE, {
        organisatie: { naam: orgName, email: this.fromEmail },
        gebruiker: { voornaam: recipientName, achternaam: '', email: to },
        afspraak: {
          datum: dateStr,
          tijd: timeStr,
          duur: '',
          locatie: '',
          product: productName,
          url: '',
        },
      }, orgName);

      if (custom) {
        await this.resend.emails.send({ from: this.fromEmail, to, subject: custom.subject, html: custom.html, attachments: custom.attachments.length > 0 ? custom.attachments : undefined });
        return;
      }

      await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: `${subjectPrefix}${productName} — ${orgName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1E40AF;">Afspraak acceptatieverzoek${sessionLabel ? ` — ${sessionLabel}` : ''}</h2>
            <p>Beste ${recipientName},</p>
            <p>U bent toegewezen aan ${headingLabel}de volgende afspraak en dient deze te accepteren of af te wijzen:</p>
            <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; width: 40%;">Dienst:</td>
                <td style="padding: 8px 0;">${productName}</td>
              </tr>
              ${sessionLabel ? `<tr><td style="padding: 8px 0; font-weight: bold;">Sessie:</td><td style="padding: 8px 0;">${sessionLabel}</td></tr>` : ''}
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Datum:</td>
                <td style="padding: 8px 0;">${dateStr}</td>
              </tr>
              ${timeStr ? `<tr><td style="padding: 8px 0; font-weight: bold;">Tijd:</td><td style="padding: 8px 0;">${timeStr}</td></tr>` : ''}
            </table>
            <p>Log in op het InspeXi platform om de afspraak te accepteren of af te wijzen.</p>
            <p>Met vriendelijke groet,<br>${orgName}</p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send acceptation request email to ${to}`, error);
    }
  }

  async sendSessionConfirmation(params: SessionConfirmationEmailParams): Promise<void> {
    const { to, recipientName, productName, sessionNumber, totalSessions, scheduledDate, durationHours, locationName, orgName, portalUrl, orgId } = params;

    const dateStr = this.formatDate(scheduledDate);
    const timeStr = this.formatTime(scheduledDate);
    const durationStr = this.formatDuration(durationHours);
    const sessionLabel = `Sessie ${sessionNumber}/${totalSessions}`;

    try {
      const custom = await this.tryCustomTemplate(orgId, EmailTemplateType.AFSPRAAK_BEVESTIGING, {
        organisatie: { naam: orgName, email: this.fromEmail },
        contact: { bedrijfsnaam: '', voornaam: recipientName, achternaam: '', email: to },
        afspraak: {
          datum: dateStr,
          tijd: timeStr,
          duur: durationStr,
          locatie: locationName ?? '',
          product: `${productName} — ${sessionLabel}`,
          url: portalUrl,
        },
      }, orgName);

      if (custom) {
        await this.resend.emails.send({ from: this.fromEmail, to, subject: custom.subject, html: custom.html, attachments: custom.attachments.length > 0 ? custom.attachments : undefined });
        return;
      }

      await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: `${sessionLabel} bevestigd: ${productName} — ${orgName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #059669;">Sessiebevestiging — ${sessionLabel}</h2>
            <p>Beste ${recipientName},</p>
            <p>Sessie ${sessionNumber} van ${totalSessions} voor <strong>${productName}</strong> is definitief bevestigd.</p>
            <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
              <tr>
                <td style="padding: 8px 0; font-weight: bold; width: 40%;">Dienst:</td>
                <td style="padding: 8px 0;">${productName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Sessie:</td>
                <td style="padding: 8px 0;">${sessionLabel}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; font-weight: bold;">Datum:</td>
                <td style="padding: 8px 0;">${dateStr}</td>
              </tr>
              ${timeStr ? `<tr><td style="padding: 8px 0; font-weight: bold;">Tijd:</td><td style="padding: 8px 0;">${timeStr}</td></tr>` : ''}
              ${durationStr ? `<tr><td style="padding: 8px 0; font-weight: bold;">Duur:</td><td style="padding: 8px 0;">${durationStr}</td></tr>` : ''}
              ${locationName ? `<tr><td style="padding: 8px 0; font-weight: bold;">Locatie:</td><td style="padding: 8px 0;">${locationName}</td></tr>` : ''}
            </table>
            <p>
              <a href="${portalUrl}" style="background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Afspraakdetails bekijken
              </a>
            </p>
            <p style="color: #6B7280; font-size: 14px;">
              U kunt via de afspraakpagina ook vragen stellen of een verzoek indienen om de sessie te verzetten.
            </p>
            <p>Met vriendelijke groet,<br>${orgName}</p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send session confirmation email to ${to}`, error);
    }
  }
}
