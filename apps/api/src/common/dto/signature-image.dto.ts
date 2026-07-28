import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { IsSafeDataImage } from '../validators/is-safe-data-image.validator';

/**
 * Gedeelde basisklasse voor ÁLLE ondertekenroutes (B-404 / WP-C2).
 *
 * Elke DTO die een handtekening-afbeelding accepteert (staf-sign, publieke
 * signature-request, klantportaal-sign, herstelverklaring-sign) MOET deze
 * klasse extenden in plaats van zelf een `signatureImage`-veld te declareren.
 * Zo krijgt een nieuwe ondertekenroute de `@IsSafeDataImage()`-validatie
 * (schema `data:image/png|jpeg|webp;base64`, geldige base64, ≤ 5 MB) er
 * automatisch bij en kan hij niet meer "vergeten" worden — precies de fout
 * waardoor de klantportaal-route elke string als handtekening accepteerde.
 *
 * De spec `signature-image.dto.spec.ts` dwingt dit structureel af voor alle
 * DTO-bestanden die een `signatureImage`-veld bevatten.
 */
export class SignatureImageDto {
  @ApiProperty({
    description: 'Handtekening als data-URL (data:image/png|jpeg|webp;base64, max 5 MB)',
  })
  @IsString({ message: 'Handtekening is verplicht' })
  @IsNotEmpty({ message: 'Handtekening is verplicht' })
  @IsSafeDataImage()
  signatureImage!: string;
}
