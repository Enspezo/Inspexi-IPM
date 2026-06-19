import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class ValidateParentDto {
  @ApiProperty()
  @IsString()
  locationTypeCode: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentLocationTypeCode?: string;
}
