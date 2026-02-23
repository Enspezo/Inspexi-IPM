import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SubmitApprovalDto {
  @ApiPropertyOptional({ description: 'Optionele notitie bij indiening' })
  @IsOptional()
  @IsString()
  note?: string;
}
