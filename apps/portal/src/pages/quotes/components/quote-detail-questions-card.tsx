import { useState } from 'react';
import type { QuoteQuestion } from '@/types';
import { Button, Card, useToast } from '@/components/ui';
import { useAddQuestion, useAnswerQuestion } from '../hooks/use-quotes';
import { formatDateTimeLong } from './quote-detail-helpers';

export function QuoteQuestionsCard({
  quoteId,
  questions,
  userCanWrite,
}: {
  quoteId: string;
  questions: QuoteQuestion[] | undefined;
  userCanWrite: boolean;
}) {
  const { showToast } = useToast();
  const addQuestionMutation = useAddQuestion(quoteId);
  const [newQuestion, setNewQuestion] = useState('');
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');

  const answerMutation = useAnswerQuestion(quoteId, answeringId ?? '');

  const handleAddQuestion = async () => {
    if (!newQuestion.trim()) return;
    try {
      await addQuestionMutation.mutateAsync({ message: newQuestion });
      setNewQuestion('');
      showToast('Bericht toegevoegd', 'success');
    } catch { showToast('Toevoegen mislukt', 'error'); }
  };

  const handleAnswer = async () => {
    if (!answerText.trim() || !answeringId) return;
    try {
      await answerMutation.mutateAsync({ message: answerText });
      setAnswerText('');
      setAnsweringId(null);
      showToast('Antwoord verstuurd', 'success');
    } catch { showToast('Versturen mislukt', 'error'); }
  };

  return (
    <Card>
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Vragen & Antwoorden</h3>
      {(questions?.length || 0) === 0 ? (
        <p className="text-sm text-gray-500 mb-4">Nog geen vragen</p>
      ) : (
        <div className="space-y-3 mb-4">
          {questions?.map((q: QuoteQuestion) => (
            <div
              key={q.id}
              className={`rounded-lg p-3 ${q.isFromClient ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-gray-100'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${q.isFromClient ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'}`}>
                    {q.isFromClient ? 'Klant' : (q.user ? `${q.user.firstName} ${q.user.lastName}` : 'Medewerker')}
                  </span>
                  <span className="text-xs text-gray-400">{formatDateTimeLong(q.createdAt)}</span>
                </div>
                {userCanWrite && q.isFromClient && answeringId !== q.id && (
                  <button onClick={() => { setAnsweringId(q.id); setAnswerText(''); }} className="text-xs text-primary-600 hover:text-primary-800">
                    Beantwoorden
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{q.message}</p>
              {answeringId === q.id && (
                <div className="mt-3 flex gap-2">
                  <textarea
                    className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20"
                    rows={3}
                    placeholder="Uw antwoord..."
                    value={answerText}
                    onChange={(e) => setAnswerText(e.target.value)}
                  />
                  <div className="flex flex-col gap-1">
                    <Button size="sm" onClick={handleAnswer} isLoading={answerMutation.isPending} disabled={!answerText.trim()}>Sturen</Button>
                    <Button size="sm" variant="secondary" onClick={() => setAnsweringId(null)}>Annuleer</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Medewerker toevoegt een bericht */}
      {userCanWrite && (
        <div className="flex gap-2 border-t border-gray-100 pt-4">
          <textarea
            className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20"
            rows={2}
            placeholder="Voeg een opmerking of vraag toe..."
            value={newQuestion}
            onChange={(e) => setNewQuestion(e.target.value)}
          />
          <Button size="sm" onClick={handleAddQuestion} isLoading={addQuestionMutation.isPending} disabled={!newQuestion.trim()}>
            Toevoegen
          </Button>
        </div>
      )}
    </Card>
  );
}
