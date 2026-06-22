import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SearchChatUsersQueryDto {
  @ApiPropertyOptional({ description: 'Zoekterm op naam of e-mail (leeg = eerste gebruikers)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
