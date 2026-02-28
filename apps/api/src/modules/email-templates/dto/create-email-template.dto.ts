import { IsEnum, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmailTemplateType } from '@prisma/client';

export class CreateEmailTemplateDto {
  @ApiProperty({ enum: EmailTemplateType })
  @IsEnum(EmailTemplateType)
  type: EmailTemplateType;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  subject: string;

  @ApiPropertyOptional()
  @IsOptional()
  bodyJson?: any;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  bodyHtml: string;
}
