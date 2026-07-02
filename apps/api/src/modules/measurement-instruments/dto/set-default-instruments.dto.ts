import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

/** Volledige (vervangende) set standaard-meetmiddelen — niveau 1 of niveau 2. */
export class SetDefaultInstrumentsDto {
  @ApiProperty({ type: [String], description: 'Meetmiddel-UUIDs (volledige set)' })
  @IsArray()
  @ArrayUnique({ message: 'Dubbele meetmiddelen zijn niet toegestaan' })
  @IsUUID(undefined, { each: true, message: 'Ongeldig meetmiddel-id' })
  instrumentIds: string[];
}
