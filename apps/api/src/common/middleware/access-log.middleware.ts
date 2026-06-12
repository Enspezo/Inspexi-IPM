import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import { RequestWithId } from './request-id.middleware';

/**
 * Logt één regel per response met statuscode >= 400. Werkt op Express-niveau
 * (via `res.on('finish')`) zodat ook errors worden gevangen die vóór de
 * NestJS-interceptors ontstaan — bijv. 401/403 uit JwtAuthGuard/TenantGuard en
 * 429 uit de throttler (een interceptor draait niet wanneer een guard afwijst).
 *
 * Moet ná RequestIdMiddleware geregistreerd worden zodat `req.requestId`
 * beschikbaar is. Logt bewust géén request body, tokens of headers.
 */
@Injectable()
export class AccessLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const start = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      if (statusCode < 400) {
        return;
      }

      const durationMs = Date.now() - start;
      const requestId = req.requestId;
      // req.user wordt door passport gezet voor geauthenticeerde requests.
      const user = req.user as { id?: string; orgId?: string | null } | undefined;

      // Alleen het pad loggen — query strings kunnen gevoelige data bevatten
      const path = req.originalUrl.split('?')[0];
      const parts: string[] = [
        `${req.method} ${path}`,
        `${statusCode}`,
        `${durationMs}ms`,
      ];
      if (requestId) parts.push(`requestId=${requestId}`);
      if (user?.id) parts.push(`userId=${user.id}`);
      if (user?.orgId) parts.push(`orgId=${user.orgId}`);

      const message = parts.join(' ');

      if (statusCode >= 500) {
        this.logger.error(message);
      } else {
        this.logger.warn(message);
      }
    });

    next();
  }
}
