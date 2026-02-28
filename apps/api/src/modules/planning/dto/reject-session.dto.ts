import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RejectSessionDto {
  @ApiProperty({ example: 'Ik ben die dag niet beschikbaar', description: 'Reden voor weigering' })
  @IsString()
  @MinLength(5)
  reason: string;
}
