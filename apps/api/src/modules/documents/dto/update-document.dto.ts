import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateDocumentDto {
  @ApiPropertyOptional({ example: 'Bijgewerkte beschrijving' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: false, description: 'Of dit document gedeeld wordt met de opdrachtgever via de portal (alleen voor planregel-documenten)' })
  @IsOptional()
  @IsBoolean()
  isSharedWithClient?: boolean;
}
