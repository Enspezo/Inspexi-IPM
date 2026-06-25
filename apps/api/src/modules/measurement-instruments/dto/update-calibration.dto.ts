import { PartialType } from '@nestjs/swagger';
import { CreateCalibrationDto } from './create-calibration.dto';

/** Kalibratie bijwerken (alle velden optioneel; optioneel bestand vervangen). */
export class UpdateCalibrationDto extends PartialType(CreateCalibrationDto) {}
