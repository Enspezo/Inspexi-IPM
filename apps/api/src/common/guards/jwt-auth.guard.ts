import { ExecutionContext, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  /**
   * WP-C1 (B-106/B-155): het generieke faalgeval (geen/ongeldig/verlopen token)
   * krijgt een NL-melding i.p.v. Nest's Engelse "Unauthorized". Specifiekere
   * excepties uit de strategy (bv. "Ongeldig token-type") blijven leidend.
   */
  handleRequest<TUser = unknown>(err: unknown, user: TUser | false): TUser {
    if (err instanceof HttpException) {
      throw err;
    }
    if (err || !user) {
      throw new UnauthorizedException('Niet ingelogd of uw sessie is verlopen');
    }
    return user;
  }
}
