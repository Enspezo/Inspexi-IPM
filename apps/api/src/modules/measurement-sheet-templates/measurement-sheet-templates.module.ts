import { Module } from '@nestjs/common';
import { MeasurementSheetTemplatesController } from './measurement-sheet-templates.controller';
import { MeasurementSheetTemplatesService } from './measurement-sheet-templates.service';
import { MeasurementSheetSectionsService } from './measurement-sheet-sections.service';
import { MeasurementSheetFieldsService } from './measurement-sheet-fields.service';

@Module({
  controllers: [MeasurementSheetTemplatesController],
  providers: [
    MeasurementSheetTemplatesService,
    MeasurementSheetSectionsService,
    MeasurementSheetFieldsService,
  ],
  exports: [
    MeasurementSheetTemplatesService,
    MeasurementSheetSectionsService,
    MeasurementSheetFieldsService,
  ],
})
export class MeasurementSheetTemplatesModule {}
