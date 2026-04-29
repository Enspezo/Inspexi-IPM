import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateQuoteTemplateDto } from './create-quote-template.dto';

export class UpdateQuoteTemplateDto extends PartialType(
  CreateQuoteTemplateDto,
) {
  @ApiPropertyOptional({ description: 'E-mailsjabloon ID voor verstuurde offertes (null om te ontkoppelen)' })
  @IsOptional()
  @ValidateIf((_obj, value) => value !== null)
  @IsUUID('4', { each: false })
  sendEmailTemplateId?: string | null;

  @ApiPropertyOptional({ description: 'E-mailsjabloon voor versturen actief voor dit sjabloon' })
  @IsOptional()
  @IsBoolean()
  sendEmailEnabled?: boolean;

  @ApiPropertyOptional({ description: 'E-mailsjabloon ID voor geaccepteerde offertes (null om te ontkoppelen)' })
  @IsOptional()
  @ValidateIf((_obj, value) => value !== null)
  @IsUUID('4', { each: false })
  acceptedEmailTemplateId?: string | null;

  @ApiPropertyOptional({ description: 'E-mailsjabloon voor acceptatie actief voor dit sjabloon' })
  @IsOptional()
  @IsBoolean()
  acceptedEmailEnabled?: boolean;
}
