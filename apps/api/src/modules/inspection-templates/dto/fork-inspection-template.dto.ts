import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ForkInspectionTemplateDto {
  @ApiPropertyOptional({ description: 'Code voor de fork (default: <code>-FORK)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @ApiPropertyOptional({ description: 'Naam voor de fork (default: <naam> (fork))' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}
