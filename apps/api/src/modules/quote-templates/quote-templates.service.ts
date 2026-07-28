import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { User, Role, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as mammoth from 'mammoth';
import { PrismaService } from '@/prisma';
import {
  paginate,
  buildOrderBy,
  orgScope,
  assertFound,
  assertSameOrg,
  sanitizeStorageFilename,
  assertAllowedImageUpload,
  assertAllowedAttachmentUpload,
  assertUploadContentMatchesClaim,
} from '@/common';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '@/common/services/storage/storage.interface';
import {
  CreateQuoteTemplateDto,
  UpdateQuoteTemplateDto,
  ListQuoteTemplatesQueryDto,
  CreateFollowUpDto,
  UpdateFollowUpDto,
} from './dto';

const DOCX_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

@Injectable()
export class QuoteTemplatesService {
  private readonly logger = new Logger(QuoteTemplatesService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
  ) {}

  async findAll(user: User, query: ListQuoteTemplatesQueryDto) {
    const { search, isActive, page = 1, limit = 20, sortBy, sortOrder = 'desc' } = query;
    const ALLOWED_SORT_FIELDS = ['name', 'templateType', 'defaultValidityDays', 'requiresApproval', 'isActive', 'createdAt'];
    const orderBy = buildOrderBy(sortBy, sortOrder, ALLOWED_SORT_FIELDS, { name: 'asc' });

    const where: Prisma.QuoteTemplateWhereInput = { ...orgScope(user) };

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    return paginate(this.prisma.quoteTemplate, {
      where,
      include: {
        _count: { select: { attachments: true } },
      },
      orderBy,
      page,
      limit,
    });
  }

  async findOne(id: string, user: User) {
    const template = assertFound(await this.prisma.quoteTemplate.findUnique({
      where: { id },
      include: {
        attachments: { orderBy: { sortOrder: 'asc' } },
        docxRevisions: {
          orderBy: { version: 'desc' },
          take: 20,
          include: {
            uploadedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        sendEmailTemplate: {
          select: { id: true, name: true, type: true, subject: true, isActive: true },
        },
        acceptedEmailTemplate: {
          select: { id: true, name: true, type: true, subject: true, isActive: true },
        },
        followUpRules: {
          orderBy: { sortOrder: 'asc' },
          include: {
            emailTemplate: {
              select: { id: true, name: true, type: true, subject: true, isActive: true },
            },
            assigneeUser: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    }), 'Template');

    if (!user.roles.includes(Role.SUPERUSER) && template.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    return template;
  }

  async create(dto: CreateQuoteTemplateDto, user: User) {
    const orgId = user.orgId;
    if (!orgId && !user.roles.includes(Role.SUPERUSER)) {
      throw new ForbiddenException('Geen organisatie gekoppeld');
    }

    return this.prisma.quoteTemplate.create({
      data: {
        orgId: orgId!,
        name: dto.name,
        description: dto.description ?? null,
        templateType: dto.templateType ?? 'BLOCKS',
        ...((!dto.templateType || dto.templateType === 'BLOCKS') && {
          coverBlocks: dto.coverBlocks ?? undefined,
          contentBlocks: dto.contentBlocks ?? undefined,
          closingBlocks: dto.closingBlocks ?? undefined,
        }),
        defaultValidityDays: dto.defaultValidityDays ?? 30,
        requiresApproval: dto.requiresApproval ?? false,
      },
    });
  }

  async update(id: string, dto: UpdateQuoteTemplateDto, user: User) {
    const template = await this.findOne(id, user);

    // Referenced email templates are read back through the include below — verify
    // they belong to the caller's org so another org's template cannot be linked/leaked.
    if (dto.sendEmailTemplateId !== undefined)
      await assertSameOrg(this.prisma.emailTemplate, dto.sendEmailTemplateId, user.orgId, 'E-mailtemplate');
    if (dto.acceptedEmailTemplateId !== undefined)
      await assertSameOrg(this.prisma.emailTemplate, dto.acceptedEmailTemplateId, user.orgId, 'E-mailtemplate');

    // Template type cannot be changed after creation
    if (
      dto.templateType !== undefined &&
      dto.templateType !== template.templateType
    ) {
      throw new BadRequestException(
        'Template type kan niet gewijzigd worden na aanmaken',
      );
    }

    return this.prisma.quoteTemplate.update({
      where: { id: template.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.coverBlocks !== undefined && { coverBlocks: dto.coverBlocks }),
        ...(dto.contentBlocks !== undefined && {
          contentBlocks: dto.contentBlocks,
        }),
        ...(dto.closingBlocks !== undefined && {
          closingBlocks: dto.closingBlocks,
        }),
        ...(dto.defaultValidityDays !== undefined && {
          defaultValidityDays: dto.defaultValidityDays,
        }),
        ...(dto.requiresApproval !== undefined && {
          requiresApproval: dto.requiresApproval,
        }),
        ...(dto.sendEmailTemplateId !== undefined && {
          sendEmailTemplateId: dto.sendEmailTemplateId,
        }),
        ...(dto.sendEmailEnabled !== undefined && {
          sendEmailEnabled: dto.sendEmailEnabled,
        }),
        ...(dto.acceptedEmailTemplateId !== undefined && {
          acceptedEmailTemplateId: dto.acceptedEmailTemplateId,
        }),
        ...(dto.acceptedEmailEnabled !== undefined && {
          acceptedEmailEnabled: dto.acceptedEmailEnabled,
        }),
      },
      include: {
        attachments: { orderBy: { sortOrder: 'asc' } },
        docxRevisions: {
          orderBy: { version: 'desc' },
          take: 20,
          include: {
            uploadedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        sendEmailTemplate: {
          select: { id: true, name: true, type: true, subject: true, isActive: true },
        },
        acceptedEmailTemplate: {
          select: { id: true, name: true, type: true, subject: true, isActive: true },
        },
        followUpRules: {
          orderBy: { sortOrder: 'asc' },
          include: {
            emailTemplate: {
              select: { id: true, name: true, type: true, subject: true, isActive: true },
            },
            assigneeUser: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });
  }

  async deactivate(id: string, user: User) {
    const template = await this.findOne(id, user);

    return this.prisma.quoteTemplate.update({
      where: { id: template.id },
      data: { isActive: false },
    });
  }

  // ── DOCX file management ────────────────────────────────

  async uploadDocx(id: string, file: Express.Multer.File, user: User) {
    const template = await this.findOne(id, user);

    if (template.templateType !== 'DOCX') {
      throw new BadRequestException('Dit is geen DOCX template');
    }

    if (!DOCX_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Alleen DOCX bestanden zijn toegestaan (.docx)',
      );
    }
    // Een .docx is een ZIP; een niet-ZIP-buffer zou anders pas bij mammoth
    // stranden (500). Claim ↔ inhoud hier al afvangen → nette 400 (WP-B4).
    assertUploadContentMatchesClaim(file);

    // Validate that required placeholder is present using text extraction
    // Supports both loop syntax ({{#offerteregels}}) and simple placeholder ({{offerteregels}})
    const { value: textContent } = await mammoth.extractRawText({
      buffer: file.buffer,
    });
    const hasPlaceholder =
      textContent.includes('{{#offerteregels}}') ||
      textContent.includes('{{#quote_lines}}') ||
      textContent.includes('{{offerteregels}}') ||
      textContent.includes('{{quote_lines}}');
    if (!hasPlaceholder) {
      throw new BadRequestException(
        'Het DOCX bestand moet {{offerteregels}} of {{#offerteregels}}...{{/offerteregels}} bevatten voor de offerteregels',
      );
    }

    // If there is already a DOCX file, archive it as a revision
    if (template.docxStorageKey) {
      const maxVersion =
        await this.prisma.quoteTemplateDocxRevision.aggregate({
          where: { templateId: template.id },
          _max: { version: true },
        });
      await this.prisma.quoteTemplateDocxRevision.create({
        data: {
          templateId: template.id,
          storageKey: template.docxStorageKey,
          fileName: template.docxFileName!,
          fileSize: template.docxFileSize!,
          uploadedById: user.id,
          version: (maxVersion._max.version ?? 0) + 1,
        },
      });
    }

    // Upload new file to storage
    const storageKey = `${template.orgId}/qt/${template.id}/docx/${randomUUID()}-${sanitizeStorageFilename(file.originalname)}`;
    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    // Update template with new DOCX metadata
    return this.prisma.quoteTemplate.update({
      where: { id: template.id },
      data: {
        docxStorageKey: storageKey,
        docxFileName: file.originalname,
        docxFileSize: file.size,
      },
      include: {
        attachments: { orderBy: { sortOrder: 'asc' } },
        docxRevisions: {
          orderBy: { version: 'desc' },
          take: 20,
          include: {
            uploadedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });
  }

  async downloadDocx(id: string, user: User) {
    const template = await this.findOne(id, user);

    if (!template.docxStorageKey) {
      throw new NotFoundException('Geen DOCX bestand gevonden');
    }

    const buffer = await this.storage.download(template.docxStorageKey);
    return {
      buffer,
      fileName: template.docxFileName!,
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  async getDocxRevisions(id: string, user: User) {
    const template = await this.findOne(id, user);

    return this.prisma.quoteTemplateDocxRevision.findMany({
      where: { templateId: template.id },
      orderBy: { version: 'desc' },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async downloadDocxRevision(
    id: string,
    revisionId: string,
    user: User,
  ) {
    await this.findOne(id, user);

    const revision =
      await this.prisma.quoteTemplateDocxRevision.findUnique({
        where: { id: revisionId },
      });

    if (!revision || revision.templateId !== id) {
      throw new NotFoundException('Revisie niet gevonden');
    }

    const buffer = await this.storage.download(revision.storageKey);
    return {
      buffer,
      fileName: revision.fileName,
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  // ── Image upload for block editor ────────────────────────

  async uploadImage(
    id: string,
    file: Express.Multer.File,
    user: User,
  ) {
    const template = await this.findOne(id, user);

    // Inhoud (magic bytes) beslist type én opslagextensie; SVG is niet meer
    // toegestaan — deze afbeeldingen worden inline op het app-origin gerenderd
    // (block-editor + offerte-PDF) en waren zo een stored-XSS-vector (B-507).
    const detected = assertAllowedImageUpload(file);

    const storageKey = `${template.orgId}/qt/${template.id}/img/${randomUUID()}.${detected.extension}`;
    await this.storage.upload(storageKey, file.buffer, detected.mimeType);

    return { storageKey, fileName: file.originalname };
  }

  async getImage(id: string, storageKey: string, user: User) {
    // Verify template access
    const template = await this.findOne(id, user);

    // De route accepteert een vrije opslagsleutel (`:key(*)`); zonder deze
    // prefix-check kon élke opslagsleutel — ook die van een andere organisatie —
    // via een willekeurig eigen template-id uitgelezen worden. Scope op de
    // offertesjabloon-bestanden van de eigen org (`/qt/` i.p.v. `/qt/{id}/`,
    // omdat gekopieerde blokken naar afbeeldingen van een ander eigen sjabloon
    // kunnen verwijzen).
    if (!storageKey.startsWith(`${template.orgId}/qt/`)) {
      throw new NotFoundException('Afbeelding niet gevonden');
    }

    const exists = await this.storage.exists(storageKey);
    if (!exists) {
      throw new NotFoundException('Afbeelding niet gevonden');
    }

    const buffer = await this.storage.download(storageKey);
    return buffer;
  }

  // ── Template attachments ─────────────────────────────────

  async getAttachments(id: string, user: User) {
    const template = await this.findOne(id, user);
    return this.prisma.quoteTemplateAttachment.findMany({
      where: { templateId: template.id },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async uploadAttachment(
    id: string,
    file: Express.Multer.File,
    user: User,
  ) {
    const template = await this.findOne(id, user);

    assertAllowedAttachmentUpload(file);

    const storageKey = `${template.orgId}/qt/${template.id}/att/${randomUUID()}-${sanitizeStorageFilename(file.originalname)}`;
    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    const maxOrder = await this.prisma.quoteTemplateAttachment.aggregate({
      where: { templateId: template.id },
      _max: { sortOrder: true },
    });

    return this.prisma.quoteTemplateAttachment.create({
      data: {
        templateId: template.id,
        storageKey,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });
  }

  async downloadAttachment(
    id: string,
    attachmentId: string,
    user: User,
  ) {
    await this.findOne(id, user);

    const attachment = await this.prisma.quoteTemplateAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment || attachment.templateId !== id) {
      throw new NotFoundException('Bijlage niet gevonden');
    }

    const buffer = await this.storage.download(attachment.storageKey);
    return { buffer, attachment };
  }

  async deleteAttachment(
    id: string,
    attachmentId: string,
    user: User,
  ) {
    await this.findOne(id, user);

    const attachment = await this.prisma.quoteTemplateAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment || attachment.templateId !== id) {
      throw new NotFoundException('Bijlage niet gevonden');
    }

    await this.storage.delete(attachment.storageKey);
    await this.prisma.quoteTemplateAttachment.delete({
      where: { id: attachmentId },
    });

    return { success: true };
  }

  async reorderAttachments(
    id: string,
    attachmentIds: string[],
    user: User,
  ) {
    await this.findOne(id, user);

    await Promise.all(
      attachmentIds.map((attachmentId, index) =>
        this.prisma.quoteTemplateAttachment.update({
          where: { id: attachmentId },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.prisma.quoteTemplateAttachment.findMany({
      where: { templateId: id },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // ── Follow-up rules ─────────────────────────────────────

  private readonly FOLLOW_UP_INCLUDE = {
    emailTemplate: {
      select: { id: true, name: true, type: true, subject: true, isActive: true },
    },
    assigneeUser: {
      select: { id: true, firstName: true, lastName: true },
    },
  };

  async getFollowUpRules(id: string, user: User) {
    const template = await this.findOne(id, user);
    return this.prisma.quoteTemplateFollowUp.findMany({
      where: { templateId: template.id },
      orderBy: { sortOrder: 'asc' },
      include: this.FOLLOW_UP_INCLUDE,
    });
  }

  async createFollowUp(id: string, dto: CreateFollowUpDto, user: User) {
    const template = await this.findOne(id, user);

    // Both FKs are read back through FOLLOW_UP_INCLUDE and assigneeUserId later
    // assigns a task — validate they belong to the caller's org.
    await assertSameOrg(this.prisma.emailTemplate, dto.emailTemplateId, user.orgId, 'E-mailtemplate');
    await assertSameOrg(this.prisma.user, dto.assigneeUserId, user.orgId, 'Gebruiker');

    const maxOrder = await this.prisma.quoteTemplateFollowUp.aggregate({
      where: { templateId: template.id },
      _max: { sortOrder: true },
    });

    return this.prisma.quoteTemplateFollowUp.create({
      data: {
        templateId: template.id,
        type: dto.type,
        delayDays: dto.delayDays,
        isActive: dto.isActive ?? true,
        emailTemplateId: dto.emailTemplateId ?? null,
        defaultNotes: dto.defaultNotes ?? null,
        assigneeType: dto.assigneeType ?? 'QUOTE_OWNER',
        assigneeUserId: dto.assigneeUserId ?? null,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
      include: this.FOLLOW_UP_INCLUDE,
    });
  }

  async updateFollowUp(
    id: string,
    followUpId: string,
    dto: UpdateFollowUpDto,
    user: User,
  ) {
    await this.findOne(id, user);

    const followUp = await this.prisma.quoteTemplateFollowUp.findUnique({
      where: { id: followUpId },
    });

    if (!followUp || followUp.templateId !== id) {
      throw new NotFoundException('Follow-up regel niet gevonden');
    }

    // Validate re-pointed FKs against the caller's org (read back via FOLLOW_UP_INCLUDE).
    if (dto.emailTemplateId !== undefined)
      await assertSameOrg(this.prisma.emailTemplate, dto.emailTemplateId, user.orgId, 'E-mailtemplate');
    if (dto.assigneeUserId !== undefined)
      await assertSameOrg(this.prisma.user, dto.assigneeUserId, user.orgId, 'Gebruiker');

    return this.prisma.quoteTemplateFollowUp.update({
      where: { id: followUpId },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.delayDays !== undefined && { delayDays: dto.delayDays }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.emailTemplateId !== undefined && {
          emailTemplateId: dto.emailTemplateId,
        }),
        ...(dto.defaultNotes !== undefined && {
          defaultNotes: dto.defaultNotes,
        }),
        ...(dto.assigneeType !== undefined && {
          assigneeType: dto.assigneeType,
        }),
        ...(dto.assigneeUserId !== undefined && {
          assigneeUserId: dto.assigneeUserId,
        }),
      },
      include: this.FOLLOW_UP_INCLUDE,
    });
  }

  async deleteFollowUp(id: string, followUpId: string, user: User) {
    await this.findOne(id, user);

    const followUp = await this.prisma.quoteTemplateFollowUp.findUnique({
      where: { id: followUpId },
    });

    if (!followUp || followUp.templateId !== id) {
      throw new NotFoundException('Follow-up regel niet gevonden');
    }

    await this.prisma.quoteTemplateFollowUp.delete({
      where: { id: followUpId },
    });

    return { success: true };
  }
}
