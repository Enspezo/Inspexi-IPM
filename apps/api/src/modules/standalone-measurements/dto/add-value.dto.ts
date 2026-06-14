import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AddValueDto {
  @ApiProperty({ example: 'isolatieweerstand', description: 'Veldnaam van de meting' })
  @IsString()
  fieldName: string;

  @ApiProperty({ example: 'number', description: 'Veldtype (number, text, boolean, ...)' })
  @IsString()
  fieldType: string;

  @ApiProperty({ example: '230', description: 'Gemeten waarde (als string opgeslagen)' })
  @IsString()
  value: string;

  @ApiPropertyOptional({ example: 'V', description: 'Eenheid' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({
    example: 'pass',
    description: 'Pass/fail-status (lookup: pass-fail-status-types)',
  })
  @IsOptional()
  @IsString()
  passFailCode?: string;
}
