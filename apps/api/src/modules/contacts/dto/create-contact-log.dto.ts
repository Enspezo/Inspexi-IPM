import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { LogType } from '@prisma/client';

export class CreateContactLogDto {
  @ApiProperty({ enum: LogType, example: LogType.PHONE })
  @IsEnum(LogType)
  type: LogType;

  @ApiPropertyOptional({ example: 'Besproken offerte #123' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ example: 'Klant wil aanpassing in de prijs' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ example: '2026-02-22T14:00:00Z' })
  @IsOptional()
  @IsDateString()
  loggedAt?: string;
}
