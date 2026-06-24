import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class AddTicketMessageDto {
  @IsString()
  @MinLength(1)
  body!: string;

  /** Alleen support/superuser: interne notitie, niet zichtbaar voor de klant. */
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
