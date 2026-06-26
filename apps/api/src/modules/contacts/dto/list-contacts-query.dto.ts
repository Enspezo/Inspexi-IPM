import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsBooleanString } from 'class-validator';
import { ContactType } from '@prisma/client';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListContactsQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Zoeken op naam, email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ContactType })
  @IsOptional()
  @IsEnum(ContactType)
  type?: ContactType;

  @ApiPropertyOptional({ description: 'Alleen mijn relaties tonen' })
  @IsOptional()
  @IsBooleanString()
  onlyMine?: string;

  @ApiPropertyOptional({ description: 'Alleen leveranciers tonen' })
  @IsOptional()
  @IsBooleanString()
  supplierOnly?: string;
}
