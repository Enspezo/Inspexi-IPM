// 2e auth-realm. Registreer in app.module.ts. PassportModule + JwtModule (secrets per sign/verify).
// EmailService komt uit de @Global EmailModule. ClientJwtStrategy registreert de 'client-jwt' strategie.

import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ClientAuthController } from './client-auth.controller';
import { ClientAuthService } from './client-auth.service';
import { ClientJwtStrategy } from './client-jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [ClientAuthController],
  providers: [ClientAuthService, ClientJwtStrategy],
  exports: [ClientAuthService],
})
export class ClientAuthModule {}
