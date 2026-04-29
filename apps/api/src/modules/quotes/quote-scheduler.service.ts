import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { QuoteStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '@/modules/notifications/notifications.service';

@Injectable()
export class QuoteSchedulerService {
  private readonly logger = new Logger(QuoteSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /**
   * Every day at 02:00 AM: find all quotes in VERSTUURD or BEKEKEN status
   * whose validUntil date has passed, and transition them to VERLOPEN.
   * Sends an OFFERTE_VERLOPEN notification to the quote creator.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async expireOverdueQuotes(): Promise<void> {
    this.logger.log('Running quote expiry check...');

    const now = new Date();

    const expiredQuotes = await this.prisma.quote.findMany({
      where: {
        status: { in: [QuoteStatus.VERSTUURD, QuoteStatus.BEKEKEN] },
        validUntil: { lt: now },
      },
      select: {
        id: true,
        quoteNumber: true,
        orgId: true,
        createdBy: true,
      },
    });

    if (expiredQuotes.length === 0) {
      this.logger.log('No quotes to expire.');
      return;
    }

    this.logger.log(`Expiring ${expiredQuotes.length} quote(s)...`);

    for (const quote of expiredQuotes) {
      try {
        await this.prisma.quote.update({
          where: { id: quote.id },
          data: { status: QuoteStatus.VERLOPEN },
        });

        // Notify quote creator
        this.notifications.dispatch({
          type: NotificationType.OFFERTE_VERLOPEN,
          orgId: quote.orgId,
          recipientUserIds: [quote.createdBy],
          title: 'Offerte verlopen',
          body: `Offerte ${quote.quoteNumber} is verlopen.`,
          entityType: 'quote',
          entityId: quote.id,
        });
      } catch (err) {
        this.logger.error(`Failed to expire quote ${quote.id}`, err);
      }
    }

    this.logger.log(`Expired ${expiredQuotes.length} quote(s).`);
  }
}
