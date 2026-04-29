import { Injectable, BadRequestException } from '@nestjs/common';
import { CustomFieldEntityType, CustomFieldDefinition } from '@prisma/client';
import { PrismaService } from '@/prisma';

@Injectable()
export class CustomFieldsValidator {
  constructor(private prisma: PrismaService) {}

  /**
   * Validates and sanitizes customFields JSON against definitions.
   * Returns cleaned object (only known, non-deleted fields) or null.
   */
  async validateAndSanitize(
    orgId: string,
    entityType: CustomFieldEntityType,
    customFields: Record<string, any> | null | undefined,
  ): Promise<Record<string, any> | null> {
    const definitions = await this.prisma.customFieldDefinition.findMany({
      where: { orgId, entityType, isDeleted: false },
    });

    if (definitions.length === 0) {
      return null;
    }

    const defMap = new Map(definitions.map((d) => [d.fieldName, d]));
    const sanitized: Record<string, any> = {};

    if (customFields && typeof customFields === 'object') {
      for (const [key, value] of Object.entries(customFields)) {
        const def = defMap.get(key);
        if (!def) continue;

        if (value === null || value === undefined || value === '') {
          if (def.isRequired) {
            throw new BadRequestException(
              `Eigen veld "${def.label}" is verplicht`,
            );
          }
          continue;
        }

        this.validateFieldValue(def, value);
        sanitized[key] = value;
      }
    }

    // Check missing required fields
    for (const def of definitions) {
      if (def.isRequired && !(def.fieldName in sanitized)) {
        throw new BadRequestException(
          `Eigen veld "${def.label}" is verplicht`,
        );
      }
    }

    return Object.keys(sanitized).length > 0 ? sanitized : null;
  }

  private validateFieldValue(def: CustomFieldDefinition, value: any): void {
    switch (def.fieldType) {
      case 'TEXT':
        if (typeof value !== 'string') {
          throw new BadRequestException(`"${def.label}" moet tekst zijn`);
        }
        break;
      case 'NUMBER':
        if (typeof value !== 'number' || isNaN(value)) {
          throw new BadRequestException(`"${def.label}" moet een getal zijn`);
        }
        break;
      case 'DATE':
        if (typeof value !== 'string' || isNaN(Date.parse(value))) {
          throw new BadRequestException(
            `"${def.label}" moet een geldige datum zijn`,
          );
        }
        break;
      case 'BOOLEAN':
        if (typeof value !== 'boolean') {
          throw new BadRequestException(
            `"${def.label}" moet een ja/nee waarde zijn`,
          );
        }
        break;
      case 'SELECT': {
        const options = (def.options as string[]) ?? [];
        if (!options.includes(value)) {
          throw new BadRequestException(
            `"${def.label}" moet een van de opties zijn: ${options.join(', ')}`,
          );
        }
        break;
      }
    }
  }
}
