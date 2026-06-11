import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhooksController } from './webhooks.controller';
import { PrismaService } from '@/prisma';

describe('WebhooksController', () => {
  let controller: WebhooksController;

  const mockPrismaService = {
    contactEmail: {
      updateMany: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const makeRequest = (body: any, rawBody?: Buffer) =>
    ({ body, rawBody }) as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<WebhooksController>(WebhooksController);
  });

  describe('handleResend', () => {
    it('should acknowledge events without signature check when no secret is configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const result = await controller.handleResend(
        makeRequest({ type: 'email.sent', data: {} }),
        'id',
        'ts',
        'sig',
      );

      expect(result).toEqual({ received: true });
      expect(mockPrismaService.contactEmail.updateMany).not.toHaveBeenCalled();
    });

    it('should mark ContactEmail as opened on email.opened events', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      mockPrismaService.contactEmail.updateMany.mockResolvedValue({ count: 1 });

      const result = await controller.handleResend(
        makeRequest({ type: 'email.opened', data: { email_id: 'resend-1' } }),
        'id',
        'ts',
        'sig',
      );

      expect(result).toEqual({ received: true });
      expect(mockPrismaService.contactEmail.updateMany).toHaveBeenCalledWith({
        where: { resendId: 'resend-1', openedAt: null },
        data: { openedAt: expect.any(Date) },
      });
    });

    it('should fall back to data.id when email_id is missing', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      mockPrismaService.contactEmail.updateMany.mockResolvedValue({ count: 0 });

      await controller.handleResend(
        makeRequest({ type: 'email.opened', data: { id: 'resend-2' } }),
        'id',
        'ts',
        'sig',
      );

      expect(mockPrismaService.contactEmail.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { resendId: 'resend-2', openedAt: null },
        }),
      );
    });

    it('should skip the update when email.opened has no email id', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const result = await controller.handleResend(
        makeRequest({ type: 'email.opened', data: {} }),
        'id',
        'ts',
        'sig',
      );

      expect(result).toEqual({ received: true });
      expect(mockPrismaService.contactEmail.updateMany).not.toHaveBeenCalled();
    });

    it('should not fail the webhook when the database update throws', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      mockPrismaService.contactEmail.updateMany.mockRejectedValue(
        new Error('DB down'),
      );

      const result = await controller.handleResend(
        makeRequest({ type: 'email.opened', data: { email_id: 'resend-3' } }),
        'id',
        'ts',
        'sig',
      );

      expect(result).toEqual({ received: true });
    });

    it('should reject when a secret is configured but rawBody is missing', async () => {
      mockConfigService.get.mockReturnValue('whsec_secret');

      await expect(
        controller.handleResend(
          makeRequest({ type: 'email.sent', data: {} }, undefined),
          'id',
          'ts',
          'sig',
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.handleResend(
          makeRequest({ type: 'email.sent', data: {} }, undefined),
          'id',
          'ts',
          'sig',
        ),
      ).rejects.toThrow('Raw body not available');
    });

    it('should reject events with an invalid svix signature', async () => {
      mockConfigService.get.mockReturnValue('whsec_c2VjcmV0LXNlY3JldC1zZWNyZXQ=');

      await expect(
        controller.handleResend(
          makeRequest(
            { type: 'email.sent', data: {} },
            Buffer.from('{"type":"email.sent","data":{}}'),
          ),
          'msg_invalid',
          String(Math.floor(Date.now() / 1000)),
          'v1,invalidsignature',
        ),
      ).rejects.toThrow('Invalid webhook signature');
    });
  });
});
