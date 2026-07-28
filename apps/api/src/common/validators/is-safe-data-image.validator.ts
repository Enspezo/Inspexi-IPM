import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { isSafeDataImage, MAX_DATA_IMAGE_BYTES } from '../utils/html-safe';

/**
 * Class-validator constraint: veld moet een veilige base64 `data:image/...`-URL zijn
 * (png/jpeg/webp, geldige base64, ≤ 5 MB gedecodeerd). Weigert `file:`/`http(s):`-URL's
 * en ingebedde tags — de eerste verdedigingslinie tegen SSRF/HTML-injectie bij het
 * renderen van handtekeningen. Zie ook `isSafeDataImage`/defensieve check vóór interpolatie.
 */
export function IsSafeDataImage(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSafeDataImage',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => isSafeDataImage(value),
        defaultMessage: (args: ValidationArguments) =>
          `${args.property} moet een geldige base64 data-afbeelding zijn ` +
          `(image/png, image/jpeg of image/webp, max ${MAX_DATA_IMAGE_BYTES / (1024 * 1024)} MB)`,
      },
    });
  };
}
