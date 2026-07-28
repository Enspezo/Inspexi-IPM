import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import {
  clientDashboardKeys,
  clientInspectionKeys,
  clientInspectionDetailKeys,
  clientInspectionDocumentKeys,
  clientInspectionFindingKeys,
} from '@/lib/query-keys';
import type {
  DashboardData,
  InspectionListItem,
  InspectionDetail,
  InspectionDocumentListItem,
  Finding,
} from '@/types';

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: clientDashboardKeys.all,
    queryFn: () => apiClient.get<DashboardData>('/client/inspections/dashboard'),
  });
}

export function useInspections() {
  return useQuery<InspectionListItem[]>({
    queryKey: clientInspectionKeys.all,
    queryFn: () => apiClient.get<InspectionListItem[]>('/client/inspections'),
  });
}

export function useInspection(id: string | undefined) {
  return useQuery<InspectionDetail>({
    queryKey: clientInspectionDetailKeys.detail(id as string),
    queryFn: () => apiClient.get<InspectionDetail>(`/client/inspections/${id}`),
    enabled: !!id,
  });
}

export function useInspectionDocuments(id: string | undefined) {
  return useQuery<InspectionDocumentListItem[]>({
    queryKey: clientInspectionDocumentKeys.byInspection(id as string),
    queryFn: () => apiClient.get<InspectionDocumentListItem[]>(`/client/inspections/${id}/documents`),
    enabled: !!id,
  });
}

export function useInspectionFindings(id: string | undefined) {
  return useQuery<Finding[]>({
    queryKey: clientInspectionFindingKeys.byInspection(id as string),
    queryFn: () => apiClient.get<Finding[]>(`/client/inspections/${id}/findings`),
    enabled: !!id,
  });
}
