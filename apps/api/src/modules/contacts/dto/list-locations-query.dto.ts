import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListLocationsQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter op contact ID' })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @ApiPropertyOptional({ description: 'Zoeken op naam, straat, stad, postcode' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter op objecttype' })
  @IsOptional()
  @IsString()
  objectType?: string;
}
