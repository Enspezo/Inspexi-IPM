import { useNavigate } from 'react-router-dom';
import { TaskStatus } from '@/types';
import type { Task } from '@/types';
import { Button, StatusBadge } from '@/components/ui';
import { TASK_STATUS } from '@/lib/status';

export function PlanningTasksTab({
  tasks,
  userCanWrite,
  onCreateTask,
  onStatusChange,
  navigate,
}: {
  tasks: Task[];
  userCanWrite: boolean;
  onCreateTask: () => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const incomplete = tasks.filter((t) => t.status !== TaskStatus.VOLTOOID);
  const completed = tasks.filter((t) => t.status === TaskStatus.VOLTOOID);

  return (
    <div className="space-y-4">
      {userCanWrite && (
        <div className="flex justify-end">
          <Button size="sm" onClick={onCreateTask}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Taak aanmaken
          </Button>
        </div>
      )}
      {tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">Nog geen taken voor deze planregel</p>
      ) : (
        <div className="space-y-6">
          {incomplete.length > 0 && (
            <div className="space-y-2">
              {incomplete.map((task) => (
                <PlanningTaskCard key={task.id} task={task} onStatusChange={onStatusChange} navigate={navigate} />
              ))}
            </div>
          )}
          {completed.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-500">Voltooid ({completed.length})</h4>
              {completed.map((task) => (
                <PlanningTaskCard key={task.id} task={task} onStatusChange={onStatusChange} navigate={navigate} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlanningTaskCard({
  task,
  onStatusChange,
  navigate,
}: {
  task: Task;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const isCompleted = task.status === TaskStatus.VOLTOOID;
  const isOverdue = !isCompleted && task.deadline && new Date(task.deadline) < new Date();

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-gray-50 ${
        isCompleted ? 'border-gray-100 bg-gray-50' : 'border-gray-200 bg-white'
      }`}
    >
      {/* Checkbox voor snelle status-toggle */}
      <button
        type="button"
        onClick={() => onStatusChange(task.id, isCompleted ? TaskStatus.TE_DOEN : TaskStatus.VOLTOOID)}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
          isCompleted
            ? 'border-green-500 bg-green-500 text-white'
            : 'border-gray-300 bg-white hover:border-primary-500'
        }`}
      >
        {isCompleted && (
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Taakinfo */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/tasks/${task.id}`)}
            className={`text-sm font-medium hover:underline ${
              isCompleted ? 'text-gray-400 line-through' : 'text-gray-900'
            }`}
          >
            {task.title}
          </button>
          <StatusBadge status={task.status} map={TASK_STATUS} />
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
          {task.assignee && (
            <span>{task.assignee.firstName} {task.assignee.lastName}</span>
          )}
          {task.deadline && (
            <span className={isOverdue ? 'font-medium text-red-600' : ''}>
              {isOverdue && (
                <svg className="mr-0.5 inline h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              )}
              {new Date(task.deadline).toLocaleDateString('nl-NL')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
