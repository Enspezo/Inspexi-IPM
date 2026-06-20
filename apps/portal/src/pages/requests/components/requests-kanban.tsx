import { tenantStorage } from '@/lib/storage';
import { useState, useRef, useCallback } from 'react';
import { RequestStatus } from '@/types';
import type { Priority, Request } from '@/types';
import { ErrorBox, Spinner } from '@/components/ui';
import { useWindowTabs } from '@/providers/window-tabs';
import { getStatusConfig, PRIORITY } from '@/lib/status';
import { useAllRequests } from '../hooks/use-requests';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// ─── Config ────────────────────────────────────────────────────────────────

const COLUMNS: {
  status: RequestStatus;
  label: string;
  color: string;
  headerBg: string;
  defaultCollapsed?: boolean;
}[] = [
  {
    status: RequestStatus.NIEUW,
    label: 'Nieuw',
    color: 'bg-blue-100 text-blue-800',
    headerBg: 'bg-blue-50 border-blue-200',
  },
  {
    status: RequestStatus.IN_BEHANDELING,
    label: 'In behandeling',
    color: 'bg-yellow-100 text-yellow-800',
    headerBg: 'bg-yellow-50 border-yellow-200',
  },
  {
    status: RequestStatus.OFFERTE_GEMAAKT,
    label: 'Offerte gemaakt',
    color: 'bg-purple-100 text-purple-800',
    headerBg: 'bg-purple-50 border-purple-200',
  },
  {
    status: RequestStatus.GEWONNEN,
    label: 'Gewonnen',
    color: 'bg-green-100 text-green-800',
    headerBg: 'bg-green-50 border-green-200',
  },
  {
    status: RequestStatus.VERLOREN,
    label: 'Verloren',
    color: 'bg-red-100 text-red-800',
    headerBg: 'bg-red-50 border-red-200',
    defaultCollapsed: true,
  },
  {
    status: RequestStatus.ON_HOLD,
    label: 'On hold',
    color: 'bg-gray-100 text-gray-600',
    headerBg: 'bg-gray-50 border-gray-200',
    defaultCollapsed: true,
  },
];

// ─── KanbanCard ────────────────────────────────────────────────────────────

interface KanbanCardProps {
  request: Request;
  onDragStart: (id: string) => void;
}

function getContactName(req: Request): string {
  if (!req.contact) return '—';
  if (req.contact.companyName) return req.contact.companyName;
  return (
    [req.contact.firstName, req.contact.lastName].filter(Boolean).join(' ') || '—'
  );
}

function KanbanCard({ request, onDragStart }: KanbanCardProps) {
  const { openTab } = useWindowTabs();
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(request.id);
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
      // Opens the aanvraag as an in-window tab; ⌘/Ctrl-click opens it in the background.
      onClick={(e) =>
        openTab('request', request.id, request.title, {
          background: e.metaKey || e.ctrlKey,
        })
      }
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          openTab('request', request.id, request.title, { background: true });
        }
      }}
      className={`group cursor-pointer rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-all hover:border-primary-300 hover:shadow-md ${
        isDragging ? 'opacity-40 ring-2 ring-primary-400' : ''
      }`}
    >
      {/* Titel */}
      <p className="mb-2 text-sm font-medium text-gray-900 line-clamp-2 group-hover:text-primary-700">
        {request.title}
      </p>

      {/* Relatie */}
      <p className="mb-3 text-xs text-gray-500 truncate">{getContactName(request)}</p>

      {/* Footer: prioriteit + toegewezen */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            getStatusConfig(PRIORITY, request.priority).classes
          }`}
        >
          {getStatusConfig(PRIORITY, request.priority).label}
        </span>

        {request.assignedUser ? (
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700"
            title={`${request.assignedUser.firstName} ${request.assignedUser.lastName}`}
          >
            {request.assignedUser.firstName[0]}
            {request.assignedUser.lastName[0]}
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
  status: RequestStatus;
  label: string;
  color: string;
  headerBg: string;
  requests: Request[];
  isDragOver: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetStatus: RequestStatus) => void;
  onDragStart: (id: string) => void;
}

function KanbanColumn({
  status,
  label,
  color,
  headerBg,
  requests,
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
            {requests.length}
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
            {requests.length}
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
        {requests.length === 0 ? (
          <div
            className={`flex flex-1 items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
              isDragOver ? 'border-primary-300' : 'border-gray-200'
            }`}
          >
            <p className="text-xs text-gray-400">Sleep hier naartoe</p>
          </div>
        ) : (
          requests.map((req) => (
            <KanbanCard key={req.id} request={req} onDragStart={onDragStart} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── RequestsKanban (hoofd-component) ─────────────────────────────────────

interface RequestsKanbanProps {
  search?: string;
  priorityFilter: string;
  assignedTo?: string;
}

export function RequestsKanban({ search, priorityFilter, assignedTo }: RequestsKanbanProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useAllRequests({
    search: search || undefined,
    priority: (priorityFilter as Priority) || undefined,
    assignedTo,
  });

  // Ingeklapte kolommen — persisted in localStorage
  const STORAGE_KEY = 'kanban-collapsed';
  const [collapsedColumns, setCollapsedColumns] = useState<Set<RequestStatus>>(() => {
    try {
      const stored = tenantStorage.getItem(STORAGE_KEY);
      if (stored) return new Set(JSON.parse(stored) as RequestStatus[]);
    } catch {}
    return new Set(COLUMNS.filter((c) => c.defaultCollapsed).map((c) => c.status));
  });

  const toggleCollapse = useCallback((status: RequestStatus) => {
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
  const [dragOverStatus, setDragOverStatus] = useState<RequestStatus | null>(null);

  // Optimistische lokale status-override: { requestId -> newStatus }
  const [localOverrides, setLocalOverrides] = useState<Record<string, RequestStatus>>({});

  // Generieke status-update mutation — id wordt meegegeven in mutationFn
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RequestStatus }) =>
      apiClient.patch(`/requests/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['requests-all'] });
    },
  });

  const handleDragStart = useCallback((id: string) => {
    draggingId.current = id;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, status: RequestStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStatus(status);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverStatus(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetStatus: RequestStatus) => {
      e.preventDefault();
      setDragOverStatus(null);

      const id = draggingId.current;
      if (!id) return;
      draggingId.current = null;

      const allRequests = data?.data ?? [];
      const request = allRequests.find((r) => r.id === id);
      const currentStatus = localOverrides[id] ?? request?.status;
      if (!request || currentStatus === targetStatus) return;

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
        Fout bij het laden van aanvragen: {error.message}
      </ErrorBox>
    );
  }

  const requests = (data?.data ?? []).map((r) => ({
    ...r,
    status: localOverrides[r.id] ?? r.status,
  }));

  // Groepeer per status
  const byStatus = Object.fromEntries(
    COLUMNS.map(({ status }) => [
      status,
      requests.filter((r) => r.status === status),
    ]),
  ) as Record<RequestStatus, Request[]>;

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.status}
            {...col}
            requests={byStatus[col.status] ?? []}
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

      {requests.length === 0 && (
        <p className="mt-8 text-center text-sm text-gray-400">
          Geen aanvragen gevonden
        </p>
      )}
    </div>
  );
}
