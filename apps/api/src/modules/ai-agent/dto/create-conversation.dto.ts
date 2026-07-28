import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateConversationDto {
  @ApiPropertyOptional({ description: 'Optionele titel; anders afgeleid van het eerste bericht' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}
