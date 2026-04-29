import { Module } from '@nestjs/common';
import { PriceTablesController } from './price-tables.controller';
import { PriceTablesService } from './price-tables.service';

@Module({
  controllers: [PriceTablesController],
  providers: [PriceTablesService],
  exports: [PriceTablesService],
})
export class PriceTablesModule {}
