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

    // Alleen de staf-realm wordt ge-audit. Client-realm-principals (ClientUser, 2e auth-realm)
    // hebben geen `roles` en bestaan niet in imp_users — hun id als audit-userId zou de FK
    // (imp_audit_logs_user_id_fkey) breken. Sla de audit-context dan over.
    if (!user?.id || !Array.isArray(user.roles)) {
      return next.handle();
    }

    const contextData = {
      userId: user.id,
      orgId: user.orgId ?? null,
      ipAddress: request.ip || request.connection?.remoteAddress,
      requestId: request.requestId,
    };

    return new Observable((subscriber) => {
      requestContext.run(contextData, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
