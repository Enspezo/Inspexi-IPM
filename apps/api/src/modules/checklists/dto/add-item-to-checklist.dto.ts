import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsInt, IsUUID, Min } from 'class-validator';

export class AddItemToChecklistDto {
  @ApiProperty({ description: 'ID van het te koppelen ChecklistItem' })
  @IsUUID('4')
  checklistItemId: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ description: 'Overschrijft de categorienaam binnen deze checklist' })
  @IsOptional()
  @IsString()
  categoryOverride?: string;
}
