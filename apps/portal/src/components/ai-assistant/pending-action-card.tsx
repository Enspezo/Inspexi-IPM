import { useState } from 'react';
import { Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import type { AiPendingActionCard } from '@/types';
import { useConfirmAiAction, useRejectAiAction } from './hooks/use-ai';

interface Props {
  action: AiPendingActionCard;
  onResolved: (id: string) => void;
}

/** Bevestigingskaart voor een voorgestelde schrijfactie (PRD-15 §4.2). */
export function PendingActionCard({ action, onResolved }: Props) {
  const { showToast } = useToast();
  const confirm = useConfirmAiAction();
  const reject = useRejectAiAction();
  const [resolved, setResolved] = useState<null | 'confirmed' | 'rejected'>(null);
  const [editing, setEditing] = useState(false);
  const [args, setArgs] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(action.args ?? {}).map(([k, v]) => [
        k,
        typeof v === 'string' ? v : JSON.stringify(v),
      ]),
    ),
  );

  const busy = confirm.isPending || reject.isPending;

  async function onConfirm() {
    try {
      // Bewerkte velden staan als string in het formulier; parse ze terug naar
      // native JSON-types (bijv. getallen/booleans) waar mogelijk.
      let finalArgs: Record<string, unknown> | undefined;
      if (editing) {
        finalArgs = Object.fromEntries(
          Object.entries(args).map(([k, v]) => {
            try {
              return [k, JSON.parse(v)];
            } catch {
              return [k, v];
            }
          }),
        );
      }
      await confirm.mutateAsync({ id: action.id, args: finalArgs });
      setResolved('confirmed');
      onResolved(action.id);
    } catch (err) {
      showToast(getErrorMessage(err, 'Uitvoeren mislukt'), 'error');
    }
  }

  async function onReject() {
    try {
      await reject.mutateAsync(action.id);
      setResolved('rejected');
      onResolved(action.id);
    } catch (err) {
      showToast(getErrorMessage(err, 'Afwijzen mislukt'), 'error');
    }
  }

  return (
    <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-3 text-sm">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-700">
          Actie
        </span>
        <span className="font-mono text-[11px] text-gray-500">{action.toolName}</span>
      </div>
      <p className="text-gray-800">{action.summary}</p>

      {editing && (
        <div className="mt-2 space-y-1.5">
          {Object.keys(args).map((k) => (
            <label key={k} className="block">
              <span className="text-[11px] text-gray-500">{k}</span>
              <input
                className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                value={args[k]}
                onChange={(e) => setArgs((a) => ({ ...a, [k]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      )}

      {resolved ? (
        <p className={`mt-2 text-xs font-medium ${resolved === 'confirmed' ? 'text-success-700' : 'text-gray-500'}`}>
          {resolved === 'confirmed' ? '✓ Uitgevoerd' : 'Afgewezen'}
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" onClick={onConfirm} isLoading={confirm.isPending} disabled={busy}>
            Bevestigen
          </Button>
          <Button size="sm" variant="secondary" onClick={onReject} disabled={busy}>
            Afwijzen
          </Button>
          {!editing && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={busy}>
              Aanpassen
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
