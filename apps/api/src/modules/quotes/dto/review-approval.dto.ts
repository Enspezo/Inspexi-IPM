import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class ApproveQuoteDto {
  @ApiPropertyOptional({ description: 'Optionele notitie bij goedkeuring' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class RejectQuoteDto {
  @ApiProperty({ description: 'Verplichte reden voor afwijzing' })
  @IsString()
  note: string;
}
