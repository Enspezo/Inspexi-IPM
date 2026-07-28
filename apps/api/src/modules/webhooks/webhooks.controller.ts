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
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { Webhook } from 'svix';
import { PrismaService } from '@/prisma';
import { Public } from '@/common/decorators';

// NB: dit is de INKOMENDE Resend e-mail-event-ontvanger (open-tracking), géén
// uitgaande-webhooks-feature. Het endpoint is @Public(), wordt door Resend
// (externe server) aangeroepen zónder org-subdomein en werkt org-overstijgend op
// ContactEmail. Daarom NIET met @RequiresFeature('WEBHOOKS') gaten — dat hoort
// bij toekomstige uitgaande integraties en zou hier de e-mail-infra breken.
@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
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

    // Verify the signature when a secret is configured. Fail CLOSED in production
    // when it is absent — an unverified, unauthenticated @Public endpoint that
    // writes across orgs must not run without signature verification on a shared
    // deployment. Non-production keeps the previous lenient behaviour so local dev
    // (which never receives real Resend events) is not broken (SEC-10).
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
    } else if (this.config.get<string>('NODE_ENV') === 'production') {
      this.logger.error('RESEND_WEBHOOK_SECRET not configured — rejecting unverified webhook');
      throw new BadRequestException('Webhook signature verification not configured');
    } else {
      this.logger.warn('RESEND_WEBHOOK_SECRET not set — processing webhook unverified (non-production only)');
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
