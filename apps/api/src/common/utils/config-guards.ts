import { ForbiddenException } from '@nestjs/common';
import { User } from '@prisma/client';

/**
 * Manageability rule for org-scoped config rows that can also be system rows
 * (`isSystem`). System rows are read-only except in superuser context
 * (`user.orgId === null`); org rows are editable only by their owning org.
 *
 * Single-sources the rule shared by the inspection-config CRUD services
 * (asset-types, categories, checklists, checklist-items, finding-templates,
 * location-types, inspection-templates, document-templates). Each caller keeps
 * its own `private assertManageable(...)` as a thin delegate that supplies the
 * resource-specific Dutch messages.
 *
 * NB: `lookups` (role-based bypass + `orgId === null` treated as system) and
 * `measurement-sheet-templates` (superuser-only) use different rules — they are
 * intentionally NOT routed through this helper.
 */
export function assertSystemRowManageable(
  row: { isSystem: boolean; orgId: string | null },
  user: User,
  messages: { system: string; org: string },
): void {
  if (row.isSystem) {
    if (user.orgId !== null) {
      throw new ForbiddenException(messages.system);
    }
  } else if (row.orgId !== user.orgId) {
    throw new ForbiddenException(messages.org);
  }
}
