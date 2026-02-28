import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { SignatureType } from '@prisma/client';

export class UpdateSignatureDto {
  @ApiProperty({ enum: SignatureType, description: 'Type handtekening' })
  @IsEnum(SignatureType)
  signatureType: SignatureType;

  @ApiPropertyOptional({ description: 'Handtekening data (base64 data URL voor DRAW/UPLOAD, tekst voor TEXT)' })
  @IsOptional()
  @IsString()
  @MaxLength(500_000) // base64 images can be large
  signatureData?: string;
}
