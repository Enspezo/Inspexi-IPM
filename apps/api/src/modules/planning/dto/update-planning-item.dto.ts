import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsDateString, IsNumber, Min, IsArray, IsBoolean, IsInt, Max } from 'class-validator';

export class UpdatePlanningItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ description: 'Contactpersoon ID (optioneel, null om te wissen)' })
  @IsOptional()
  @IsUUID()
  contactPersonId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  @ApiPropertyOptional({ description: 'Meerdaagse planning (meerdere sessies)' })
  @IsOptional()
  @IsBoolean()
  isMultiDay?: boolean;

  @ApiPropertyOptional({ description: 'Aantal sessies (min. 2, max. 30)' })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(30)
  sessionCount?: number;
}
