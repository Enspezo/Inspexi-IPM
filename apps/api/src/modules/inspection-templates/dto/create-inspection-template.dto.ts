import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateInspectionTemplateDto {
  @ApiProperty({ example: 'NEN1010-INSP' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  code: string;

  @ApiProperty({ example: 'NEN 1010 Inspectie' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ description: 'Normcode (verwijst naar NormTypeDefinition.code)', example: 'NEN1010' })
  @IsString()
  normTypeCode: string;

  @ApiProperty({ description: 'Classificatiemodel (globaal)' })
  @IsUUID()
  classificationModelId: string;

  @ApiPropertyOptional({ description: 'Alleen SUPERUSER: maakt een systeemtemplate' })
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;
}
