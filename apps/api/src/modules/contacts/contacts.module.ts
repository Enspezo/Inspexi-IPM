import { Module } from '@nestjs/common';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { ContactAddressesService } from './contact-addresses.service';
import { ContactPersonsService } from './contact-persons.service';
import { LocationsService } from './locations.service';
import { CustomFieldsModule } from '@/modules/custom-fields/custom-fields.module';
import { GeocodingModule } from '@/modules/geocoding/geocoding.module';

@Module({
  imports: [CustomFieldsModule, GeocodingModule],
  controllers: [ContactsController],
  providers: [
    ContactsService,
    ContactAddressesService,
    ContactPersonsService,
    LocationsService,
  ],
  exports: [
    ContactsService,
    ContactAddressesService,
    ContactPersonsService,
    LocationsService,
  ],
})
export class ContactsModule {}
