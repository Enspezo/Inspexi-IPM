import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsDateString } from 'class-validator';

/**
 * Wijs een weekschema-template toe aan een inspecteur vanaf `validFrom`.
 * De lopende (doorlopende) toewijzing wordt op deze datum afgesloten.
 */
export class AssignScheduleDto {
  @ApiProperty({ description: 'Toe te wijzen template' })
  @IsUUID(undefined, { message: 'Ongeldige template' })
  templateId!: string;

  @ApiProperty({ example: '2026-08-01', description: 'Ingangsdatum (date-only)' })
  @IsDateString({}, { message: 'Ongeldige ingangsdatum' })
  validFrom!: string;
}
