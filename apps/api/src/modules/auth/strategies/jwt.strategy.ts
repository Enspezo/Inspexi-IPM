import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '@/prisma';
import { JwtPayload } from '@/common/interfaces';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // Alleen echte access-tokens toelaten. Reset-/verificatietokens dragen een
    // andere claim (`purpose`) en géén `type: 'access'`; hoewel ze met hetzelfde
    // JWT_SECRET zijn gesigned mogen ze niet als Bearer-access-token dienen.
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Ongeldig token-type');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { organization: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return user;
  }
}
