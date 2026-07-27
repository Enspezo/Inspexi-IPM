import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response, Request } from 'express';

/** Fout met een numerieke HTTP-status (bv. Express body-parser's PayloadTooLargeError). */
interface HttpErrorLike {
  status?: number;
  statusCode?: number;
  message?: string;
  expose?: boolean;
}

/** Herkent een non-HttpException die tóch een 4xx/5xx-status draagt. */
function isHttpErrorLike(err: unknown): err is HttpErrorLike {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as HttpErrorLike).status ?? (err as HttpErrorLike).statusCode;
  return typeof code === 'number' && code >= 400 && code <= 599;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('AllExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as any).requestId as string | undefined;
    const requestIdSuffix = requestId ? ` [requestId=${requestId}]` : '';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    // Optionele machine-leesbare foutcode (bv. FEATURE_NOT_IN_PLAN uit de
    // FeatureGuard) die een exception in zijn response-payload meegeeft.
    let code: string | undefined;
    // Optionele soft-warning-payload (bv. beschikbaarheidsconflicten uit de
    // planning-integratie, PRD-12 §12.9) die de 409-body meedraagt.
    let warnings: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message;
      if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        typeof (exceptionResponse as any).code === 'string'
      ) {
        code = (exceptionResponse as any).code;
      }
      if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null &&
        'warnings' in exceptionResponse
      ) {
        warnings = (exceptionResponse as { warnings?: unknown }).warnings;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          status = HttpStatus.CONFLICT;
          message = 'Deze waarde bestaat al';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Gegevens niet gevonden';
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = 'Verwijzing naar niet-bestaande gegevens';
          break;
        // WP-B3 (B-503): null in een NOT NULL-kolom (bv. orgId zonder
        // tenantcontext) is ongeldige invoer, geen serverfout.
        case 'P2011':
          status = HttpStatus.BAD_REQUEST;
          message = 'Verplicht veld ontbreekt';
          break;
        case 'P2020':
          // Waarde buiten het kolomtype-bereik (bv. Postgres numeric overflow) — B-303.
          status = HttpStatus.BAD_REQUEST;
          message = 'Een waarde valt buiten het toegestane bereik';
          break;
      }
      if (status !== HttpStatus.INTERNAL_SERVER_ERROR) {
        // P2011 wijst vrijwel altijd op een codefout (verplichte kolom niet
        // gevuld) — log op error-niveau mét requestId zodat de bug niet uit
        // beeld verdwijnt achter de nette 400.
        const logLine = `Prisma ${exception.code} on ${request.method} ${request.url}${requestIdSuffix}: ${exception.message.split('\n').pop()}`;
        if (exception.code === 'P2011') {
          this.logger.error(logLine);
        } else {
          this.logger.warn(logLine);
        }
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      // WP-B3 (B-503): ongeldige query-input (bv. `orgId: null` in een
      // verplichte FK-kolom) → 400 i.p.v. 500. Wel op error-niveau loggen mét
      // requestId: dit duidt vrijwel altijd op een codefout die zichtbaar
      // moet blijven in de serverlogs.
      status = HttpStatus.BAD_REQUEST;
      message = 'Ongeldige gegevens';
      this.logger.error(
        `PrismaClientValidationError on ${request.method} ${request.url}${requestIdSuffix}: ${exception.message.split('\n').pop()}`,
      );
    } else if (
      exception instanceof Prisma.PrismaClientUnknownRequestError &&
      /numeric field overflow/i.test(exception.message)
    ) {
      // Postgres `numeric field overflow` (SQLSTATE 22003) komt niet altijd als P2020
      // terug maar soms als "unknown" Prisma-fout — óók 400 i.p.v. 500 (B-303).
      status = HttpStatus.BAD_REQUEST;
      message = 'Een bedrag of aantal is te groot om op te slaan';
      this.logger.warn(
        `Prisma numeric overflow on ${request.method} ${request.url}${requestIdSuffix}`,
      );
    } else if (isHttpErrorLike(exception)) {
      // Express body-parser-fouten (PayloadTooLargeError → 413, kapotte JSON → 400)
      // zijn géén Nest-HttpException maar dragen wél een numerieke `status`/`statusCode`.
      // Zonder deze tak zouden ze als 500 terugkomen i.p.v. de juiste 4xx.
      status = exception.status ?? exception.statusCode ?? status;
      message =
        status === HttpStatus.PAYLOAD_TOO_LARGE
          ? 'Verzoek te groot'
          : exception.expose && exception.message
            ? exception.message
            : message;
    }

    const isServerError = status === HttpStatus.INTERNAL_SERVER_ERROR;

    // Log non-HTTP exceptions (500s) for debugging
    if (isServerError) {
      this.logger.error(
        `500 on ${request.method} ${request.url}${requestIdSuffix}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      success: false,
      message: Array.isArray(message) ? message[0] : message,
      // Class-validator kan meerdere veldfouten geven; geef ze allemaal door
      ...(Array.isArray(message) && message.length > 1 ? { errors: message } : {}),
      // Machine-leesbare foutcode (bv. FEATURE_NOT_IN_PLAN), indien meegegeven
      ...(code ? { code } : {}),
      // Soft-warnings (bv. beschikbaarheidsconflicten), indien meegegeven
      ...(warnings !== undefined ? { warnings } : {}),
      // Alleen 500's krijgen het requestId mee — koppelbaar aan serverlogs
      ...(isServerError && requestId ? { requestId } : {}),
      statusCode: status,
    });
  }
}
