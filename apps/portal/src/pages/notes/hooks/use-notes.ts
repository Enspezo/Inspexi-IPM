import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Note, NoteEntityType, PaginatedResponse } from '@/types';

interface ListNotesParams {
  search?: string;
  entityType?: NoteEntityType;
  entityId?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function useNotes(
  params: ListNotesParams = {},
  options?: { enabled?: boolean },
) {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.entityType) searchParams.set('entityType', params.entityType);
  if (params.entityId) searchParams.set('entityId', params.entityId);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);

  const qs = searchParams.toString();

  return useQuery<PaginatedResponse<Note>>({
    queryKey: ['notes', params],
    queryFn: () => apiClient.get<PaginatedResponse<Note>>(`/notes${qs ? `?${qs}` : ''}`),
    enabled: options?.enabled,
  });
}

export function useEntityNotes(entityType: NoteEntityType, entityId: string) {
  return useQuery<Note[]>({
    queryKey: ['notes', 'entity', entityType, entityId],
    queryFn: () =>
      apiClient.get<Note[]>(`/notes/by-entity?entityType=${entityType}&entityId=${entityId}`),
    enabled: !!entityId,
  });
}

interface CreateNoteDto {
  entityType: NoteEntityType;
  entityId: string;
  content: string;
  parentId?: string;
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateNoteDto) => apiClient.post<Note>('/notes', data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({
        queryKey: ['notes', 'entity', variables.entityType, variables.entityId],
      });
    },
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      apiClient.patch<Note>(`/notes/${id}`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/notes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });
}
