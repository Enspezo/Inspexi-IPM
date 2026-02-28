import { Test, TestingModule } from '@nestjs/testing';
import { QuoteStatus, NotificationType } from '@prisma/client';
import { QuoteSchedulerService } from './quote-scheduler.service';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '@/modules/notifications/notifications.service';

describe('QuoteSchedulerService', () => {
  let service: QuoteSchedulerService;

  const mockPrismaService = {
    quote: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockNotificationsService = {
    dispatch: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuoteSchedulerService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<QuoteSchedulerService>(QuoteSchedulerService);
  });

  describe('expireOverdueQuotes', () => {
    it('should expire overdue quotes and send notifications', async () => {
      const expiredQuotes = [
        { id: 'q-1', quoteNumber: 'OFF-001', orgId: 'org-1', createdBy: 'user-1' },
        { id: 'q-2', quoteNumber: 'OFF-002', orgId: 'org-1', createdBy: 'user-2' },
      ];
      mockPrismaService.quote.findMany.mockResolvedValue(expiredQuotes);
      mockPrismaService.quote.update.mockResolvedValue({});

      await service.expireOverdueQuotes();

      // Should update both quotes
      expect(mockPrismaService.quote.update).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.quote.update).toHaveBeenCalledWith({
        where: { id: 'q-1' },
        data: { status: QuoteStatus.VERLOPEN },
      });
      expect(mockPrismaService.quote.update).toHaveBeenCalledWith({
        where: { id: 'q-2' },
        data: { status: QuoteStatus.VERLOPEN },
      });

      // Should send notifications
      expect(mockNotificationsService.dispatch).toHaveBeenCalledTimes(2);
      expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.OFFERTE_VERLOPEN,
          recipientUserIds: ['user-1'],
          entityId: 'q-1',
        }),
      );
    });

    it('should do nothing when no quotes are expired', async () => {
      mockPrismaService.quote.findMany.mockResolvedValue([]);

      await service.expireOverdueQuotes();

      expect(mockPrismaService.quote.update).not.toHaveBeenCalled();
      expect(mockNotificationsService.dispatch).not.toHaveBeenCalled();
    });

    it('should query for VERSTUURD and BEKEKEN statuses past validUntil', async () => {
      mockPrismaService.quote.findMany.mockResolvedValue([]);

      await service.expireOverdueQuotes();

      expect(mockPrismaService.quote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: { in: [QuoteStatus.VERSTUURD, QuoteStatus.BEKEKEN] },
            validUntil: { lt: expect.any(Date) },
          },
        }),
      );
    });

    it('should continue processing other quotes if one fails', async () => {
      const quotes = [
        { id: 'q-1', quoteNumber: 'OFF-001', orgId: 'org-1', createdBy: 'user-1' },
        { id: 'q-2', quoteNumber: 'OFF-002', orgId: 'org-1', createdBy: 'user-2' },
      ];
      mockPrismaService.quote.findMany.mockResolvedValue(quotes);
      mockPrismaService.quote.update
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({});

      await service.expireOverdueQuotes();

      // Should attempt to update both
      expect(mockPrismaService.quote.update).toHaveBeenCalledTimes(2);
      // Second quote should still be notified
      expect(mockNotificationsService.dispatch).toHaveBeenCalledTimes(1);
    });
  });
});
