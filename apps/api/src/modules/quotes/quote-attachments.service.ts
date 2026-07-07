import { Injectable, NotFoundException, ForbiddenException, Inject } from '@nestjs/common';
import { User, QuoteStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma';
import { assertFound, sanitizeStorageFilename } from '@/common';
import { StorageProvider, STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import { findQuoteForUser } from './quotes.helpers';

@Injectable()
export class QuoteAttachmentsService {
  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
  ) {}

  // Bijlagen (intern)
  async getAttachments(id: string, user: User) {
    const quote = await findQuoteForUser(this.prisma, id, user);
    return this.prisma.quoteAttachment.findMany({ where: { quoteId: quote.id }, orderBy: { sortOrder: 'asc' } });
  }

  async uploadAttachment(id: string, file: Express.Multer.File, user: User) {
    const quote = await findQuoteForUser(this.prisma, id, user);
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

  async downloadPublicAttachment(token: string, attachmentId: string) {
    const quote = assertFound(await this.prisma.quote.findUnique({ where: { publicToken: token }, select: { id: true, status: true } }), 'Offerte');
    const unavailableStatusesForDownload: QuoteStatus[] = [QuoteStatus.CONCEPT, QuoteStatus.TER_GOEDKEURING, QuoteStatus.GOEDGEKEURD];
    if (unavailableStatusesForDownload.includes(quote.status)) throw new ForbiddenException('Offerte is niet beschikbaar');
    const attachment = await this.prisma.quoteAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.quoteId !== quote.id) throw new NotFoundException('Bijlage niet gevonden');
    const buffer = await this.storage.download(attachment.storageKey);
    return { buffer, attachment };
  }
}
