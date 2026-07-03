import { IsOptional, IsUUID, IsEmail, IsString, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AddPhaseFollowerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

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
