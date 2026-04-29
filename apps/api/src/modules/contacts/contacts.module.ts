import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { CustomFieldsModule } from '@/modules/custom-fields/custom-fields.module';
import { GeocodingModule } from '@/modules/geocoding/geocoding.module';

@Module({
  imports: [CustomFieldsModule, GeocodingModule],
  controllers: [ContactsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
