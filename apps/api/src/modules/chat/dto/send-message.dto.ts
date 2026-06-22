import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'Korte vraag over deze aanvraag…' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Gebruikers-IDs die met @ genoemd zijn (krijgen een mention-notificatie)',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  mentionedUserIds?: string[];

  @ApiPropertyOptional({ description: 'Modelnaam (PascalCase) van een via "/" gerefereerd record' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  referenceEntityType?: string;

  @ApiPropertyOptional({ description: 'ID van een via "/" gerefereerd record' })
  @IsOptional()
  @IsUUID()
  referenceEntityId?: string;
}
