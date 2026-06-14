import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PublishInspectionTemplateDto {
  @ApiPropertyOptional({ description: 'Toelichting bij publicatie' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeDescription?: string;
}

export class RetireInspectionTemplateDto {
  @ApiPropertyOptional({ description: 'Reden voor het laten vervallen' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class NewVersionDto {
  @ApiPropertyOptional({ description: 'Toelichting bij de nieuwe versie' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeDescription?: string;
}
