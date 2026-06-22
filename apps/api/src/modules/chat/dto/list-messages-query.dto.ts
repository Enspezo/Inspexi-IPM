import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class ListMessagesQueryDto {
  @ApiPropertyOptional({
    description: 'ISO-tijdstip; alleen berichten ná dit moment (poll-cursor)',
  })
  @IsOptional()
  @IsDateString()
  since?: string;
}
