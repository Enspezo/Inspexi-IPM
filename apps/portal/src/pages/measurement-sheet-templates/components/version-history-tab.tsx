// Versiehistorie tab: read-only lijst van versie-overgangen (versie, status,
// changeDescription, datum, wie). Spiegelt de stijl van de AuditHistory-items.

import { Card, Spinner, StatusBadge } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { MEASUREMENT_SHEET_STATUS } from '@/lib/status';
import { useTemplateHistory } from '../hooks/use-measurement-sheet-templates';

interface Props {
  templateId: string;
}

export function VersionHistoryTab({ templateId }: Props) {
  const { data, isLoading } = useTemplateHistory(templateId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  const entries = data ?? [];

  return (
    <Card title="Versiehistorie">
      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">Nog geen versiehistorie.</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-1 rounded-lg border border-gray-200 px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  v{entry.version}
                </span>
                <StatusBadge status={entry.status} map={MEASUREMENT_SHEET_STATUS} />
                <span className="text-xs text-gray-400">{formatDate(entry.createdAt)}</span>
              </div>
              {entry.changeDescription && (
                <p className="text-sm text-gray-700">{entry.changeDescription}</p>
              )}
              {entry.approvalReason && (
                <p className="text-xs text-gray-500">Goedkeuring: {entry.approvalReason}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
