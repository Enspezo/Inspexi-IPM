import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ReschedulePlanningDto {
  @ApiProperty({ example: 'Klant niet beschikbaar op de geplande datum', description: 'Reden voor verzetten' })
  @IsString()
  @MinLength(5, { message: 'Geef een duidelijke reden op (minimaal 5 tekens)' })
  reason: string;
}
