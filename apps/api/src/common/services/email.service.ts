import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EmailTemplateType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { renderTemplate, wrapInEmailLayout } from '../../modules/email-templates/template-renderer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend;
  private fromEmail: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
    this.fromEmail = this.config.get<string>(
      'RESEND_FROM_EMAIL',
      'noreply@inspexi.nl',
    );
  }

  /**
   * Try to use a custom template for this org + type.
   * Returns rendered { subject, html } or null if no template exists.
   */
  private async tryCustomTemplate(
    orgId: string | undefined | null,
    type: EmailTemplateType,
    variables: Record<string, Record<string, string>>,
    orgName?: string,
  ): Promise<{ subject: string; html: string } | null> {
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
      return {
        subject: rendered.subject,
        html: wrapInEmailLayout(rendered.html, orgName),
      };
    } catch (error) {
      this.logger.error(`Failed to load custom template for ${type}`, error);
      return null;
    }
  }

  async sendPasswordReset(to: string, resetUrl: string, orgId?: string | null): Promise<void> {
    try {
      const custom = await this.tryCustomTemplate(orgId, EmailTemplateType.WACHTWOORD_RESET, {
        wachtwoord: { url: resetUrl },
        organisatie: { naam: 'InspeXi Beheer', email: this.fromEmail },
      });

      if (custom) {
        await this.resend.emails.send({ from: this.fromEmail, to, subject: custom.subject, html: custom.html });
        return;
      }

      await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: 'Wachtwoord resetten — InspeXi Beheer',
        html: `
          <h2>Wachtwoord resetten</h2>
          <p>Je hebt een verzoek ingediend om je wachtwoord te resetten.</p>
          <p><a href="${resetUrl}" style="background: #1E40AF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Wachtwoord resetten</a></p>
          <p>Deze link is 1 uur geldig.</p>
          <p>Als je dit verzoek niet hebt gedaan, kun je deze email negeren.</p>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${to}`, error);
    }
  }

  async sendEmailVerification(
    to: string,
    verifyUrl: string,
  ): Promise<void> {
    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: 'E-mailadres bevestigen — InspeXi Beheer',
        html: `
          <h2>E-mailadres bevestigen</h2>
          <p>Klik op de onderstaande knop om je e-mailadres te bevestigen.</p>
          <p><a href="${verifyUrl}" style="background: #1E40AF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">E-mail bevestigen</a></p>
          <p>Deze link is 24 uur geldig.</p>
        `,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send email verification to ${to}`,
        error,
      );
    }
  }

  async sendInvitation(
    to: string,
    inviteUrl: string,
    orgName: string,
    role: string,
    orgId?: string | null,
  ): Promise<void> {
    try {
      const custom = await this.tryCustomTemplate(orgId, EmailTemplateType.UITNODIGING, {
        organisatie: { naam: orgName, email: this.fromEmail },
        uitnodiging: { rol: role, url: inviteUrl },
      }, orgName);

      if (custom) {
        await this.resend.emails.send({ from: this.fromEmail, to, subject: custom.subject, html: custom.html });
        return;
      }

      await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: `Uitnodiging voor ${orgName} — InspeXi Beheer`,
        html: `
          <h2>Je bent uitgenodigd!</h2>
          <p>Je bent uitgenodigd om deel te nemen aan <strong>${orgName}</strong> als <strong>${role}</strong>.</p>
          <p><a href="${inviteUrl}" style="background: #1E40AF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Uitnodiging accepteren</a></p>
          <p>Deze uitnodiging is 7 dagen geldig.</p>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send invitation email to ${to}`, error);
    }
  }

  /** Builds an RFC 5321-compliant "Name <email>" from address string. */
  private buildFrom(senderName?: string | null, senderEmail?: string | null): string {
    if (senderEmail) {
      return senderName ? `${senderName} <${senderEmail}>` : senderEmail;
    }
    return this.fromEmail;
  }

  async sendNotificationEmail(
    to: string,
    title: string,
    body: string,
    opts?: {
      senderName?: string | null;
      senderEmail?: string | null;
      unsubscribeUrl?: string;
      orgId?: string | null;
      orgName?: string;
    },
  ): Promise<void> {
    const from = this.buildFrom(opts?.senderName, opts?.senderEmail);
    const unsubscribeFooter = opts?.unsubscribeUrl
      ? `Wilt u geen e-mails meer ontvangen? <a href="${opts.unsubscribeUrl}" style="color:#6B7280;">Klik hier om u af te melden.</a>`
      : 'U kunt uw notificatievoorkeuren aanpassen in uw profielinstellingen.';
    try {
      const custom = await this.tryCustomTemplate(opts?.orgId, EmailTemplateType.NOTIFICATIE, {
        organisatie: { naam: opts?.orgName ?? 'InspeXi Beheer', email: opts?.senderEmail ?? this.fromEmail },
        notificatie: { titel: title, bericht: body },
      }, opts?.orgName);

      if (custom) {
        await this.resend.emails.send({ from, to, subject: custom.subject, html: custom.html });
        return;
      }

      await this.resend.emails.send({
        from,
        to,
        subject: `${title} — InspeXi Beheer`,
        html: `
          <h2>${title}</h2>
          <p>${body}</p>
          <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
          <p style="color: #6B7280; font-size: 12px;">
            U ontvangt dit bericht omdat u een notificatie heeft ingeschakeld in InspeXi Beheer.
            ${unsubscribeFooter}
          </p>
        `,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send notification email to ${to}`,
        error,
      );
    }
  }

  async sendQuoteEmail(params: {
    to: string;
    cc?: string[];
    subject: string;
    bodyText: string;
    quoteUrl: string;
    orgName: string;
    senderName?: string | null;
    senderEmail?: string | null;
    orgId?: string | null;
    quoteNumber?: string;
    quoteTotal?: string;
    quoteValidUntil?: string;
    contactName?: string;
    contactEmail?: string;
    senderFirstName?: string;
    senderLastName?: string;
  }): Promise<void> {
    const from = this.buildFrom(params.senderName, params.senderEmail);
    try {
      const custom = await this.tryCustomTemplate(params.orgId, EmailTemplateType.OFFERTE_VERSTUURD, {
        organisatie: { naam: params.orgName, email: params.senderEmail ?? this.fromEmail },
        contact: {
          bedrijfsnaam: params.contactName ?? '',
          voornaam: '',
          achternaam: params.contactName ?? '',
          email: params.contactEmail ?? params.to,
        },
        offerte: {
          nummer: params.quoteNumber ?? '',
          onderwerp: params.subject,
          totaal: params.quoteTotal ?? '',
          vervalDatum: params.quoteValidUntil ?? '',
          url: params.quoteUrl,
        },
        gebruiker: {
          voornaam: params.senderFirstName ?? '',
          achternaam: params.senderLastName ?? '',
          email: params.senderEmail ?? this.fromEmail,
        },
      }, params.orgName);

      if (custom) {
        await this.resend.emails.send({ from, to: params.to, cc: params.cc, subject: custom.subject, html: custom.html });
        return;
      }

      await this.resend.emails.send({
        from,
        to: params.to,
        cc: params.cc,
        subject: params.subject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #111827;">${params.subject}</h2>
            <div style="color: #374151; white-space: pre-line;">${params.bodyText}</div>
            <div style="margin: 32px 0;">
              <a href="${params.quoteUrl}" style="background: #1E40AF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Offerte bekijken
              </a>
            </div>
            <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
            <p style="color: #6B7280; font-size: 12px;">
              Verstuurd via InspeXi Beheer door ${params.orgName}
            </p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send quote email to ${params.to}`, error);
      throw error;
    }
  }

  async sendQuoteAnswerEmail(params: {
    to: string;
    quoteNumber: string;
    answer: string;
    quoteUrl: string;
    orgName: string;
    senderName?: string | null;
    senderEmail?: string | null;
    orgId?: string | null;
  }): Promise<void> {
    const from = this.buildFrom(params.senderName, params.senderEmail);
    try {
      const custom = await this.tryCustomTemplate(params.orgId, EmailTemplateType.OFFERTE_ANTWOORD, {
        organisatie: { naam: params.orgName, email: params.senderEmail ?? this.fromEmail },
        contact: { bedrijfsnaam: '', voornaam: '', achternaam: '', email: params.to },
        offerte: {
          nummer: params.quoteNumber,
          onderwerp: '',
          totaal: '',
          vervalDatum: '',
          url: params.quoteUrl,
        },
      }, params.orgName);

      if (custom) {
        await this.resend.emails.send({ from, to: params.to, subject: custom.subject, html: custom.html });
        return;
      }

      await this.resend.emails.send({
        from,
        to: params.to,
        subject: `Antwoord op uw vraag — Offerte ${params.quoteNumber}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #111827;">Er is een antwoord op uw vraag</h2>
            <p style="color: #374151;">Betreffende offerte ${params.quoteNumber}</p>
            <div style="background: #F9FAFB; border-left: 4px solid #1E40AF; padding: 16px; margin: 16px 0; color: #374151;">
              ${params.answer}
            </div>
            <a href="${params.quoteUrl}" style="background: #1E40AF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Offerte bekijken
            </a>
            <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
            <p style="color: #6B7280; font-size: 12px;">Verstuurd door ${params.orgName}</p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send quote answer email to ${params.to}`, error);
    }
  }

  async sendContactEmail(
    to: string,
    subject: string,
    bodyHtml: string,
    opts?: { senderName?: string | null; senderEmail?: string | null },
  ): Promise<{ id?: string } | undefined> {
    const from = this.buildFrom(opts?.senderName, opts?.senderEmail);
    try {
      const result = await this.resend.emails.send({
        from,
        to,
        subject,
        html: bodyHtml,
      });
      return { id: result?.data?.id };
    } catch (error) {
      this.logger.error(`Failed to send contact email to ${to}`, error);
      throw error;
    }
  }
}
