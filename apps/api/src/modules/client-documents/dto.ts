import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { SignatureImageDto } from '@/common';

// B-404 (WP-C2): signatureImage komt uit de gedeelde SignatureImageDto en is
// daarmee @IsSafeDataImage()-gevalideerd (data:image/png|jpeg|webp, ≤ 5 MB) —
// identiek aan de staf-, publieke- en herstel-ondertekenroutes.
export class ClientSignDocumentDto extends SignatureImageDto {
  @ApiPropertyOptional({ description: 'Naam ondertekenaar (default: voor- + achternaam)' })
  @IsOptional()
  @IsString()
  signerName?: string;
}
