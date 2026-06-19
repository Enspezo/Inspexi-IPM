import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional } from 'class-validator';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListAssetsQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter op opdrachtgever (Contact)' })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetTypeCode?: string;

  @ApiPropertyOptional({ description: 'Filter op status-code' })
  @IsOptional()
  @IsString()
  statusCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
