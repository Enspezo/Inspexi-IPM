import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * Global rate-limit guard. Skips throttling in the test environment because the
 * E2E suite drives hundreds of requests from a single IP (127.0.0.1) and would
 * otherwise trip the shared per-IP bucket.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(_context: ExecutionContext): Promise<boolean> {
    return process.env.NODE_ENV === 'test';
  }

  /**
   * WP-C1 (B-601): NL-melding i.p.v. de default "ThrottlerException: Too Many
   * Requests" — zelfde tekst als de enumeratieguard in de TenantMiddleware,
   * zodat alle 429-paden één taal en (via de AllExceptionsFilter) één
   * body-shape delen. De Retry-After-header wordt door de base guard gezet.
   */
  protected async throwThrottlingException(
    _context: ExecutionContext,
    _throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new ThrottlerException('Te veel pogingen, probeer later opnieuw');
  }
}
