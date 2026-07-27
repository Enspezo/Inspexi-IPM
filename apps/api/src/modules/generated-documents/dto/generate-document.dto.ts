import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail } from 'class-validator';
import { SignatureImageDto } from '@/common';

export class GenerateDocumentDto {
  @ApiPropertyOptional({ description: 'Optionele notitie bij genereren' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateGeneratedDocumentDto {
  @ApiPropertyOptional({ description: 'Bewerkte HTML-inhoud' })
  @IsOptional()
  @IsString()
  editedContent?: string;
}

export class RequestSignatureDto {
  @ApiProperty({ description: 'Rol-code (→ imp_signer_roles.code)' })
  @IsString()
  signerRoleCode: string;

  @ApiProperty()
  @IsString()
  signerName: string;

  @ApiProperty()
  @IsEmail()
  signerEmail: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  signerFunction?: string;
}

// signatureImage (incl. @IsSafeDataImage) komt uit de gedeelde SignatureImageDto (B-404).
export class SignDocumentDto extends SignatureImageDto {
  @ApiProperty({ description: 'Rol-code van de ondertekenaar' })
  @IsString()
  signerRoleCode: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  signerName?: string;
}

// Publiek (externe link) — geen auth; bewust minimaal.
export class PublicSignDto extends SignatureImageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  signerName?: string;
}
