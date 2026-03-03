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
import { Readable } from 'stream';
import { PrismaService } from '@/prisma';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '@/common/services/storage/storage.interface';
import {
  CreateQuoteTemplateDto,
  UpdateQuoteTemplateDto,
  ListQuoteTemplatesQueryDto,
} from './dto';

const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
];

const ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'application/zip',
];

const RTF_MIME_TYPES = ['application/rtf', 'text/rtf'];

@Injectable()
export class QuoteTemplatesService {
  private readonly logger = new Logger(QuoteTemplatesService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
  ) {}

  async findAll(user: User, query: ListQuoteTemplatesQueryDto) {
    const { search, isActive, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.QuoteTemplateWhereInput = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (!user.roles.includes(Role.SUPERUSER)) {
      where.orgId = user.orgId!;
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.quoteTemplate.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
        include: {
          _count: { select: { attachments: true } },
        },
      }),
      this.prisma.quoteTemplate.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string, user: User) {
    const template = await this.prisma.quoteTemplate.findUnique({
      where: { id },
      include: {
        attachments: { orderBy: { sortOrder: 'asc' } },
        rtfRevisions: {
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

    if (!template) {
      throw new NotFoundException('Template niet gevonden');
    }

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
      },
      include: {
        attachments: { orderBy: { sortOrder: 'asc' } },
        rtfRevisions: {
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

  async deactivate(id: string, user: User) {
    const template = await this.findOne(id, user);

    return this.prisma.quoteTemplate.update({
      where: { id: template.id },
      data: { isActive: false },
    });
  }

  // ── RTF file management ─────────────────────────────────

  async uploadRtf(id: string, file: Express.Multer.File, user: User) {
    const template = await this.findOne(id, user);

    if (template.templateType !== 'RTF') {
      throw new BadRequestException('Dit is geen RTF template');
    }

    if (!RTF_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        'Alleen RTF bestanden zijn toegestaan (.rtf)',
      );
    }

    // Validate that required shortcode is present
    const rtfContent = file.buffer.toString('latin1');
    const hasOfferteregels = rtfContent.includes('[[offerteregels]]');
    const hasQuoteLines = rtfContent.includes('[[quote_lines]]');
    if (!hasOfferteregels && !hasQuoteLines) {
      throw new BadRequestException(
        'Het RTF bestand moet de shortcode [[offerteregels]] of [[quote_lines]] bevatten voor de offerteregels',
      );
    }

    // Convert RTF to HTML for preview
    let previewHtml: string;
    try {
      previewHtml = await this.convertRtfToHtml(file.buffer);
    } catch (err) {
      this.logger.warn(`RTF to HTML conversion failed: ${err}`);
      previewHtml =
        '<div style="padding:1rem;color:#666;">Preview kon niet gegenereerd worden</div>';
    }

    // If there is already an RTF file, archive it as a revision
    if (template.rtfStorageKey) {
      const maxVersion =
        await this.prisma.quoteTemplateRtfRevision.aggregate({
          where: { templateId: template.id },
          _max: { version: true },
        });
      await this.prisma.quoteTemplateRtfRevision.create({
        data: {
          templateId: template.id,
          storageKey: template.rtfStorageKey,
          fileName: template.rtfFileName!,
          fileSize: template.rtfFileSize!,
          uploadedById: user.id,
          version: (maxVersion._max.version ?? 0) + 1,
        },
      });
    }

    // Upload new file to storage
    const storageKey = `${template.orgId}/qt/${template.id}/rtf/${randomUUID()}-${file.originalname}`;
    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    // Update template with new RTF metadata
    return this.prisma.quoteTemplate.update({
      where: { id: template.id },
      data: {
        rtfStorageKey: storageKey,
        rtfFileName: file.originalname,
        rtfFileSize: file.size,
        rtfPreviewHtml: previewHtml,
      },
      include: {
        attachments: { orderBy: { sortOrder: 'asc' } },
        rtfRevisions: {
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

  async downloadRtf(id: string, user: User) {
    const template = await this.findOne(id, user);

    if (!template.rtfStorageKey) {
      throw new NotFoundException('Geen RTF bestand gevonden');
    }

    const buffer = await this.storage.download(template.rtfStorageKey);
    return {
      buffer,
      fileName: template.rtfFileName!,
      mimeType: 'application/rtf',
    };
  }

  async getRtfPreview(id: string, user: User) {
    const template = await this.findOne(id, user);

    if (!template.rtfPreviewHtml) {
      throw new NotFoundException('Geen RTF preview beschikbaar');
    }

    return { html: template.rtfPreviewHtml };
  }

  async getRtfRevisions(id: string, user: User) {
    const template = await this.findOne(id, user);

    return this.prisma.quoteTemplateRtfRevision.findMany({
      where: { templateId: template.id },
      orderBy: { version: 'desc' },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async downloadRtfRevision(
    id: string,
    revisionId: string,
    user: User,
  ) {
    await this.findOne(id, user);

    const revision =
      await this.prisma.quoteTemplateRtfRevision.findUnique({
        where: { id: revisionId },
      });

    if (!revision || revision.templateId !== id) {
      throw new NotFoundException('Revisie niet gevonden');
    }

    const buffer = await this.storage.download(revision.storageKey);
    return {
      buffer,
      fileName: revision.fileName,
      mimeType: 'application/rtf',
    };
  }

  private convertRtfToHtml(buffer: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const rtfToHtml = require('@iarna/rtf-to-html');

      const stream = new Readable();
      stream.push(buffer);
      stream.push(null);

      rtfToHtml.fromStream(
        stream,
        {
          template: (_doc: any, _defaults: any, content: string) => {
            return `<div class="rtf-preview">${content}</div>`;
          },
        },
        (err: Error | null, html: string) => {
          if (err) return reject(err);
          resolve(html);
        },
      );
    });
  }

  // ── Image upload for block editor ────────────────────────

  async uploadImage(
    id: string,
    file: Express.Multer.File,
    user: User,
  ) {
    const template = await this.findOne(id, user);

    if (!IMAGE_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Ongeldig bestandstype. Toegestaan: ${IMAGE_MIME_TYPES.join(', ')}`,
      );
    }

    const storageKey = `${template.orgId}/qt/${template.id}/img/${randomUUID()}-${file.originalname}`;
    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    return { storageKey, fileName: file.originalname };
  }

  async getImage(id: string, storageKey: string, user: User) {
    // Verify template access
    await this.findOne(id, user);

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

    if (!ATTACHMENT_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Ongeldig bestandstype voor bijlage`,
      );
    }

    const storageKey = `${template.orgId}/qt/${template.id}/att/${randomUUID()}-${file.originalname}`;
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
}
