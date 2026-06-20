import { IsUUID, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContactPersonLocationDto {
  @ApiProperty({ description: 'ID van de locatie' })
  @IsUUID()
  locationId: string;

  @ApiPropertyOptional({ description: 'Opmerkingen bij deze koppeling' })
  @IsOptional()
  @IsString()
  notes?: string;
}
