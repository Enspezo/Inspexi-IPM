import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, IsOptional } from 'class-validator';

export class SignQuoteDto {
  @ApiProperty({ description: 'Naam van de ondertekenaar' })
  @IsString()
  @MinLength(1)
  clientName: string;

  @ApiPropertyOptional({ description: 'Handtekening als base64 PNG (van canvas)' })
  @IsOptional()
  @IsString()
  signature?: string;
}
