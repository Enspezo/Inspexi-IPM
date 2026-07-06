/**
 * Hooks voor de geünificeerde AssetNode-boom (Fase 2-endpoints; compat-wrappers
 * blijven bestaan, dus dit kan incrementeel gebruikt worden).
 *
 *   GET    /locations/:locationId/tree                       → boom van een CRM-locatie
 *   GET    /inspection-plans/:planId/tree                    → planboom (met inScope-vlag)
 *   POST   /asset-nodes                                      → node aanmaken (root/kind)
 *   POST   /inspection-plans/:planId/asset-nodes             → asset onder een plan (server kiest default-parent)
 *   PATCH  /asset-nodes/:id                                  → node-inhoud bijwerken
 *   POST   /asset-nodes/:id/move                             → node verplaatsen (zelfde boom)
 *   DELETE /asset-nodes/:id                                  → node + subtree soft-deleten
 *   GET    /inspection-plans/:id/scope-locations            → scope-locaties (isPrimary)
 *   POST   /inspection-plans/:id/scope-locations/:assetNodeId
 *   DELETE /inspection-plans/:id/scope-locations/:assetNodeId
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { apiClient } from '@/lib/api-client';
import { assetTreeKeys, planTreeKeys, scopeLocationKeys } from '@/lib/query-keys';
import type { AssetNode, AssetNodeType, InspectionPlanLocation } from '@/types';

// ── Bomen lezen ──

/** Volledige AssetNode-boom van een CRM-locatie (auto-creëert de root-node). */
export function useAssetTree(locationId: string | undefined) {
  return useQuery<AssetNode[]>({
    queryKey: assetTreeKeys.byLocation(locationId ?? ''),
    queryFn: () => apiClient.get<AssetNode[]>(`/locations/${locationId}/tree`),
    enabled: !!locationId,
  });
}

/** Boom van een inspectieplan; LOCATION-nodes dragen een `inScope`-vlag. */
export function usePlanTree(planId: string | undefined) {
  return useQuery<AssetNode[]>({
    queryKey: planTreeKeys.byPlan(planId ?? ''),
    queryFn: () => apiClient.get<AssetNode[]>(`/inspection-plans/${planId}/tree`),
    enabled: !!planId,
  });
}

// ── Mutaties ──

export interface CreateAssetNodeInput {
  parentId?: string | null;
  nodeType: AssetNodeType;
  typeCode: string;
  name: string;
  identifier?: string | null;
  description?: string | null;
  technicalData?: Record<string, unknown>;
  notes?: string | null;
  sortOrder?: number;
  /** Verplicht voor een root-node (parentId null) bij het rechtstreekse endpoint. */
  rootLocationId?: string;
}

/** Invalideer beide boom-caches; een wijziging kan elke boom raken. */
function useInvalidateTrees() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: assetTreeKeys.all });
    qc.invalidateQueries({ queryKey: planTreeKeys.all });
  };
}

/**
 * Maak een node aan. Met `planId` gaat het via het plan-endpoint (de server kiest
 * de default-parent als `parentId` ontbreekt); zonder `planId` via /asset-nodes.
 */
export function useCreateAssetNode() {
  const invalidate = useInvalidateTrees();
  return useApiMutation({
    mutationFn: ({ planId, data }: { planId?: string; data: CreateAssetNodeInput }) =>
      planId
        ? apiClient.post<AssetNode>(`/inspection-plans/${planId}/asset-nodes`, data)
        : apiClient.post<AssetNode>('/asset-nodes', data),
    onSuccess: invalidate,
  });
}

export interface UpdateAssetNodeInput {
  name?: string;
  identifier?: string | null;
  description?: string | null;
  statusCode?: string;
  technicalData?: Record<string, unknown>;
  notes?: string | null;
  sortOrder?: number;
}

export function useUpdateAssetNode() {
  const invalidate = useInvalidateTrees();
  return useApiMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAssetNodeInput }) =>
      apiClient.patch<AssetNode>(`/asset-nodes/${id}`, data),
    onSuccess: invalidate,
  });
}

export function useMoveAssetNode() {
  const invalidate = useInvalidateTrees();
  return useApiMutation({
    mutationFn: ({ id, newParentId, sortOrder }: { id: string; newParentId: string; sortOrder?: number }) =>
      apiClient.post<AssetNode>(`/asset-nodes/${id}/move`, { newParentId, sortOrder }),
    onSuccess: invalidate,
  });
}

export function useDeleteAssetNode() {
  const invalidate = useInvalidateTrees();
  return useApiMutation({
    mutationFn: (id: string) => apiClient.delete<{ deleted: boolean; affected: number }>(`/asset-nodes/${id}`),
    onSuccess: invalidate,
  });
}

// ── Scope-locaties van een inspectieplan ──

/**
 * Beheer van de scope-locaties (welke LOCATION-nodes vallen binnen het plan).
 * Geeft de lijst plus `add`/`remove`-mutaties terug. De server stuurt na elke
 * mutatie de bijgewerkte lijst terug, dus die zetten we direct in de cache.
 */
export function useScopeLocations(planId: string | undefined) {
  const qc = useQueryClient();
  const key = scopeLocationKeys.byPlan(planId as string);

  const query = useQuery<InspectionPlanLocation[]>({
    queryKey: key,
    queryFn: () => apiClient.get<InspectionPlanLocation[]>(`/inspection-plans/${planId}/scope-locations`),
    enabled: !!planId,
  });

  const add = useApiMutation({
    mutationFn: (assetNodeId: string) =>
      apiClient.post<InspectionPlanLocation[]>(`/inspection-plans/${planId}/scope-locations/${assetNodeId}`),
    onSuccess: (data) => {
      qc.setQueryData(key, data);
      qc.invalidateQueries({ queryKey: planTreeKeys.byPlan(planId ?? '') });
    },
  });

  const remove = useApiMutation({
    mutationFn: (assetNodeId: string) =>
      apiClient.delete<InspectionPlanLocation[]>(`/inspection-plans/${planId}/scope-locations/${assetNodeId}`),
    onSuccess: (data) => {
      qc.setQueryData(key, data);
      qc.invalidateQueries({ queryKey: planTreeKeys.byPlan(planId ?? '') });
    },
  });

  return {
    scopeLocations: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    add,
    remove,
  };
}
