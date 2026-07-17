import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastProvider } from '@/components/ui';
import { ApiClientError } from '@/lib/api-client';
import type { InspectionPlan } from '@/types';
import { OnlineRepairSection, buildRepairUrl } from './online-repair-section';
import { useSetOnlineRepairEnabled } from '../hooks/use-inspections';

vi.mock('../hooks/use-inspections', () => ({
  useSetOnlineRepairEnabled: vi.fn(),
}));

// jsdom draait op `localhost` (= base/superuser-domein); de URL-weergave is aan
// een org-subdomein gebonden (review #12) → default een org-tenant mocken.
vi.mock('@/lib/tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tenant')>()),
  getTenantInfo: vi.fn(() => ({ slug: 'inspexidemo', isBaseDomain: false })),
}));
import { getTenantInfo } from '@/lib/tenant';

const mutateAsync = vi.fn();

const plan = (over: Partial<InspectionPlan> = {}): InspectionPlan =>
  ({
    id: 'plan-1',
    referenceNumber: null,
    onlineRepairEnabled: false,
    ...over,
  }) as InspectionPlan;

function setup(planData: InspectionPlan, canWrite = true) {
  vi.mocked(useSetOnlineRepairEnabled).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as any);
  return render(
    <ToastProvider>
      <OnlineRepairSection plan={planData} canWrite={canWrite} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mutateAsync.mockResolvedValue({});
  vi.mocked(getTenantInfo).mockReturnValue({ slug: 'inspexidemo', isBaseDomain: false });
});

describe('OnlineRepairSection', () => {
  it('toont de 400-servermelding inline wanneer het rapportnummer ontbreekt', async () => {
    const message =
      'Online herstel vereist een uniek rapportnummer (referentienummer) — vul dit eerst in.';
    mutateAsync.mockRejectedValue(new ApiClientError({ message, statusCode: 400 }));

    setup(plan());
    fireEvent.click(
      screen.getByLabelText('Online herstel inschakelen voor deze inspectie'),
    );

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(mutateAsync).toHaveBeenCalledWith({ id: 'plan-1', enabled: true });
  });

  it('toont bij actief het rapportnummer en de kopieerbare herstel-URL', () => {
    setup(plan({ onlineRepairEnabled: true, referenceNumber: 'RAP-2026-001' }));

    expect(screen.getByText('RAP-2026-001')).toBeInTheDocument();
    expect(screen.getByText(buildRepairUrl())).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kopiëren' })).toBeInTheDocument();
  });

  it('verbergt het infoblok en wist een eerdere fout na succesvol togglen', async () => {
    setup(plan());

    fireEvent.click(
      screen.getByLabelText('Online herstel inschakelen voor deze inspectie'),
    );

    expect(mutateAsync).toHaveBeenCalledWith({ id: 'plan-1', enabled: true });
    expect(screen.queryByText(/Herstel-URL/)).not.toBeInTheDocument();
  });

  it('disabled de toggle zonder schrijfrechten', () => {
    setup(plan(), false);
    expect(
      screen.getByLabelText('Online herstel inschakelen voor deze inspectie'),
    ).toBeDisabled();
  });

  it('verbergt de herstel-URL op het beheerdomein (SUPERUSER) met een hint', () => {
    vi.mocked(getTenantInfo).mockReturnValue({ slug: null, isBaseDomain: true });
    setup(plan({ onlineRepairEnabled: true, referenceNumber: 'RAP-2026-001' }));

    expect(screen.queryByText(/Herstel-URL/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kopiëren' })).not.toBeInTheDocument();
    expect(
      screen.getByText(/alleen zichtbaar op het subdomein van de organisatie/),
    ).toBeInTheDocument();
  });
});
