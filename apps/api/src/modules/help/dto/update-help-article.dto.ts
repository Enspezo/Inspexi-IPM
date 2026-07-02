import { PartialType } from '@nestjs/swagger';
import { CreateHelpArticleDto } from './create-help-article.dto';

export class UpdateHelpArticleDto extends PartialType(CreateHelpArticleDto) {}
