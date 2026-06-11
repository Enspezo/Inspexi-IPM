import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateLocationContactPersonDto {
  @ApiPropertyOptional({ description: 'Opmerkingen bij deze koppeling' })
  @IsOptional()
  @IsString()
  notes?: string;
}
