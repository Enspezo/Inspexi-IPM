import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupportAccessService } from './support-access.service';

/**
 * IMP_PRD-10 Fase 5 — JIT-expiry van support-toegang.
 * Spiegelt quotes/quote-scheduler.service.ts.
 */
@Injectable()
export class SupportAccessScheduler {
  private readonly logger = new Logger(SupportAccessScheduler.name);

  constructor(private supportAccess: SupportAccessService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async expire(): Promise<void> {
    const count = await this.supportAccess.expireGrants();
    if (count > 0) {
      this.logger.log(`Support-toegang verlopen voor ${count} organisatie(s).`);
    }
  }
}
