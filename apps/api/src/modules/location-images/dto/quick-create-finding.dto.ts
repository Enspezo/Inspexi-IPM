import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { FindingInspectionType } from '@prisma/client';

export class QuickCreateFindingDto {
  @ApiProperty({ minimum: 0, maximum: 100, description: 'Horizontale positie (%)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  positionX: number;

  @ApiProperty({ minimum: 0, maximum: 100, description: 'Verticale positie (%)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  positionY: number;

  @ApiProperty({ description: 'Asset waaronder de constatering valt' })
  @IsUUID()
  assetId: string;

  @ApiProperty({ enum: FindingInspectionType })
  @IsEnum(FindingInspectionType)
  inspectionType: FindingInspectionType;

  @ApiProperty({ example: 'Onvoldoende beschermingsleiding' })
  @IsString()
  shortDescription: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  longDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  findingTemplateId?: string;

  @ApiPropertyOptional({ description: 'Classificatiewaarden, bv. { "RISICO": "HOOG" }' })
  @IsOptional()
  @IsObject()
  classificationValues?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recommendation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  normReference?: string;

  @ApiPropertyOptional({ description: 'Vrije annotatie (JSON) op de marker' })
  @IsOptional()
  @IsObject()
  annotation?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Label op de marker' })
  @IsOptional()
  @IsString()
  label?: string;
}
