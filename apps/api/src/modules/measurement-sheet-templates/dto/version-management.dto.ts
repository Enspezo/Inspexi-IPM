import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class PublishMeasurementSheetTemplateDto {
  @ApiProperty({ description: 'Reden/omschrijving van de wijziging' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  changeDescription: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  approvalReason?: string;
}

export class RetireMeasurementSheetTemplateDto {
  @ApiProperty({ description: 'Reden/omschrijving van het vervallen' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  changeDescription: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  approvalReason?: string;
}

export class NewVersionDto {
  @ApiPropertyOptional({ description: 'Omschrijving van de nieuwe versie' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeDescription?: string;
}
