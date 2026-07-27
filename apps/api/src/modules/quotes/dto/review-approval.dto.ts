import { ApiPropertyOptional } from '@nestjs/swagger';
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
  // B-314: de UI biedt de notitie als optioneel aan — de DTO moet dat ook zijn.
  @ApiPropertyOptional({ description: 'Optionele reden voor afwijzing' })
  @IsOptional()
  @IsString({ message: 'Reden voor afwijzing moet tekst zijn' })
  note?: string;
}
