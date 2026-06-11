import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListContactPersonsQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter op contact ID' })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @ApiPropertyOptional({ description: 'Zoeken op naam, email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter op rol ID (lookup)', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  roleId?: string;
}
