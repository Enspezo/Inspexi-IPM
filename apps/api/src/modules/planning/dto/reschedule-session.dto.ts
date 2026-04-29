import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RescheduleSessionDto {
  @ApiProperty({ example: 'Klant niet beschikbaar op de geplande datum', description: 'Reden voor verzetten van de sessie' })
  @IsString()
  @MinLength(5)
  reason: string;
}
