import { Module } from '@nestjs/common';
import { KvkController } from './kvk.controller';
import { KvkService } from './kvk.service';

@Module({
  controllers: [KvkController],
  providers: [KvkService],
  exports: [KvkService],
})
export class KvkModule {}
