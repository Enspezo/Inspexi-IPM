// Doel in apps/api: src/modules/client-auth/client-jwt.strategy.ts
//
// Tweede auth-realm (extern klantportaal), gescheiden van de staf-JWT. Eigen secret
// (CLIENT_JWT_SECRET) en passport-strategie 'client-jwt'. Token draagt type:'client'.
// orgId zit NIET in het token — de org komt uit het subdomein (TenantMiddleware/@CurrentTenant).

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { ClientUserStatus } from '@prisma/client';
import { PrismaService } from '@/prisma';

export interface ClientJwtPayload {
  sub: string;
  email: string;
  type: 'client';
}

@Injectable()
export class ClientJwtStrategy extends PassportStrategy(Strategy, 'client-jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('CLIENT_JWT_SECRET'),
    });
  }

  async validate(payload: ClientJwtPayload) {
    if (payload.type !== 'client') {
      throw new UnauthorizedException('Ongeldig token-type');
    }
    const clientUser = await this.prisma.clientUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, firstName: true, lastName: true, status: true, function: true, phone: true },
    });
    if (!clientUser) throw new UnauthorizedException('Klantgebruiker niet gevonden');
    if (clientUser.status !== ClientUserStatus.ACTIVE) {
      throw new UnauthorizedException('Klantaccount is inactief');
    }
    return clientUser; // wordt request.user (client-realm)
  }
}
