import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class ResolveFindingDto {
  @ApiPropertyOptional({ description: 'Toelichting bij de oplossing' })
  @IsOptional()
  @IsString()
  description?: string;
}
