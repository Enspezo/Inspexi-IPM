import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class ApproveQuoteDto {
  @ApiPropertyOptional({ description: 'Optionele notitie bij goedkeuring' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'Handtekening van de manager (base64 data URL)' })
  @IsOptional()
  @IsString()
  managerSignature?: string;
}

export class RejectQuoteDto {
  @ApiProperty({ description: 'Verplichte reden voor afwijzing' })
  @IsString()
  note: string;
}
