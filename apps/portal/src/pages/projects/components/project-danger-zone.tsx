import { Button, Card } from '@/components/ui';

// ─── Danger Zone (Instellingen tab) ─────────────────────────

export function DangerZone({
  canWrite,
  onDelete,
}: {
  canWrite: boolean;
  onDelete: () => void;
}) {
  if (!canWrite) {
    return (
      <p className="text-sm text-gray-500">
        Je hebt geen rechten om dit project te bewerken.
      </p>
    );
  }

  return (
    <Card>
      <h3 className="mb-2 font-semibold text-red-600">Gevarenzone</h3>
      <p className="mb-4 text-sm text-gray-500">
        Een verwijderd project kan niet worden hersteld.
      </p>
      <Button variant="danger" onClick={onDelete}>
        Project verwijderen
      </Button>
    </Card>
  );
}
