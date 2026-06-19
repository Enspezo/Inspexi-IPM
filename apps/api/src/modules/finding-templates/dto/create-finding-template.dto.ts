import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsObject,
  IsUUID,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateFindingTemplateDto {
  @ApiPropertyOptional({ maxLength: 50, description: 'Unieke code binnen de organisatie' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({ description: 'Categorie (org of systeem)' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  shortDescription: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  longDescription?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  explanation?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  normReference?: string;

  @ApiProperty({ description: 'Classificatiemodel (globaal)' })
  @IsUUID()
  classificationModelId: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Standaardclassificatie: { kenmerkCode: optieCode }',
  })
  @IsObject()
  defaultClassification: Record<string, string>;
}
