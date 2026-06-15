// Core klant-data-module. Exporteert ClientInspectionsService zodat de andere client-modules
// (documents/findings/messages/requests) de tenant + ClientAccess-scoping kunnen hergebruiken.

import { Module } from '@nestjs/common';
import { ClientInspectionsController } from './client-inspections.controller';
import { ClientInspectionsService } from './client-inspections.service';

@Module({
  controllers: [ClientInspectionsController],
  providers: [ClientInspectionsService],
  exports: [ClientInspectionsService],
})
export class ClientInspectionsModule {}
