import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { BasePaginationQueryDto } from '@/common/dto';

export class QueryFindingTemplatesDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Zoekterm (code, omschrijving, categorie)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  classificationModelId?: string;

  @ApiPropertyOptional({ default: true, description: 'Systeemtemplates meenemen' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeSystem?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Inactieve templates meenemen' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeInactive?: boolean;
}
