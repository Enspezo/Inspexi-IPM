import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ description: 'Berichttekst' })
  @IsString()
  @IsNotEmpty()
  content: string;
}
