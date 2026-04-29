import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export interface StorageStatsByEntityType {
  entityType: string;
  totalBytes: number;
  fileCount: number;
}

export interface StorageStatsByUser {
  userId: string;
  userName: string;
  userEmail: string;
  totalBytes: number;
  fileCount: number;
}

export interface StorageStats {
  quotaBytes: number;
  totalBytes: number;
  totalFiles: number;
  byEntityType: StorageStatsByEntityType[];
  byUser: StorageStatsByUser[];
}

export function useStorageStats() {
  return useQuery<StorageStats>({
    queryKey: ['storage-stats'],
    queryFn: () => apiClient.get<StorageStats>('/documents/storage-stats'),
  });
}
