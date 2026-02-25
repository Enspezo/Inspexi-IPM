import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AddQuestionDto {
  @ApiProperty({ description: 'Vraag of antwoord bericht' })
  @IsString()
  @MinLength(1)
  message: string;
}
