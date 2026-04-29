import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { requestContext } from '../services/request-context';

@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.id) {
      return next.handle();
    }

    const contextData = {
      userId: user.id,
      orgId: user.orgId ?? null,
      ipAddress: request.ip || request.connection?.remoteAddress,
    };

    return new Observable((subscriber) => {
      requestContext.run(contextData, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
