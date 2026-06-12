import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/** Augments Express Request met het per-request gegenereerde requestId. */
export interface RequestWithId extends Request {
  requestId?: string;
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Genereert per request een uniek requestId en zet het op `req.requestId`
 * en de `X-Request-Id` response-header. Een binnenkomende `X-Request-Id`
 * wordt alleen overgenomen wanneer we achter een trusted proxy draaien
 * (zelfde voorwaarde als `trust proxy` in main.ts: BASE_DOMAIN gezet en niet
 * 'localhost') en de waarde aan het verwachte formaat voldoet; anders wordt
 * een verse UUID gegenereerd.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const requestId = this.resolveRequestId(req);
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }

  private resolveRequestId(req: Request): string {
    const baseDomain = process.env.BASE_DOMAIN;
    const trustIncoming = !!baseDomain && baseDomain !== 'localhost';

    if (trustIncoming) {
      const header = req.headers['x-request-id'];
      const value = Array.isArray(header) ? header[0] : header;
      if (value && REQUEST_ID_PATTERN.test(value)) {
        return value;
      }
    }

    return randomUUID();
  }
}
