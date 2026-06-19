import { PartialType, OmitType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateChecklistItemDto } from './create-checklist-item.dto';

// isSystem is niet wijzigbaar na aanmaken
export class UpdateChecklistItemDto extends PartialType(
  OmitType(CreateChecklistItemDto, ['isSystem'] as const),
) {
  @ApiPropertyOptional({ description: 'Item activeren/deactiveren' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
