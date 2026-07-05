import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import {
  projectKeys,
  projectsAllKeys,
  requestKeys,
  quoteKeys,
  planningKeys,
} from '@/lib/query-keys';
import type { Project, PaginatedResponse } from '@/types';

export interface ListProjectsParams {
  search?: string;
  status?: string;
  contactId?: string;
  projectManagerId?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  enabled?: boolean;
}

function buildQuery(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : '';
}

export function useProjects(params: ListProjectsParams = {}) {
  const { enabled, ...queryParams } = params;
  return useQuery({
    queryKey: projectKeys.list(params),
    queryFn: () =>
      apiClient.get<PaginatedResponse<Project>>(`/projects${buildQuery(queryParams)}`),
    enabled,
  });
}

/** Haalt alle projecten op zonder paginering, voor de kanban-weergave. */
export function useAllProjects(params: { search?: string; enabled?: boolean } = {}) {
  const { enabled, ...rest } = params;
  return useQuery({
    queryKey: projectsAllKeys.list(rest),
    queryFn: () =>
      apiClient.get<PaginatedResponse<Project>>(
        `/projects${buildQuery({ ...rest, limit: 500 })}`,
      ),
    enabled,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => apiClient.get<Project>(`/projects/${id}`),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      description?: string;
      contactId: string;
      locationId?: string;
      projectManagerId?: string;
      startDate?: string;
      expectedEndDate?: string;
      requestId?: string;
      quoteId?: string;
    }) => apiClient.post<Project>('/projects', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useCreateProjectFromRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) =>
      apiClient.post<Project>(`/projects/from-request/${requestId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      queryClient.invalidateQueries({ queryKey: requestKeys.all });
    },
  });
}

export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title?: string;
      description?: string;
      status?: string;
      contactId?: string;
      locationId?: string;
      projectManagerId?: string;
      startDate?: string;
      expectedEndDate?: string;
      endDate?: string;
    }) => apiClient.patch<Project>(`/projects/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useDeleteProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete(`/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

// Linked entities
export function useProjectRequests(id: string) {
  return useQuery({
    queryKey: projectKeys.requests(id),
    queryFn: () => apiClient.get<any[]>(`/projects/${id}/requests`),
    enabled: !!id,
  });
}

export function useProjectQuotes(id: string) {
  return useQuery({
    queryKey: projectKeys.quotes(id),
    queryFn: () => apiClient.get<any[]>(`/projects/${id}/quotes`),
    enabled: !!id,
  });
}

export function useProjectPlanning(id: string) {
  return useQuery({
    queryKey: projectKeys.planning(id),
    queryFn: () => apiClient.get<any[]>(`/projects/${id}/planning`),
    enabled: !!id,
  });
}

export interface ProjectLocation {
  id: string;
  name: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
}

export function useProjectLocations(id: string) {
  return useQuery({
    queryKey: projectKeys.locations(id),
    queryFn: () => apiClient.get<ProjectLocation[]>(`/projects/${id}/locations`),
    enabled: !!id,
  });
}

export function useAssignToProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      requestIds?: string[];
      quoteIds?: string[];
      planningItemIds?: string[];
    }) => apiClient.post(`/projects/${id}/assign`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      queryClient.invalidateQueries({ queryKey: requestKeys.all });
      queryClient.invalidateQueries({ queryKey: quoteKeys.all });
      queryClient.invalidateQueries({ queryKey: planningKeys.all });
    },
  });
}

export function useUnassignFromProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      requestIds?: string[];
      quoteIds?: string[];
      planningItemIds?: string[];
    }) => apiClient.post(`/projects/${id}/unassign`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      queryClient.invalidateQueries({ queryKey: requestKeys.all });
      queryClient.invalidateQueries({ queryKey: quoteKeys.all });
      queryClient.invalidateQueries({ queryKey: planningKeys.all });
    },
  });
}
