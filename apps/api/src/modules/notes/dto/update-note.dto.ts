import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class UpdateNoteDto {
  @ApiProperty({ example: 'Bijgewerkte notitie tekst' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content: string;
}
