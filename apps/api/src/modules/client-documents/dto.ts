import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class ClientSignDocumentDto {
  @ApiProperty({ description: 'Handtekening als data-URL (base64 PNG)' })
  @IsString()
  @IsNotEmpty()
  signatureImage: string;

  @ApiPropertyOptional({ description: 'Naam ondertekenaar (default: voor- + achternaam)' })
  @IsOptional()
  @IsString()
  signerName?: string;
}
