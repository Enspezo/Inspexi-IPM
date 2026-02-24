import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateDocumentDto {
  @ApiPropertyOptional({ example: 'Bijgewerkte beschrijving' })
  @IsOptional()
  @IsString()
  description?: string;
}
