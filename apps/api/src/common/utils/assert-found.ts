import { NotFoundException } from '@nestjs/common';

/**
 * Throw a consistent Dutch NotFoundException when an entity is missing.
 *
 * ```ts
 * const contact = assertFound(
 *   await this.prisma.contact.findFirst({ where }),
 *   'Relatie',
 * );
 * ```
 */
export function assertFound<T>(entity: T | null | undefined, entityName: string): T {
  if (entity == null) {
    throw new NotFoundException(`${entityName} niet gevonden`);
  }
  return entity;
}
