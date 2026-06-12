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

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('AllExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || exception.message;
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
      }
      if (status !== HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.warn(
          `Prisma ${exception.code} on ${request.method} ${request.url}: ${exception.message.split('\n').pop()}`,
        );
      }
    }

    const requestId = (request as any).requestId as string | undefined;
    const isServerError = status === HttpStatus.INTERNAL_SERVER_ERROR;

    // Log non-HTTP exceptions (500s) for debugging
    if (isServerError) {
      this.logger.error(
        `500 on ${request.method} ${request.url}${requestId ? ` [requestId=${requestId}]` : ''}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      success: false,
      message: Array.isArray(message) ? message[0] : message,
      // Class-validator kan meerdere veldfouten geven; geef ze allemaal door
      ...(Array.isArray(message) && message.length > 1 ? { errors: message } : {}),
      // Alleen 500's krijgen het requestId mee — koppelbaar aan serverlogs
      ...(isServerError && requestId ? { requestId } : {}),
      statusCode: status,
    });
  }
}
