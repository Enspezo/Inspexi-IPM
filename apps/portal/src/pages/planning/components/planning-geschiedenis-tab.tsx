import type { PlanningItem } from '@/types';
import { Button, Input, useToast } from '@/components/ui';
import { useAddPlanningQuestion } from '../hooks/use-planning-questions';
import { getErrorMessage } from '@/lib/api-client';

export function PlanningGeschiedenisTab({
  id,
  item,
  newQuestion,
  setNewQuestion,
}: {
  id: string;
  item: PlanningItem;
  newQuestion: string;
  setNewQuestion: React.Dispatch<React.SetStateAction<string>>;
}) {
  const { showToast } = useToast();
  const addQuestion = useAddPlanningQuestion(id);

  const handleAddQuestion = async () => {
    if (!newQuestion.trim()) return;
    try {
      await addQuestion.mutateAsync({ message: newQuestion });
      setNewQuestion('');
      showToast('Vraag/opmerking toegevoegd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <div>
      <div className="mb-4">
        <div className="flex gap-2">
          <Input
            placeholder="Opmerking of vraag toevoegen..."
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleAddQuestion} disabled={addQuestion.isPending || !newQuestion.trim()}>
            Toevoegen
          </Button>
        </div>
      </div>
      <div className="space-y-3">
        {item.history?.map((entry) => (
          <div key={entry.id} className="flex gap-3">
            <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-2" />
            <div className="flex-1">
              <div className="text-sm text-gray-900">{entry.description}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {entry.user
                  ? `${entry.user.firstName} ${entry.user.lastName}`
                  : 'Systeem / Klant'}{' '}
                · {new Date(entry.createdAt).toLocaleString('nl-NL')}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
