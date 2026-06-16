import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsUUID } from 'class-validator';

export class ParseMeasurementDto {
  @ApiProperty({ description: 'Uitgesproken/getranscribeerde tekst' })
  @IsString() transcript: string;

  @ApiPropertyOptional({ description: 'Meetstaat-template voor template-laag van de prompt' })
  @IsOptional() @IsUUID() templateId?: string;

  @ApiPropertyOptional({ description: 'Normcode voor de norm-context (NEN1010, ...)' })
  @IsOptional() @IsString() normTypeCode?: string;
}

export class CreateBasePromptDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() content: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateBasePromptDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() content?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpsertTemplatePromptDto {
  @ApiProperty() @IsString() content: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpsertUserPromptDto {
  @ApiPropertyOptional({ description: 'null = globale persoonlijke prompt' })
  @IsOptional() @IsUUID() templateId?: string;
  @ApiProperty() @IsString() content: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
