import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Authenticeert via de 'client-jwt' strategie (klantportaal). Gebruik samen met @Public()
 *  op de controller, zodat de globale staf-JwtAuthGuard/TenantGuard worden overgeslagen. */
@Injectable()
export class ClientJwtAuthGuard extends AuthGuard('client-jwt') {}
