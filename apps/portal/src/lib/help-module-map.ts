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
