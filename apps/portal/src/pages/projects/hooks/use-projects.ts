import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Project, PaginatedResponse } from '@/types';

export interface ListProjectsParams {
  search?: string;
  status?: string;
  contactId?: string;
  projectManagerId?: string;
  page?: number;
  limit?: number;
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
  return useQuery({
    queryKey: ['projects', params],
    queryFn: () =>
      apiClient.get<PaginatedResponse<Project>>(`/projects${buildQuery(params)}`),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
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
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useCreateProjectFromRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) =>
      apiClient.post<Project>(`/projects/from-request/${requestId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
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
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDeleteProject(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete(`/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

// Linked entities
export function useProjectRequests(id: string) {
  return useQuery({
    queryKey: ['projects', id, 'requests'],
    queryFn: () => apiClient.get<any[]>(`/projects/${id}/requests`),
    enabled: !!id,
  });
}

export function useProjectQuotes(id: string) {
  return useQuery({
    queryKey: ['projects', id, 'quotes'],
    queryFn: () => apiClient.get<any[]>(`/projects/${id}/quotes`),
    enabled: !!id,
  });
}

export function useProjectPlanning(id: string) {
  return useQuery({
    queryKey: ['projects', id, 'planning'],
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
    queryKey: ['projects', id, 'locations'],
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
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['planning'] });
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
      queryClient.invalidateQueries({ queryKey: ['projects', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['planning'] });
    },
  });
}
