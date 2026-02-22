import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreatePriceTableDto {
  @ApiProperty({ example: 'Standaard prijstabel' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Standaard tarieven voor alle klanten' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
