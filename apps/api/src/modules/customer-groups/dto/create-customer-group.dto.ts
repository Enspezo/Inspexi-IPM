import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class CreateCustomerGroupDto {
  @ApiProperty({ example: 'VIP Klanten' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Onze belangrijkste klanten' })
  @IsOptional()
  @IsString()
  notes?: string;
}
