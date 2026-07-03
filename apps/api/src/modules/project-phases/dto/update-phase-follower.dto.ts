import { IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePhaseFollowerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canViewGeneral?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canViewRequests?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canViewQuotes?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canViewPlanning?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canViewDocuments?: boolean;
}
