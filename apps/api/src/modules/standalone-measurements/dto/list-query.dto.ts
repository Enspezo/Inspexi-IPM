import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ListQueryDto {
  @ApiPropertyOptional({ description: 'Filter op locatie' })
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
