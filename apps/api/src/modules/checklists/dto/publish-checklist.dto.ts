import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

export class PublishChecklistDto {
  @ApiProperty({ description: 'Omschrijving van de wijziging' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  changeDescription: string;

  @ApiPropertyOptional({ description: 'Reden van goedkeuring' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  approvalReason?: string;
}

export class RetireChecklistDto {
  @ApiProperty({ description: 'Omschrijving van de wijziging' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  changeDescription: string;

  @ApiPropertyOptional({ description: 'Reden van goedkeuring' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  approvalReason?: string;
}

export class NewVersionDto {
  @ApiPropertyOptional({ description: 'Omschrijving van de wijziging' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeDescription?: string;
}
