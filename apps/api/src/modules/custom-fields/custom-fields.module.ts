import { Module } from '@nestjs/common';
import { CustomFieldsController } from './custom-fields.controller';
import { CustomFieldsService } from './custom-fields.service';
import { CustomFieldsValidator } from './custom-fields.validator';

@Module({
  controllers: [CustomFieldsController],
  providers: [CustomFieldsService, CustomFieldsValidator],
  exports: [CustomFieldsService, CustomFieldsValidator],
})
export class CustomFieldsModule {}
