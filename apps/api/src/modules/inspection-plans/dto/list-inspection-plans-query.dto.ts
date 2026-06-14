import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID } from 'class-validator';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListInspectionPlansQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Zoeken op projectnaam / referentie' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter op status-code' })
  @IsOptional()
  @IsString()
  statusCode?: string;

  @ApiPropertyOptional({ description: 'Filter op opdrachtgever' })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @ApiPropertyOptional({ description: 'Alleen aan mij toegewezen' })
  @IsOptional()
  @IsString()
  onlyMine?: string;
}
