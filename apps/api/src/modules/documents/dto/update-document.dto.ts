import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateDocumentDto {
  @ApiPropertyOptional({ example: 'Bijgewerkte beschrijving' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: false, description: 'Of dit document gedeeld wordt met de opdrachtgever via de portal (alleen voor planregel-documenten)' })
  @IsOptional()
  @IsBoolean()
  isSharedWithClient?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: 'Vervangt de volledige tag-set van het document',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  tagIds?: string[];
}
