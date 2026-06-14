import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

export class ListCategoriesQueryDto {
  @ApiPropertyOptional({
    default: true,
    description: 'Systeemcategorieën meenemen (alleen relevant voor org-gebruikers)',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeSystem?: boolean = true;

  @ApiPropertyOptional({ description: 'Filter op ouder-categorie (UUID)' })
  @IsOptional()
  @IsUUID('4')
  parentId?: string;

  @ApiPropertyOptional({ description: 'Platte lijst i.p.v. boom', default: false })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  flat?: boolean = false;

  @ApiPropertyOptional({ description: 'Ook inactieve categorieën tonen', default: false })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeInactive?: boolean = false;
}

export class TreeQueryDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeSystem?: boolean = true;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeInactive?: boolean = false;
}
