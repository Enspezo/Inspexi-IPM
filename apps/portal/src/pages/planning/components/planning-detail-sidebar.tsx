import { Link } from 'react-router-dom';
import { DocumentEntityType, NoteEntityType, TaskStatus } from '@/types';
import type { Task } from '@/types';
import { useToast } from '@/components/ui';
import { SidebarSection } from '@/components/layout/detail-page-layout';
import { NotesSidebarSection, HistorySidebarSection, DocumentsSidebarSection } from '@/components/layout/sidebar-sections';
import { useUpdateTask } from '@/pages/tasks/hooks/use-tasks';
import { getErrorMessage } from '@/lib/api-client';

export function PlanningDetailSidebar({
  id,
  allTasks,
  incompleteTasks,
  userCanWrite,
  setIsTaskOpen,
}: {
  id: string;
  allTasks: Task[];
  incompleteTasks: Task[];
  userCanWrite: boolean;
  setIsTaskOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { showToast } = useToast();
  const updateTaskMutation = useUpdateTask();

  return (
    <div className="space-y-8">
      <SidebarSection
        icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
        label="Taken"
        count={incompleteTasks.length}
      >
        <div className="space-y-2">
          {allTasks.length === 0 ? (
            <p className="text-sm text-gray-400">Geen taken</p>
          ) : (
            allTasks.map((task) => (
              <div key={task.id} className="group flex items-start gap-2 rounded-lg border border-gray-100 bg-white p-2 shadow-sm">
                <button
                  type="button"
                  onClick={async () => {
                    const newStatus = task.status === TaskStatus.VOLTOOID ? TaskStatus.TE_DOEN : TaskStatus.VOLTOOID;
                    try {
                      await updateTaskMutation.mutateAsync({ id: task.id, data: { status: newStatus } });
                    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
                  }}
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    task.status === TaskStatus.VOLTOOID
                      ? 'border-green-500 bg-green-500 text-white'
                      : 'border-gray-300 hover:border-primary-400'
                  }`}
                >
                  {task.status === TaskStatus.VOLTOOID && (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/tasks/${task.id}`}
                    className={`block text-sm font-medium hover:text-primary-600 ${
                      task.status === TaskStatus.VOLTOOID ? 'text-gray-400 line-through' : 'text-gray-900'
                    }`}
                  >
                    {task.title}
                  </Link>
                  {task.deadline && (
                    <p className="text-xs text-gray-400">
                      {new Date(task.deadline).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
          {userCanWrite && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setIsTaskOpen(true)}
                className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Nieuwe taak
              </button>
            </div>
          )}
        </div>
      </SidebarSection>

      <NotesSidebarSection entityType={NoteEntityType.PLANNING} entityId={id} />

      <DocumentsSidebarSection
        entityType={DocumentEntityType.PLANNING}
        entityId={id}
        canUpload={userCanWrite}
        showSharedWithClient
      />

      <HistorySidebarSection entityType="PlanningItem" entityId={id} />
    </div>
  );
}
