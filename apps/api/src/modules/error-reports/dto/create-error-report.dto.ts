import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateErrorReportDto {
  @ApiProperty({ description: 'The error message' })
  @IsString()
  @IsNotEmpty()
  errorMessage: string;

  @ApiPropertyOptional({ description: 'JavaScript stack trace' })
  @IsOptional()
  @IsString()
  stackTrace?: string;

  @ApiPropertyOptional({ description: 'React component stack trace' })
  @IsOptional()
  @IsString()
  componentStack?: string;

  @ApiPropertyOptional({ description: 'User description of what they were doing' })
  @IsOptional()
  @IsString()
  userDescription?: string;

  @ApiPropertyOptional({ description: 'URL of the page where the error occurred' })
  @IsOptional()
  @IsString()
  pageUrl?: string;

  @ApiPropertyOptional({ description: 'Browser user agent string' })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiPropertyOptional({ description: 'Additional technical metadata' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
