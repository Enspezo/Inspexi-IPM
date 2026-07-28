import { Injectable, NotFoundException, ForbiddenException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User, QuoteStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma';
import { assertFound, publicTenantWhere, sanitizeStorageFilename, assertAllowedAttachmentUpload } from '@/common';
import { TenantContext } from '@/common/interfaces/tenant-context.interface';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { StorageProvider, STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import { findQuoteForUser } from './quotes.helpers';

@Injectable()
export class QuoteAttachmentsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
    private entitlements: EntitlementsService,
  ) {}

  // Bijlagen (intern)
  async getAttachments(id: string, user: User) {
    const quote = await findQuoteForUser(this.prisma, id, user);
    return this.prisma.quoteAttachment.findMany({ where: { quoteId: quote.id }, orderBy: { sortOrder: 'asc' } });
  }

  async uploadAttachment(id: string, file: Express.Multer.File, user: User) {
    const quote = await findQuoteForUser(this.prisma, id, user);
    // WP-B4: er stond hier helemaal géén typecontrole, terwijl deze bijlagen
    // ook via de publieke token-route worden geserveerd. Zelfde whitelist +
    // claim↔inhoud-kruiscontrole als documenten/sjabloon-bijlagen.
    assertAllowedAttachmentUpload(file);
    const storageKey = `${quote.orgId}/quotes/${quote.id}/${randomUUID()}-${sanitizeStorageFilename(file.originalname)}`;
    await this.storage.upload(storageKey, file.buffer, file.mimetype);
    const count = await this.prisma.quoteAttachment.count({ where: { quoteId: quote.id } });
    return this.prisma.quoteAttachment.create({
      data: { quoteId: quote.id, storageKey, fileName: file.originalname, mimeType: file.mimetype, fileSize: file.size, isStandard: false, sortOrder: count },
    });
  }

  async downloadAttachment(id: string, attachmentId: string, user: User) {
    const quote = await findQuoteForUser(this.prisma, id, user);
    const attachment = await this.prisma.quoteAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.quoteId !== quote.id) throw new NotFoundException('Bijlage niet gevonden');
    const buffer = await this.storage.download(attachment.storageKey);
    return { buffer, attachment };
  }

  async deleteAttachment(id: string, attachmentId: string, user: User) {
    const quote = await findQuoteForUser(this.prisma, id, user);
    const attachment = await this.prisma.quoteAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.quoteId !== quote.id) throw new NotFoundException('Bijlage niet gevonden');
    await this.storage.delete(attachment.storageKey);
    await this.prisma.quoteAttachment.delete({ where: { id: attachmentId } });
    return { deleted: true };
  }

  async downloadPublicAttachment(token: string, attachmentId: string, tenant?: TenantContext) {
    // B-152 (WP-B7): tenantbinding + entitlement tegen de eigenaar-org.
    const quote = assertFound(await this.prisma.quote.findFirst({
      where: { publicToken: token, ...publicTenantWhere(tenant, this.config, 'Offerte') },
      select: { id: true, orgId: true, status: true },
    }), 'Offerte');
    await this.entitlements.assertFeature(quote.orgId, 'CRM_COMPLEET');
    const unavailableStatusesForDownload: QuoteStatus[] = [QuoteStatus.CONCEPT, QuoteStatus.TER_GOEDKEURING, QuoteStatus.GOEDGEKEURD];
    if (unavailableStatusesForDownload.includes(quote.status)) throw new ForbiddenException('Offerte is niet beschikbaar');
    const attachment = await this.prisma.quoteAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.quoteId !== quote.id) throw new NotFoundException('Bijlage niet gevonden');
    const buffer = await this.storage.download(attachment.storageKey);
    return { buffer, attachment };
  }
}
