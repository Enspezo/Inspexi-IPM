import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

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
}
