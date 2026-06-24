import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { HelpService } from './help.service';
import { HelpController } from './help.controller';
import { HelpAdminController } from './help-admin.controller';

@Module({
  imports: [PrismaModule],
  controllers: [HelpController, HelpAdminController],
  providers: [HelpService],
  exports: [HelpService], // HelpService wordt in Fase 3 hergebruikt voor contextuele suggesties
})
export class HelpModule {}
