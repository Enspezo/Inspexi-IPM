import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RejectPlanningDto {
  @ApiProperty({ example: 'Ik ben die dag niet beschikbaar', description: 'Reden van weigering (verplicht)' })
  @IsString()
  @MinLength(5, { message: 'Geef een duidelijke reden op (minimaal 5 tekens)' })
  reason: string;
}
