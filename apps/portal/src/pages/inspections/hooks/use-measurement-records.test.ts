import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAssetMeasurementRecords } from './use-measurement-records';

// Regressietest (na WP-D2-verificatie): de query-DTO van het endpoint accepteert
// sinds de AssetNode-rewiring (Fase 2b) alleen `assetNodeId`; een hook die nog
// `assetId` stuurt krijgt door forbidNonWhitelisted een 400 ("Onbekend veld")
// en de staf-meetstaatlijst blijft dan onterecht leeg.

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: apiGet },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

describe('useAssetMeasurementRecords', () => {
  beforeEach(() => {
    apiGet.mockReset();
  });

  it('bevraagt het endpoint met assetNodeId (niet het oude assetId)', async () => {
    apiGet.mockResolvedValue([]);

    renderHook(() => useAssetMeasurementRecords('node-123'), { wrapper });

    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));
    const url = apiGet.mock.calls[0][0] as string;
    expect(url).toBe('/measurement-sheet-records?assetNodeId=node-123');
    expect(url).not.toContain('assetId=node');
  });

  it('doet geen request zonder id', () => {
    renderHook(() => useAssetMeasurementRecords(undefined), { wrapper });
    expect(apiGet).not.toHaveBeenCalled();
  });
});
