import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { CustomFieldsModule } from '@/modules/custom-fields/custom-fields.module';

@Module({
  imports: [CustomFieldsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
