import { useState } from 'react';
import { Button, StatusBadge } from '@/components/ui';
import { DocumentsSection } from '@/components/documents/documents-section';
import { NotesSection } from '@/components/notes/notes-section';
import { CreateTaskModal } from '@/pages/tasks/components/create-task-modal';
import { useTasks } from '@/pages/tasks/hooks/use-tasks';
import { formatDate } from '@/lib/format';
import { TASK_STATUS } from '@/lib/status';
import { TaskEntityType, DocumentEntityType, NoteEntityType } from '@/types';

/**
 * Taken, documenten en notities gekoppeld aan een fase (PRD-12 §12.7.2).
 * Hergebruikt de bestaande entity-scoped componenten met entityType PROJECT_PHASE.
 */
export function PhaseActivitySection({
  phaseId,
  canWrite,
}: {
  phaseId: string;
  canWrite: boolean;
}) {
  const [taskOpen, setTaskOpen] = useState(false);
  const { data: tasksData } = useTasks({
    entityType: TaskEntityType.PROJECT_PHASE,
    entityId: phaseId,
    limit: 100,
  });
  const tasks = tasksData?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Taken */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-900">Taken</h4>
          {canWrite && (
            <Button variant="secondary" onClick={() => setTaskOpen(true)}>
              Taak toevoegen
            </Button>
          )}
        </div>
        {tasks.length === 0 ? (
          <p className="text-sm text-gray-500">Geen taken.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="text-sm text-gray-900">{t.title}</span>
                  {t.deadline && (
                    <span className="ml-2 text-xs text-gray-500">
                      {formatDate(t.deadline)}
                    </span>
                  )}
                </div>
                <StatusBadge status={t.status} map={TASK_STATUS} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Documenten */}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-gray-900">Documenten</h4>
        <DocumentsSection
          entityType={DocumentEntityType.PROJECT_PHASE}
          entityId={phaseId}
          canUpload={canWrite}
        />
      </div>

      {/* Notities */}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-gray-900">Notities</h4>
        <NotesSection entityType={NoteEntityType.PROJECT_PHASE} entityId={phaseId} />
      </div>

      {taskOpen && (
        <CreateTaskModal
          isOpen={taskOpen}
          onClose={() => setTaskOpen(false)}
          entityType={TaskEntityType.PROJECT_PHASE}
          entityId={phaseId}
        />
      )}
    </div>
  );
}
