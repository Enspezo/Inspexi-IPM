import { IsString, MinLength, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEmailTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  bodyJson?: any;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  bodyHtml?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
