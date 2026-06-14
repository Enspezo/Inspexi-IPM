import { Module } from '@nestjs/common';
import { NormTypesController } from './norm-types.controller';
import { NormTypesService } from './norm-types.service';

@Module({
  controllers: [NormTypesController],
  providers: [NormTypesService],
  exports: [NormTypesService],
})
export class NormTypesModule {}
