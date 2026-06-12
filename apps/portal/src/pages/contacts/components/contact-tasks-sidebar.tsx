import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TaskStatus } from '@/types';
import type { Task } from '@/types';
import { useToast } from '@/components/ui';
import { useUpdateTask } from '@/pages/tasks/hooks/use-tasks';
import { EditTaskModal } from '@/pages/tasks/components/edit-task-modal';
import { getErrorMessage } from '@/lib/api-client';

function SidebarTaskCard({
  task,
  userCanWrite,
  onStatusChange,
  onEdit,
  navigate,
}: {
  task: Task;
  userCanWrite: boolean;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isCompleted = task.status === TaskStatus.VOLTOOID;
  const isOverdue = !isCompleted && task.deadline && new Date(task.deadline) < new Date();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <div
      className={`group flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors hover:bg-gray-50 ${
        isCompleted ? 'border-gray-100 bg-gray-50' : 'border-gray-200 bg-white'
      }`}
    >
      {/* Checkbox */}
      <button
        type="button"
        onClick={() =>
          onStatusChange(task.id, isCompleted ? TaskStatus.TE_DOEN : TaskStatus.VOLTOOID)
        }
        className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
          isCompleted
            ? 'border-green-500 bg-green-500 text-white'
            : 'border-gray-300 bg-white hover:border-primary-500'
        }`}
        style={{ width: 18, height: 18 }}
      >
        {isCompleted && (
          <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Task info */}
      <div className="min-w-0 flex-1">
        <button
          onClick={() => navigate(`/tasks/${task.id}`)}
          className={`text-xs font-medium leading-snug hover:underline ${
            isCompleted ? 'text-gray-400 line-through' : 'text-gray-900'
          }`}
        >
          {task.title}
        </button>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
          {task.assignee && (
            <span title={`${task.assignee.firstName} ${task.assignee.lastName}`}>
              {task.assignee.initials || `${task.assignee.firstName[0]}${task.assignee.lastName[0]}`}
            </span>
          )}
          {task.deadline && (
            <span className={isOverdue ? 'font-medium text-red-600' : ''}>
              {new Date(task.deadline).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
      </div>

      {/* 3-dot menu (canWrite only) */}
      {userCanWrite && (
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className="rounded p-0.5 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit(task);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Bewerken
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  navigate(`/tasks/${task.id}`);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Ga naar taak
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ContactTasksSidebar({
  tasks,
  userCanWrite,
  onCreateTask,
}: {
  tasks: Task[];
  userCanWrite: boolean;
  onCreateTask: () => void;
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const updateTaskMutation = useUpdateTask();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const incomplete = tasks.filter((t) => t.status !== TaskStatus.VOLTOOID);
  const completed = tasks.filter((t) => t.status === TaskStatus.VOLTOOID);

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    try {
      await updateTaskMutation.mutateAsync({ id: taskId, data: { status } });
    } catch (err) {
      showToast(getErrorMessage(err, 'Status bijwerken mislukt'), 'error');
    }
  };

  return (
    <div className="space-y-2">
      {userCanWrite && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCreateTask}
            className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nieuwe taak
          </button>
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="text-xs text-gray-400">Nog geen taken</p>
      ) : (
        <>
          {incomplete.length === 0 && (
            <p className="text-xs text-gray-400">Geen openstaande taken</p>
          )}
          {incomplete.map((task) => (
            <SidebarTaskCard
              key={task.id}
              task={task}
              userCanWrite={userCanWrite}
              onStatusChange={handleStatusChange}
              onEdit={setEditingTask}
              navigate={navigate}
            />
          ))}

          {completed.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowCompleted(!showCompleted)}
                className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                <svg
                  className={`h-3.5 w-3.5 transition-transform ${showCompleted ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Voltooid ({completed.length})
              </button>
              {showCompleted && (
                <div className="mt-2 space-y-2">
                  {completed.map((task) => (
                    <SidebarTaskCard
                      key={task.id}
                      task={task}
                      userCanWrite={userCanWrite}
                      onStatusChange={handleStatusChange}
                      onEdit={setEditingTask}
                      navigate={navigate}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {editingTask && (
        <EditTaskModal
          isOpen={!!editingTask}
          onClose={() => setEditingTask(null)}
          task={editingTask}
        />
      )}
    </div>
  );
}
