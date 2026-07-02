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
  /**
   * Trailing sub-routes under a record that should STILL resolve to that record's
   * id (e.g. 'edit' so `/quotes/:id/edit` keeps the record tab active during edit).
   * Without this, any nested route resolves to null (the default).
   */
  idSubRoutes?: string[];
  enabled?: boolean;
  icon?: ReactNode;
}

/**
 * Builds a {@link ResourceTabConfig} from a base path. Detail matching treats any
 * single trailing segment as a record id (so nested routes like `/x/:id/edit` are
 * ignored by default), excluding any declared `staticDetailSegments`. Declare
 * `idSubRoutes` to opt specific nested routes (e.g. `:id/edit`) back into the id.
 *
 * Exported for unit testing the generic matcher (not re-exported from the barrel).
 */
export function makeResource(opts: MakeResourceOptions): ResourceTabConfig {
  const base = opts.basePath.replace(/\/+$/, '');
  const prefix = `${base}/`;
  const staticSegments = new Set(opts.staticDetailSegments ?? []);
  const idSubRoutes = new Set(opts.idSubRoutes ?? []);

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
      if (!rest) return null;
      const slash = rest.indexOf('/');
      // Single trailing segment → a record id, unless it's a declared static segment.
      if (slash === -1) return staticSegments.has(rest) ? null : decodeURIComponent(rest);
      // Nested route `${id}/${sub}` → only resolves when `sub` is a declared id-sub-route.
      const idPart = rest.slice(0, slash);
      const sub = rest.slice(slash + 1);
      if (!idPart || staticSegments.has(idPart) || !idSubRoutes.has(sub)) return null;
      return decodeURIComponent(idPart);
    },
    enabled: opts.enabled ?? true,
    icon: opts.icon,
  };
}

/** Tab-strip icons (h-4 w-4) — mirror the sidebar glyphs for each domein. */
function TabIcon({ d }: { d: string | string[] }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      {paths.map((p) => (
        <path key={p} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={p} />
      ))}
    </svg>
  );
}

const ICON_REQUEST =
  'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4';
const ICON_QUOTE = [
  'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  'M15 2v5a2 2 0 002 2h5',
];
const ICON_PROJECT = 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z';
const ICON_PLANNING =
  'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z';
const ICON_INSPECTION =
  'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4';

/**
 * Registered tab-domeinen. Each entry is the ONLY model-specific knowledge the
 * tab system needs: the provider/strip/persistence/URL-sync are all generic.
 *
 * Adding another model is one entry here + wiring its list rows to
 * `openTab(resourceType, id, title)` + a `useWindowTabSync(...)` on its detail page.
 */
export const RESOURCE_TABS: ResourceTabConfig[] = [
  makeResource({
    resourceType: 'request',
    label: 'Aanvragen',
    pendingTitle: 'Aanvraag',
    basePath: '/requests',
    icon: <TabIcon d={ICON_REQUEST} />,
  }),
  makeResource({
    resourceType: 'quote',
    label: 'Offertes',
    pendingTitle: 'Offerte',
    basePath: '/quotes',
    // `/quotes/new` is never a record tab; `/quotes/:id/edit` keeps the tab active.
    staticDetailSegments: ['new'],
    idSubRoutes: ['edit'],
    icon: <TabIcon d={ICON_QUOTE} />,
  }),
  makeResource({
    resourceType: 'project',
    label: 'Projecten',
    pendingTitle: 'Project',
    basePath: '/projects',
    icon: <TabIcon d={ICON_PROJECT} />,
  }),
  makeResource({
    resourceType: 'planning',
    label: 'Planning',
    pendingTitle: 'Planregel',
    basePath: '/planning',
    // `/planning/new` renders the create form (handled by `/planning/:id`).
    staticDetailSegments: ['new'],
    icon: <TabIcon d={ICON_PLANNING} />,
  }),
  makeResource({
    resourceType: 'inspection',
    label: 'Inspecties',
    pendingTitle: 'Inspectie',
    basePath: '/inspections',
    icon: <TabIcon d={ICON_INSPECTION} />,
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
