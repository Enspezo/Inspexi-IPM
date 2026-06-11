import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  /** Subtitel of beschrijving onder de titel */
  description?: string;
  /** Actieknoppen rechts (bijv. "Nieuwe taak") */
  actions?: ReactNode;
}

/** Uniforme paginakop: titel links, acties rechts. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </div>
  );
}
