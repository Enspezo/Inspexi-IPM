import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ description: 'Het bericht van de gebruiker aan de assistent' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;
}
