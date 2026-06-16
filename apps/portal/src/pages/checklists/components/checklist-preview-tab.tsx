// Preview-tab: items gegroepeerd per categorie (zoals de PWA ze toont). Alleen-lezen.
// Backend-shape: { categories: string[], itemsByCategory: Record<string, {question,isRequired,normReference?}[]> }.

import { Card, Spinner } from '@/components/ui';
import { useChecklistPreview } from '../hooks/use-checklists';

interface Props {
  checklistId: string;
}

export function ChecklistPreviewTab({ checklistId }: Props) {
  const { data, isLoading } = useChecklistPreview(checklistId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!data || data.categories.length === 0) {
    return (
      <Card title="Preview">
        <p className="py-6 text-center text-sm text-gray-500">Nog geen items om te tonen.</p>
      </Card>
    );
  }

  return (
    <Card title="Preview">
      <div className="mb-4 flex flex-wrap gap-2 text-xs text-gray-500">
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 font-medium text-gray-700">
          {data.totalItems} {data.totalItems === 1 ? 'item' : 'items'}
        </span>
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 font-medium text-gray-700">
          {data.requiredItems} verplicht
        </span>
      </div>

      <div className="space-y-6">
        {data.categories.map((category) => (
          <div key={category}>
            <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {category}
            </h4>
            <ol className="space-y-1.5">
              {(data.itemsByCategory[category] ?? []).map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <span className="mt-0.5 text-xs font-medium text-gray-400">{idx + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900">{item.question}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      {item.normReference && <span>{item.normReference}</span>}
                      {item.isRequired && (
                        <span className="inline-flex items-center rounded-full bg-danger-50 px-2 py-0.5 font-medium text-danger-700">
                          Verplicht
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </Card>
  );
}
