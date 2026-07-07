import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { User, Role, Prisma, EmailTemplateType } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { STORAGE_PROVIDER, type StorageProvider } from '@/common/services/storage/storage.interface';
import { paginate, orgScope, assertFound, sanitizeStorageFilename } from '@/common';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { TEMPLATE_TYPE_PLACEHOLDERS, EMAIL_TEMPLATE_TYPE_LABELS } from './placeholder.config';
import { renderTemplate, wrapInEmailLayout } from './template-renderer';

const ALLOWED_ATTACHMENT_MIMES = /^(application\/pdf|image\/(jpeg|png|svg\+xml|webp)|application\/vnd\.(ms-excel|ms-powerpoint|openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document|presentationml\.presentation))|application\/msword|application\/zip|text\/csv)$/;

@Injectable()
export class EmailTemplatesService {
  private readonly logger = new Logger(EmailTemplatesService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
  ) {}

  async findAll(
    user: User,
    query: { search?: string; type?: EmailTemplateType; isActive?: boolean; page?: number; limit?: number },
  ) {
    const { search, type, isActive, page = 1, limit = 50 } = query;

    const where: Prisma.EmailTemplateWhereInput = { ...orgScope(user) };

    if (type) {
      where.type = type;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    return paginate(this.prisma.emailTemplate, {
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
      },
      page,
      limit,
    });
  }

  async findOne(id: string, user: User) {
    const template = assertFound(
      await this.prisma.emailTemplate.findUnique({
        where: { id },
        include: {
          creator: { select: { id: true, firstName: true, lastName: true } },
          attachments: { orderBy: { sortOrder: 'asc' } },
        },
      }),
      'E-mailsjabloon',
    );

    if (!user.roles.includes(Role.SUPERUSER) && template.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    return template;
  }

  async create(dto: CreateEmailTemplateDto, user: User) {
    const orgId = user.orgId;
    if (!orgId) {
      throw new ForbiddenException('Geen organisatie gekoppeld');
    }

    // Auto-deactivate existing active template of same type
    return this.prisma.$transaction(async (tx) => {
      await tx.emailTemplate.updateMany({
        where: { orgId, type: dto.type, isActive: true },
        data: { isActive: false },
      });

      return tx.emailTemplate.create({
        data: {
          orgId,
          type: dto.type,
          name: dto.name,
          subject: dto.subject,
          bodyJson: dto.bodyJson ?? {},
          bodyHtml: dto.bodyHtml,
          createdBy: user.id,
        },
        include: {
          creator: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });
  }

  async update(id: string, dto: UpdateEmailTemplateDto, user: User) {
    const template = await this.findOne(id, user);

    // If activating, deactivate other templates of the same type
    if (dto.isActive === true) {
      await this.prisma.emailTemplate.updateMany({
        where: {
          orgId: template.orgId,
          type: template.type,
          isActive: true,
          id: { not: template.id },
        },
        data: { isActive: false },
      });
    }

    return this.prisma.emailTemplate.update({
      where: { id: template.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.bodyJson !== undefined && { bodyJson: dto.bodyJson }),
        ...(dto.bodyHtml !== undefined && { bodyHtml: dto.bodyHtml }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async deactivate(id: string, user: User) {
    const template = await this.findOne(id, user);

    return this.prisma.emailTemplate.update({
      where: { id: template.id },
      data: { isActive: false },
    });
  }

  async duplicate(id: string, user: User) {
    const template = await this.findOne(id, user);

    const newTemplate = await this.prisma.emailTemplate.create({
      data: {
        orgId: template.orgId,
        type: template.type,
        name: `${template.name} (kopie)`,
        subject: template.subject,
        bodyJson: template.bodyJson ?? {},
        bodyHtml: template.bodyHtml,
        isActive: false,
        createdBy: user.id,
      },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
        attachments: { orderBy: { sortOrder: 'asc' } },
      },
    });

    // Copy attachments to new template
    if (template.attachments?.length) {
      for (const att of template.attachments) {
        try {
          const buffer = await this.storage.download(att.storageKey);
          const newKey = `${template.orgId}/et/${newTemplate.id}/${randomUUID()}-${sanitizeStorageFilename(att.originalName)}`;
          await this.storage.upload(newKey, buffer, att.mimeType);
          await this.prisma.emailTemplateAttachment.create({
            data: {
              emailTemplateId: newTemplate.id,
              orgId: template.orgId,
              storageKey: newKey,
              originalName: att.originalName,
              mimeType: att.mimeType,
              fileSize: att.fileSize,
              sortOrder: att.sortOrder,
            },
          });
        } catch (err) {
          this.logger.error(`Failed to copy attachment ${att.originalName}`, err);
        }
      }
    }

    return this.findOne(newTemplate.id, user);
  }

  getTypes() {
    return Object.entries(TEMPLATE_TYPE_PLACEHOLDERS).map(([type, placeholders]) => ({
      type,
      label: EMAIL_TEMPLATE_TYPE_LABELS[type] ?? type,
      placeholders,
    }));
  }

  preview(body: { subject: string; bodyHtml: string; type: EmailTemplateType }) {
    const sampleVars = this.getSampleVariables(body.type);
    const rendered = renderTemplate(
      { subject: body.subject, bodyHtml: body.bodyHtml },
      sampleVars,
    );
    return {
      subject: rendered.subject,
      html: wrapInEmailLayout(rendered.html, 'Voorbeeldbedrijf B.V.'),
    };
  }

  /**
   * Look up the active template for an org + type.
   * Used by EmailService and PlanningEmailService.
   */
  async getActiveTemplate(orgId: string, type: EmailTemplateType) {
    return this.prisma.emailTemplate.findFirst({
      where: { orgId, type, isActive: true },
    });
  }

  /**
   * Render an active template with variables, wrapped in email layout.
   * Returns null if no custom template exists.
   */
  async tryRender(
    orgId: string,
    type: EmailTemplateType,
    variables: Record<string, Record<string, string>>,
    orgName?: string,
  ): Promise<{ subject: string; html: string } | null> {
    const template = await this.getActiveTemplate(orgId, type);
    if (!template) return null;

    const rendered = renderTemplate(
      { subject: template.subject, bodyHtml: template.bodyHtml },
      variables,
    );

    return {
      subject: rendered.subject,
      html: wrapInEmailLayout(rendered.html, orgName),
    };
  }

  /**
   * Render a specific template by ID, wrapped in email layout.
   * Returns null if template does not exist or is not active.
   */
  async tryRenderById(
    id: string,
    variables: Record<string, Record<string, string>>,
    orgName?: string,
  ): Promise<{ subject: string; html: string } | null> {
    const template = await this.prisma.emailTemplate.findUnique({
      where: { id },
    });
    if (!template || !template.isActive) return null;

    const rendered = renderTemplate(
      { subject: template.subject, bodyHtml: template.bodyHtml },
      variables,
    );

    return {
      subject: rendered.subject,
      html: wrapInEmailLayout(rendered.html, orgName),
    };
  }

  private getSampleVariables(type: EmailTemplateType): Record<string, Record<string, string>> {
    const vars: Record<string, Record<string, string>> = {};

    const groups = TEMPLATE_TYPE_PLACEHOLDERS[type] ?? [];
    for (const group of groups) {
      const fields: Record<string, string> = {};
      for (const field of group.fields) {
        fields[field.key] = this.getSampleValue(group.entity, field.key);
      }
      vars[group.entity] = fields;
    }

    return vars;
  }

  private getSampleValue(entity: string, field: string): string {
    const samples: Record<string, Record<string, string>> = {
      organisatie: { naam: 'Voorbeeldbedrijf B.V.', email: 'info@voorbeeld.nl' },
      contact: { bedrijfsnaam: 'Klant B.V.', voornaam: 'Jan', achternaam: 'de Vries', email: 'jan@klant.nl' },
      offerte: { nummer: 'OFF-2026-001', onderwerp: 'Inspectie kantoorpand', totaal: '€ 1.250,00', vervalDatum: '28 maart 2026', url: 'https://voorbeeld.nl/offerte/123' },
      afspraak: { datum: 'maandag 3 maart 2026', tijd: '10:00', duur: '2 uur', locatie: 'Hoofdstraat 1, Amsterdam', product: 'Jaarlijkse inspectie', url: 'https://voorbeeld.nl/afspraak/456' },
      gebruiker: { voornaam: 'Pieter', achternaam: 'Bakker', email: 'pieter@voorbeeld.nl' },
      uitnodiging: { rol: 'Manager', url: 'https://voorbeeld.nl/invite/abc' },
      notificatie: { titel: 'Nieuwe taak toegewezen', bericht: 'U heeft een nieuwe taak ontvangen.' },
      wachtwoord: { url: 'https://voorbeeld.nl/reset/xyz' },
    };
    return samples[entity]?.[field] ?? `[${entity}.${field}]`;
  }

  // ─── Attachment CRUD ────────────────────────────────────

  async getAttachments(id: string, user: User) {
    await this.findOne(id, user); // tenant check
    return this.prisma.emailTemplateAttachment.findMany({
      where: { emailTemplateId: id },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async uploadAttachment(id: string, file: Express.Multer.File, user: User) {
    const template = await this.findOne(id, user);

    if (!ALLOWED_ATTACHMENT_MIMES.test(file.mimetype)) {
      throw new BadRequestException('Bestandstype niet toegestaan');
    }

    const storageKey = `${template.orgId}/et/${template.id}/${randomUUID()}-${sanitizeStorageFilename(file.originalname)}`;
    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    const maxSort = await this.prisma.emailTemplateAttachment.aggregate({
      where: { emailTemplateId: id },
      _max: { sortOrder: true },
    });

    return this.prisma.emailTemplateAttachment.create({
      data: {
        emailTemplateId: id,
        orgId: template.orgId,
        storageKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
  }

  async downloadAttachment(id: string, attachmentId: string, user: User) {
    await this.findOne(id, user); // tenant check

    const attachment = await this.prisma.emailTemplateAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment || attachment.emailTemplateId !== id) {
      throw new NotFoundException('Bijlage niet gevonden');
    }

    const buffer = await this.storage.download(attachment.storageKey);
    return { buffer, attachment };
  }

  async deleteAttachment(id: string, attachmentId: string, user: User) {
    await this.findOne(id, user); // tenant check

    const attachment = await this.prisma.emailTemplateAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment || attachment.emailTemplateId !== id) {
      throw new NotFoundException('Bijlage niet gevonden');
    }

    try {
      await this.storage.delete(attachment.storageKey);
    } catch (err) {
      this.logger.error(`Failed to delete attachment file ${attachment.storageKey}`, err);
    }

    await this.prisma.emailTemplateAttachment.delete({
      where: { id: attachmentId },
    });
  }

  /**
   * Load all attachments for an email template as Resend-compatible buffers.
   * Used by EmailService when sending emails with template attachments.
   */
  async getAttachmentsForSending(emailTemplateId: string): Promise<Array<{ filename: string; content: Buffer }>> {
    const attachments = await this.prisma.emailTemplateAttachment.findMany({
      where: { emailTemplateId },
      orderBy: { sortOrder: 'asc' },
    });

    const results: Array<{ filename: string; content: Buffer }> = [];
    for (const att of attachments) {
      try {
        const buffer = await this.storage.download(att.storageKey);
        results.push({ filename: att.originalName, content: buffer });
      } catch (err) {
        this.logger.error(`Failed to load email template attachment ${att.originalName}`, err);
      }
    }
    return results;
  }
}
