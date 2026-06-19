import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  DashboardData,
  InspectionListItem,
  InspectionDetail,
  GeneratedDocumentSummary,
  Finding,
} from '@/types';

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ['client-dashboard'],
    queryFn: () => apiClient.get<DashboardData>('/client/inspections/dashboard'),
  });
}

export function useInspections() {
  return useQuery<InspectionListItem[]>({
    queryKey: ['client-inspections'],
    queryFn: () => apiClient.get<InspectionListItem[]>('/client/inspections'),
  });
}

export function useInspection(id: string | undefined) {
  return useQuery<InspectionDetail>({
    queryKey: ['client-inspection', id],
    queryFn: () => apiClient.get<InspectionDetail>(`/client/inspections/${id}`),
    enabled: !!id,
  });
}

export function useInspectionDocuments(id: string | undefined) {
  return useQuery<GeneratedDocumentSummary[]>({
    queryKey: ['client-inspection-documents', id],
    queryFn: () => apiClient.get<GeneratedDocumentSummary[]>(`/client/inspections/${id}/documents`),
    enabled: !!id,
  });
}

export function useInspectionFindings(id: string | undefined) {
  return useQuery<Finding[]>({
    queryKey: ['client-inspection-findings', id],
    queryFn: () => apiClient.get<Finding[]>(`/client/inspections/${id}/findings`),
    enabled: !!id,
  });
}
