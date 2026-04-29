import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SendContactEmailDto {
  @ApiProperty({ example: 'Offerte voor inspectie' })
  @IsString()
  @MinLength(1)
  subject: string;

  @ApiProperty({ example: '<p>Beste klant, hierbij de offerte...</p>' })
  @IsString()
  @MinLength(1)
  bodyHtml: string;
}
