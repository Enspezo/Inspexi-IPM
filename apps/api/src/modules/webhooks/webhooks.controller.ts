import {
  Controller,
  Post,
  Body,
  Headers,
  RawBodyRequest,
  Req,
  HttpCode,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { Webhook } from 'svix';
import { PrismaService } from '@/prisma';
import { Public } from '@/common/decorators';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  @Public()
  @Post('resend')
  @HttpCode(200)
  @ApiOperation({ summary: 'Resend webhook events ontvangen' })
  async handleResend(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
  ) {
    const webhookSecret = this.config.get<string>('RESEND_WEBHOOK_SECRET');

    // Verify signature if a secret is configured
    if (webhookSecret) {
      const rawBody = req.rawBody;
      if (!rawBody) {
        throw new BadRequestException('Raw body not available');
      }

      const wh = new Webhook(webhookSecret);
      try {
        wh.verify(rawBody.toString(), {
          'svix-id': svixId,
          'svix-timestamp': svixTimestamp,
          'svix-signature': svixSignature,
        });
      } catch {
        this.logger.warn('Invalid Resend webhook signature');
        throw new BadRequestException('Invalid webhook signature');
      }
    }

    const payload = req.body as { type: string; data: Record<string, any> };
    this.logger.log(`Received Resend webhook: ${payload.type}`);

    if (payload.type === 'email.opened') {
      await this.handleEmailOpened(payload.data);
    }

    return { received: true };
  }

  private async handleEmailOpened(data: Record<string, any>): Promise<void> {
    // Resend provides the email ID in data.email_id
    const resendId: string | undefined = data.email_id ?? data.id;
    if (!resendId) {
      this.logger.warn('email.opened event missing email_id');
      return;
    }

    try {
      const updated = await this.prisma.contactEmail.updateMany({
        where: { resendId, openedAt: null },
        data: { openedAt: new Date() },
      });

      if (updated.count > 0) {
        this.logger.log(`Marked ContactEmail with resendId ${resendId} as opened`);
      }
    } catch (err) {
      this.logger.error(`Failed to update openedAt for resendId ${resendId}`, err);
    }
  }
}
