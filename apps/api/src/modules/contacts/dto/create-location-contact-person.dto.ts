import { IsUUID, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLocationContactPersonDto {
  @ApiProperty({ description: 'ID van de contactpersoon' })
  @IsUUID()
  contactPersonId: string;

  @ApiPropertyOptional({ description: 'Opmerkingen bij deze koppeling' })
  @IsOptional()
  @IsString()
  notes?: string;
}
