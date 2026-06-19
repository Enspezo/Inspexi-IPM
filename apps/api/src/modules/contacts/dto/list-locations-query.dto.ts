import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
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

  @ApiPropertyOptional({ description: 'Filter op locatietype ID' })
  @IsOptional()
  @IsUUID()
  locationTypeId?: string;

  // De kaart-weergave heeft de volledige (gefilterde) set nodig i.p.v. één pagina,
  // daarom mag dit endpoint een grotere limiet dan de gedeelde cap van 100.
  @ApiPropertyOptional({ default: 20, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 20;
}
