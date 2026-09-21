import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SupportAccessService } from './support-access.service';
import { isSchedulerEnabled, SCHEDULER_ENABLED_ENV } from '@/common/config/scheduler-enabled';

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
    if (!isSchedulerEnabled()) {
      this.logger.debug(`Support-toegang-expiry overgeslagen: uitgeschakeld via ${SCHEDULER_ENABLED_ENV}.`);
      return;
    }
    // F5: de cron mag nooit een unhandled rejection produceren.
    try {
      const count = await this.supportAccess.expireGrants();
      if (count > 0) {
        this.logger.log(`Support-toegang verlopen voor ${count} organisatie(s).`);
      }
    } catch (err) {
      this.logger.error(
        'Support-toegang-expiry-cron faalde onverwacht.',
        err instanceof Error ? (err.stack ?? err.message) : String(err),
      );
    }
  }
}
