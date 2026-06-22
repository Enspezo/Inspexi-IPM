import { tenantStorage } from '@/lib/storage';
import { useState, useRef, useCallback } from 'react';
import { ProjectStatus } from '@/types';
import type { Project } from '@/types';
import { ErrorBox, Spinner } from '@/components/ui';
import { useWindowTabs } from '@/providers/window-tabs';
import { getStatusConfig, PROJECT_STATUS } from '@/lib/status';
import { useAllProjects } from '../hooks/use-projects';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Config ────────────────────────────────────────────────────────────────

// Kolomvolgorde + welke kolommen standaard ingeklapt zijn. De afgeronde en
// geannuleerde projecten zijn "klaar", dus die klappen we standaard in.
const COLUMN_DEFS: { status: ProjectStatus; defaultCollapsed?: boolean }[] = [
  { status: ProjectStatus.ACTIEF },
  { status: ProjectStatus.ON_HOLD },
  { status: ProjectStatus.AFGEROND, defaultCollapsed: true },
  { status: ProjectStatus.GEANNULEERD, defaultCollapsed: true },
];

// Lichtere header-tint per Tailwind-kleurfamilie. De badge-kleur (en het label)
// komen uit PROJECT_STATUS; alleen deze header-variant is kanban-specifiek.
// Volledige class-strings i.v.m. Tailwind JIT (geen dynamische namen).
const HEADER_BG: Record<string, string> = {
  green: 'bg-green-50 border-green-200',
  yellow: 'bg-yellow-50 border-yellow-200',
  blue: 'bg-blue-50 border-blue-200',
  red: 'bg-red-50 border-red-200',
  gray: 'bg-gray-50 border-gray-200',
};

function headerBgFor(badgeClasses: string): string {
  const hue = badgeClasses.match(/bg-([a-z]+)-\d+/)?.[1] ?? 'gray';
  return HEADER_BG[hue] ?? HEADER_BG.gray;
}

const COLUMNS = COLUMN_DEFS.map(({ status, defaultCollapsed }) => {
  const { label, classes } = getStatusConfig(PROJECT_STATUS, status);
  return { status, label, color: classes, headerBg: headerBgFor(classes), defaultCollapsed };
});

// ─── Pure helpers (getest in projects-kanban.test.ts) ─────────────────────

function getContactName(project: Project): string {
  if (!project.contact) return '—';
  if (project.contact.companyName) return project.contact.companyName;
  return (
    [project.contact.firstName, project.contact.lastName].filter(Boolean).join(' ') || '—'
  );
}

/** Past de optimistische lokale status-overrides toe en groepeert per status. */
export function groupProjectsByStatus(
  projects: Project[],
  overrides: Record<string, ProjectStatus>,
  statuses: ProjectStatus[] = COLUMN_DEFS.map((c) => c.status),
): Record<ProjectStatus, Project[]> {
  const withOverrides = projects.map((p) => ({
    ...p,
    status: overrides[p.id] ?? p.status,
  }));
  return Object.fromEntries(
    statuses.map((status) => [status, withOverrides.filter((p) => p.status === status)]),
  ) as Record<ProjectStatus, Project[]>;
}

/** Client-side filter op projectmanager (multi-select), net als in de tabel. */
export function filterByManagers(projects: Project[], managerIds: string[]): Project[] {
  if (managerIds.length === 0) return projects;
  return projects.filter(
    (p) => p.projectManager && managerIds.includes(p.projectManager.id),
  );
}

// ─── KanbanCard ────────────────────────────────────────────────────────────

interface KanbanCardProps {
  project: Project;
  onDragStart: (id: string) => void;
}

function KanbanCard({ project, onDragStart }: KanbanCardProps) {
  const { openTab } = useWindowTabs();
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(project.id);
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
      // Opens the project as an in-window tab; ⌘/Ctrl-click opens it in the background.
      onClick={(e) =>
        openTab('project', project.id, project.projectNumber, {
          background: e.metaKey || e.ctrlKey,
        })
      }
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          openTab('project', project.id, project.projectNumber, { background: true });
        }
      }}
      className={`group cursor-pointer rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-all hover:border-primary-300 hover:shadow-md ${
        isDragging ? 'opacity-40 ring-2 ring-primary-400' : ''
      }`}
    >
      {/* Projectnummer */}
      <p className="mb-1 font-mono text-xs text-gray-400">{project.projectNumber}</p>

      {/* Titel */}
      <p className="mb-2 text-sm font-medium text-gray-900 line-clamp-2 group-hover:text-primary-700">
        {project.title}
      </p>

      {/* Relatie */}
      <p className="mb-3 text-xs text-gray-500 truncate">{getContactName(project)}</p>

      {/* Footer: startdatum + projectmanager */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500">
          {project.startDate
            ? new Date(project.startDate).toLocaleDateString('nl-NL')
            : '—'}
        </span>

        {project.projectManager ? (
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700"
            title={`${project.projectManager.firstName} ${project.projectManager.lastName}`}
          >
            {project.projectManager.firstName?.[0]}
            {project.projectManager.lastName?.[0]}
          </span>
        ) : (
          <span className="h-6 w-6 rounded-full border border-dashed border-gray-300" />
        )}
      </div>
    </div>
  );
}

// ─── KanbanColumn ─────────────────────────────────────────────────────────

interface KanbanColumnProps {
  status: ProjectStatus;
  label: string;
  color: string;
  headerBg: string;
  projects: Project[];
  isDragOver: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetStatus: ProjectStatus) => void;
  onDragStart: (id: string) => void;
}

function KanbanColumn({
  status,
  label,
  color,
  headerBg,
  projects,
  isDragOver,
  isCollapsed,
  onToggleCollapse,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
}: KanbanColumnProps) {
  // dragCounter voorkomt dat onDragLeave afgaat bij hover over child-elementen
  const dragCounter = useRef(0);

  if (isCollapsed) {
    return (
      <div
        className={`flex w-10 flex-shrink-0 flex-col rounded-xl border-2 transition-colors cursor-pointer select-none ${
          isDragOver ? 'border-primary-400 bg-primary-50' : 'border-transparent bg-gray-100'
        }`}
        title={`${label} uitvouwen`}
        onClick={onToggleCollapse}
        onDragOver={onDragOver}
        onDragEnter={() => { dragCounter.current += 1; }}
        onDragLeave={() => {
          dragCounter.current -= 1;
          if (dragCounter.current === 0) onDragLeave();
        }}
        onDrop={(e) => { dragCounter.current = 0; onDrop(e, status); }}
      >
        {/* Ingeklapte header */}
        <div
          className={`flex items-center justify-center rounded-t-lg border px-2 py-2.5 ${headerBg}`}
        >
          <span
            className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${color}`}
          >
            {projects.length}
          </span>
        </div>

        {/* Verticale label */}
        <div className="flex flex-1 items-center justify-center py-4">
          <span
            className="text-xs font-semibold text-gray-500 whitespace-nowrap"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            {label}
          </span>
        </div>

        {/* Uitvouw-chevron */}
        <div className="flex items-center justify-center pb-3">
          <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-[600px] w-72 flex-shrink-0 flex-col rounded-xl border-2 transition-colors ${
        isDragOver ? 'border-primary-400 bg-primary-50' : 'border-transparent bg-gray-100'
      }`}
      onDragOver={onDragOver}
      onDragEnter={() => { dragCounter.current += 1; }}
      onDragLeave={() => {
        dragCounter.current -= 1;
        if (dragCounter.current === 0) onDragLeave();
      }}
      onDrop={(e) => { dragCounter.current = 0; onDrop(e, status); }}
    >
      {/* Kolomkop */}
      <div
        className={`flex items-center justify-between rounded-t-lg border px-3 py-2.5 ${headerBg}`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${color.split(' ')[0]}`}
          />
          <span className="text-sm font-semibold text-gray-700">{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${color}`}
          >
            {projects.length}
          </span>
          <button
            onClick={onToggleCollapse}
            title="Kolom inklappen"
            className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-black/10 hover:text-gray-600 transition-colors"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Kaartjes */}
      <div className="flex flex-1 flex-col gap-2 p-2">
        {projects.length === 0 ? (
          <div
            className={`flex flex-1 items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
              isDragOver ? 'border-primary-300' : 'border-gray-200'
            }`}
          >
            <p className="text-xs text-gray-400">Sleep hier naartoe</p>
          </div>
        ) : (
          projects.map((project) => (
            <KanbanCard key={project.id} project={project} onDragStart={onDragStart} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── ProjectsKanban (hoofd-component) ─────────────────────────────────────

interface ProjectsKanbanProps {
  search?: string;
  managerIds: string[];
}

export function ProjectsKanban({ search, managerIds }: ProjectsKanbanProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useAllProjects({ search: search || undefined });

  // Ingeklapte kolommen — persisted in localStorage (eigen key i.p.v. de
  // requests-kanban, anders delen beide kanbans dezelfde ingeklapte set).
  const STORAGE_KEY = 'projects-kanban-collapsed';
  const [collapsedColumns, setCollapsedColumns] = useState<Set<ProjectStatus>>(() => {
    try {
      const stored = tenantStorage.getItem(STORAGE_KEY);
      if (stored) return new Set(JSON.parse(stored) as ProjectStatus[]);
    } catch {}
    return new Set(COLUMNS.filter((c) => c.defaultCollapsed).map((c) => c.status));
  });

  const toggleCollapse = useCallback((status: ProjectStatus) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      try { tenantStorage.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  // Drag state
  const draggingId = useRef<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<ProjectStatus | null>(null);

  // Optimistische lokale status-override: { projectId -> newStatus }
  const [localOverrides, setLocalOverrides] = useState<Record<string, ProjectStatus>>({});

  // Status-update via de bestaande, org-scoped project-update route. Projecten
  // hebben geen aparte /status-route (anders dan aanvragen); hergebruik houdt de
  // AFGEROND→einddatum-zetting en de status-notificatie op één plek.
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProjectStatus }) =>
      apiClient.patch(`/projects/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['projects-all'] });
    },
  });

  const handleDragStart = useCallback((id: string) => {
    draggingId.current = id;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, status: ProjectStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStatus(status);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverStatus(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetStatus: ProjectStatus) => {
      e.preventDefault();
      setDragOverStatus(null);

      const id = draggingId.current;
      if (!id) return;
      draggingId.current = null;

      const allProjects = data?.data ?? [];
      const project = allProjects.find((p) => p.id === id);
      const currentStatus = localOverrides[id] ?? project?.status;
      if (!project || currentStatus === targetStatus) return;

      // Optimistisch updaten in de UI
      setLocalOverrides((prev) => ({ ...prev, [id]: targetStatus }));

      try {
        await updateStatusMutation.mutateAsync({ id, status: targetStatus });
        // Na succesvolle server-update: override verwijderen (server-data overschrijft)
        setLocalOverrides((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      } catch {
        // Terugdraaien bij fout
        setLocalOverrides((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [data, localOverrides, updateStatusMutation],
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorBox>
        Fout bij het laden van projecten: {error.message}
      </ErrorBox>
    );
  }

  const projects = filterByManagers(data?.data ?? [], managerIds);
  const byStatus = groupProjectsByStatus(projects, localOverrides);

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.status}
            {...col}
            projects={byStatus[col.status] ?? []}
            isDragOver={dragOverStatus === col.status}
            isCollapsed={collapsedColumns.has(col.status)}
            onToggleCollapse={() => toggleCollapse(col.status)}
            onDragOver={(e) => handleDragOver(e, col.status)}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onDragStart={handleDragStart}
          />
        ))}
      </div>

      {projects.length === 0 && (
        <p className="mt-8 text-center text-sm text-gray-400">
          Geen projecten gevonden
        </p>
      )}
    </div>
  );
}
