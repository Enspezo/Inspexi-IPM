// Doel in apps/api: src/modules/client-auth/client-auth.module.ts
// Registreer in app.module.ts. PassportModule + JwtModule (de secrets worden per sign meegegeven).

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
