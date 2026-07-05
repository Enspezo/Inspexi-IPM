import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { projectKeys } from '@/lib/query-keys';
import type { ProjectFollower } from '@/types';

export function useProjectFollowers(projectId: string) {
  return useQuery({
    queryKey: projectKeys.followers(projectId),
    queryFn: () =>
      apiClient.get<ProjectFollower[]>(`/projects/${projectId}/followers`),
    enabled: !!projectId,
  });
}

export interface AddProjectFollowerData {
  userId?: string;
  email?: string;
  name?: string;
  canViewGeneral?: boolean;
  canViewRequests?: boolean;
  canViewQuotes?: boolean;
  canViewPlanning?: boolean;
  canViewDocuments?: boolean;
}

export function useAddProjectFollower(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AddProjectFollowerData) =>
      apiClient.post<ProjectFollower>(
        `/projects/${projectId}/followers`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.followers(projectId),
      });
    },
  });
}

export interface UpdateProjectFollowerData {
  canViewGeneral?: boolean;
  canViewRequests?: boolean;
  canViewQuotes?: boolean;
  canViewPlanning?: boolean;
  canViewDocuments?: boolean;
}

export function useUpdateProjectFollower(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      followerId,
      data,
    }: {
      followerId: string;
      data: UpdateProjectFollowerData;
    }) =>
      apiClient.patch<ProjectFollower>(
        `/projects/${projectId}/followers/${followerId}`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.followers(projectId),
      });
    },
  });
}

export function useRemoveProjectFollower(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (followerId: string) =>
      apiClient.delete(`/projects/${projectId}/followers/${followerId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.followers(projectId),
      });
    },
  });
}
