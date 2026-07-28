import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { dashboardStatsKeys } from '@/lib/query-keys';

/**
 * B-001: KPI-tellingen voor de dashboard-tegels. Inspectiedomein-tellingen
 * zijn `null` wanneer de org het BASIS_INSPECTIES-entitlement mist (de
 * bijbehorende tegels worden dan verborgen, zelfde gating als de sidebar).
 */
export interface StaffDashboardStats {
  activeInspections: number | null;
  activeUsers: number;
  reports: number | null;
}

export function useDashboardStats() {
  return useQuery<StaffDashboardStats>({
    queryKey: dashboardStatsKeys.all,
    queryFn: () => apiClient.get<StaffDashboardStats>('/portal/stats/staff-dashboard'),
    staleTime: 60 * 1000,
  });
}
