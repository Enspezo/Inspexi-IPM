import type { ReactNode } from 'react';

/**
 * Resource registry — the ONLY place that holds model-specific knowledge for the
 * in-window tab system. To support a new model you add one entry here and wire its
 * list rows to `openTab(resourceType, id, title)`; everything else (provider,
 * strip, persistence, URL-sync) is generic.
 */
export interface ResourceTabConfig {
  /** Stable key for this tab-domein (e.g. 'request'). */
  resourceType: string;
  /** Anchor (overzicht) tab label — NL. */
  label: string;
  /** Placeholder title shown until a directly-opened record reports its real title — NL. */
  pendingTitle: string;
  /** The list/overzicht route — the non-closable anchor. */
  listRoute: string;
  detailRoute: (id: string) => string;
  /** True when `pathname` is exactly this resource's list route. */
  isListRoute: (pathname: string) => boolean;
  /** Returns the record id when `pathname` is a detail route of this resource, else null. */
  matchDetailId: (pathname: string) => string | null;
  /** Whether the tab-strip is active for this resource (gate new models behind this). */
  enabled: boolean;
  icon?: ReactNode;
}

interface MakeResourceOptions {
  resourceType: string;
  label: string;
  pendingTitle: string;
  /** Base path, e.g. '/requests'. Detail routes are `${basePath}/:id`. */
  basePath: string;
  /**
   * Single-segment children under basePath that are NOT record ids (e.g. 'new').
   * Keeps the generic id-matcher honest for resources with static sub-routes.
   */
  staticDetailSegments?: string[];
  enabled?: boolean;
  icon?: ReactNode;
}

/**
 * Builds a {@link ResourceTabConfig} from a base path. Detail matching treats any
 * single trailing segment as a record id (so nested routes like `/x/:id/edit` are
 * ignored), excluding any declared `staticDetailSegments`.
 *
 * Exported for unit testing the generic matcher (not re-exported from the barrel).
 */
export function makeResource(opts: MakeResourceOptions): ResourceTabConfig {
  const base = opts.basePath.replace(/\/+$/, '');
  const prefix = `${base}/`;
  const staticSegments = new Set(opts.staticDetailSegments ?? []);

  return {
    resourceType: opts.resourceType,
    label: opts.label,
    pendingTitle: opts.pendingTitle,
    listRoute: base,
    // Encode so detailRoute/matchDetailId are a genuine inverse pair for any id.
    detailRoute: (id) => `${base}/${encodeURIComponent(id)}`,
    isListRoute: (pathname) => pathname === base,
    matchDetailId: (pathname) => {
      if (!pathname.startsWith(prefix)) return null;
      const rest = pathname.slice(prefix.length);
      if (!rest || rest.includes('/') || staticSegments.has(rest)) return null;
      return decodeURIComponent(rest);
    },
    enabled: opts.enabled ?? true,
    icon: opts.icon,
  };
}

function InboxIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
      />
    </svg>
  );
}

/**
 * Registered tab-domeinen. Only `request` is active for now (REQ2 scope).
 *
 * Adding another model is one entry, e.g.:
 *   makeResource({ resourceType: 'quote', label: 'Offertes', pendingTitle: 'Offerte',
 *                  basePath: '/quotes', staticDetailSegments: ['new'], icon: <…/> })
 * then change that list's row onClick to `openTab('quote', id, title)`.
 */
export const RESOURCE_TABS: ResourceTabConfig[] = [
  makeResource({
    resourceType: 'request',
    label: 'Aanvragen',
    pendingTitle: 'Aanvraag',
    basePath: '/requests',
    icon: <InboxIcon />,
  }),
];

export const RESOURCE_TABS_BY_TYPE: Record<string, ResourceTabConfig> =
  Object.fromEntries(RESOURCE_TABS.map((r) => [r.resourceType, r]));

export type ActiveResourceMatch =
  | { kind: 'list'; resource: ResourceTabConfig }
  | { kind: 'detail'; resource: ResourceTabConfig; id: string };

/** Resolve the current pathname to the enabled resource it belongs to, if any. */
export function findResourceByPath(pathname: string): ActiveResourceMatch | null {
  for (const resource of RESOURCE_TABS) {
    if (!resource.enabled) continue;
    if (resource.isListRoute(pathname)) return { kind: 'list', resource };
    const id = resource.matchDetailId(pathname);
    if (id) return { kind: 'detail', resource, id };
  }
  return null;
}
