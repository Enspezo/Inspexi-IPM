import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { TemplateStatus } from '@prisma/client';

export class QueryInspectionTemplatesDto {
  @ApiPropertyOptional({ description: 'Filter op normcode' })
  @IsOptional()
  @IsString()
  normType?: string;

  @ApiPropertyOptional({ enum: TemplateStatus })
  @IsOptional()
  @IsEnum(TemplateStatus)
  status?: TemplateStatus;

  @ApiPropertyOptional({ default: true, description: 'Systeemtemplates meenemen' })
  @IsOptional()
  @Transform(({ value }) => value !== 'false' && value !== false)
  @IsBoolean()
  includeSystem?: boolean;

  @ApiPropertyOptional({ description: 'Zoek op naam, code of omschrijving' })
  @IsOptional()
  @IsString()
  search?: string;
}
