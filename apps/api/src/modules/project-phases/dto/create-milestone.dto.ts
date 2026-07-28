import {
  IsString,
  IsOptional,
  IsUUID,
  IsDateString,
  IsInt,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMilestoneDto {
  @ApiProperty({ example: 'Rapportage pand A gereed' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Streefdatum (ISO)' })
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional({ description: 'Verantwoordelijke gebruiker' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ default: 7, description: 'Aantal dagen vooraf voor de reminder' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reminderDaysBefore?: number;

  @ApiPropertyOptional({ description: 'Sorteervolgorde binnen de fase' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
