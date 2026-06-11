import type { PlanningItem } from '@/types';
import { Button, Card, useToast } from '@/components/ui';

export function PlanningKlantportaalTab({ item }: { item: PlanningItem }) {
  const { showToast } = useToast();

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <h3 className="font-semibold text-gray-900 mb-2">Klantportaal</h3>
          <p className="text-sm text-gray-500 mb-3">
            Deel deze link met de klant voor toegang tot de afspraakpagina.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-50 rounded px-3 py-2 text-sm text-gray-700 truncate">
              {window.location.origin}/afspraak/{item.publicToken}
            </code>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/afspraak/${item.publicToken}`);
                showToast('Link gekopieerd', 'success');
              }}
            >
              Kopiëren
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
