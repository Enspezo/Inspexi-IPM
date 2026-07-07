import { Module } from '@nestjs/common';
import { ClientHelpController } from './client-help.controller';
import { ClientHelpService } from './client-help.service';

@Module({
  controllers: [ClientHelpController],
  providers: [ClientHelpService],
})
export class ClientHelpModule {}
