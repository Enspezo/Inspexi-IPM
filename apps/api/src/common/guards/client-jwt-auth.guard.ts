import { HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Authenticeert via de 'client-jwt' strategie (klantportaal). Gebruik samen met @Public()
 *  op de controller, zodat de globale staf-JwtAuthGuard/TenantGuard worden overgeslagen. */
@Injectable()
export class ClientJwtAuthGuard extends AuthGuard('client-jwt') {
  /**
   * WP-C1 (B-155): NL-melding voor het generieke faalgeval i.p.v. "Unauthorized";
   * specifiekere excepties uit de strategy (bv. "Klantaccount is inactief")
   * blijven leidend.
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
