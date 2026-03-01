import { IsOptional, IsUUID, IsEmail, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AddProjectFollowerDto {
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
}
