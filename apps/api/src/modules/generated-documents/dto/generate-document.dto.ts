import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail } from 'class-validator';

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

export class SignDocumentDto {
  @ApiProperty({ description: 'Base64 handtekening-afbeelding' })
  @IsString()
  signatureImage: string;

  @ApiProperty({ description: 'Rol-code van de ondertekenaar' })
  @IsString()
  signerRoleCode: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  signerName?: string;
}

// Publiek (externe link) — geen auth; bewust minimaal.
export class PublicSignDto {
  @ApiProperty({ description: 'Base64 handtekening-afbeelding' })
  @IsString()
  signatureImage: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  signerName?: string;
}
