/** Prefix → moduleKey. Langste matchende prefix wint; geen match → 'general'. */
export const HELP_MODULE_MAP: { prefix: string; moduleKey: string }[] = [
  { prefix: '/quotes', moduleKey: 'quotes' },
  { prefix: '/requests', moduleKey: 'requests' },
  { prefix: '/contacts', moduleKey: 'contacts' },
  { prefix: '/planning', moduleKey: 'planning' },
  { prefix: '/work-orders', moduleKey: 'planning' },
  { prefix: '/tasks', moduleKey: 'tasks' },
  { prefix: '/documents', moduleKey: 'documents' },
  { prefix: '/products', moduleKey: 'products' },
  { prefix: '/price-tables', moduleKey: 'products' },
  { prefix: '/projects', moduleKey: 'projects' },
  { prefix: '/inspections', moduleKey: 'inspections' },
  { prefix: '/organization', moduleKey: 'organization' },
  { prefix: '/dashboard', moduleKey: 'dashboard' },
  { prefix: '/help', moduleKey: 'help' },
];

export function resolveModuleKey(pathname: string): string {
  const match = HELP_MODULE_MAP.filter((m) => pathname.startsWith(m.prefix)).sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )[0];
  return match?.moduleKey ?? 'general';
}

/** Nederlandse labels per moduleKey (voor de artikel-editor multiselect). */
const HELP_MODULE_KEY_LABELS: Record<string, string> = {
  quotes: 'Offertes',
  requests: 'Aanvragen',
  contacts: 'Relaties',
  planning: 'Planning & werkbonnen',
  tasks: 'Taken',
  documents: 'Documenten',
  products: 'Producten & prijstabellen',
  projects: 'Projecten',
  inspections: 'Inspecties',
  organization: 'Organisatie',
  dashboard: 'Dashboard',
  help: 'Help',
  general: 'Algemeen',
};

/**
 * Canonieke set module-keys: unieke keys uit de route-map + de `general`-fallback.
 * Eén bron van waarheid, gedeeld door de help-widget (context) en de artikel-editor.
 */
export const HELP_MODULE_KEY_OPTIONS: { value: string; label: string }[] = [
  ...new Set(HELP_MODULE_MAP.map((m) => m.moduleKey)),
  'general',
].map((key) => ({ value: key, label: HELP_MODULE_KEY_LABELS[key] ?? key }));
