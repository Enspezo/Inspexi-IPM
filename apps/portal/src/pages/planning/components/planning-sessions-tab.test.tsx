import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmProvider, ToastProvider } from '@/components/ui';
import { ApiClientError } from '@/lib/api-client';
import { planningKeys } from '@/lib/query-keys';
import { SessionStatus, type PlanningSession } from '@/types';
import { SessionsTab } from './planning-sessions-tab';
import {
  useAcceptSession,
  useAssignSessionInspectors,
  useCancelSession,
  useCompleteSession,
  useConfirmSession,
  useUpdatePlanningSession,
} from '../hooks/use-planning-sessions';
import { useAssignInspectors } from '../hooks/use-planning';
import { useSelectableUsers } from '@/pages/users/hooks/use-users';
import { useResolvedAvailability } from '@/pages/availability/hooks/use-availability';

// B-310 (WP-B8): de sessietab moet per sessie een "Inspecteurs toewijzen"-actie
// bieden (hergebruik van de bestaande toewijzingsmodal incl. de 409/override-
// dialoog) en de Bevestigen-dead-end bij NOG_TE_PLANNEN zichtbaar uitleggen.

const { apiPost } = vi.hoisted(() => ({ apiPost: vi.fn() }));

vi.mock('../hooks/use-planning-sessions', () => ({
  useUpdatePlanningSession: vi.fn(),
  useCancelSession: vi.fn(),
  useAcceptSession: vi.fn(),
  useConfirmSession: vi.fn(),
  useCompleteSession: vi.fn(),
  useAssignSessionInspectors: vi.fn(),
}));
vi.mock('../hooks/use-planning', () => ({
  useAssignInspectors: vi.fn(),
}));
vi.mock('@/pages/users/hooks/use-users', () => ({
  useSelectableUsers: vi.fn(),
}));
vi.mock('@/pages/availability/hooks/use-availability', () => ({
  useResolvedAvailability: vi.fn(),
}));
// Alleen `apiClient` stubben (voor de echte-hook-test); ApiClientError e.d.
// blijven de echte implementatie zodat instanceof-checks kloppen.
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiClient: { post: apiPost } };
});

const session = (over: Partial<PlanningSession> = {}): PlanningSession => ({
  id: 's1',
  planningItemId: 'p1',
  sessionNumber: 1,
  scheduledDate: '2026-08-03T09:00:00.000Z',
  durationHours: 8,
  status: SessionStatus.NOG_TE_PLANNEN,
  isDefinitief: false,
  confirmedAt: null,
  notes: null,
  isCancelled: false,
  replacedById: null,
  replacesId: null,
  originalDate: null,
  createdAt: '2026-07-01T08:00:00.000Z',
  updatedAt: '2026-07-01T08:00:00.000Z',
  sessionInspectors: [],
  ...over,
});

const assignMutateAsync = vi.fn();
const confirmMutateAsync = vi.fn();

const mkMutation = (mutateAsync = vi.fn().mockResolvedValue(undefined)) =>
  ({ mutateAsync, isPending: false }) as never;

function renderTab(sessions: PlanningSession[], over: { userCanWrite?: boolean } = {}) {
  return render(
    <ToastProvider>
      <ConfirmProvider>
        <SessionsTab
          sessions={sessions}
          userId="u-me"
          userCanWrite={over.userCanWrite ?? true}
          onOpenReject={() => {}}
          onOpenReschedule={() => {}}
          onAddSession={() => {}}
          isAddingSession={false}
          planningItemId="p1"
        />
      </ConfirmProvider>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  assignMutateAsync.mockResolvedValue({});
  confirmMutateAsync.mockResolvedValue(undefined);
  vi.mocked(useUpdatePlanningSession).mockReturnValue(mkMutation());
  vi.mocked(useCancelSession).mockReturnValue(mkMutation());
  vi.mocked(useAcceptSession).mockReturnValue(mkMutation());
  vi.mocked(useConfirmSession).mockReturnValue(mkMutation(confirmMutateAsync));
  vi.mocked(useCompleteSession).mockReturnValue(mkMutation());
  vi.mocked(useAssignSessionInspectors).mockReturnValue(mkMutation(assignMutateAsync));
  vi.mocked(useAssignInspectors).mockReturnValue(mkMutation());
  vi.mocked(useSelectableUsers).mockReturnValue({
    data: [
      {
        id: 'insp-1',
        firstName: 'Ineke',
        lastName: 'Inspecteur',
        email: 'ineke@example.test',
        roles: [],
      },
    ],
    isLoading: false,
  } as never);
  vi.mocked(useResolvedAvailability).mockReturnValue({ data: [] } as never);
});

describe('SessionsTab — inspecteurs toewijzen (B-310)', () => {
  it('toont per sessie zonder inspecteur de actie "Inspecteurs toewijzen"', () => {
    renderTab([session()]);
    expect(screen.getByRole('button', { name: 'Inspecteurs toewijzen' })).toBeInTheDocument();
  });

  it('verbergt de toewijzen-actie bij DEFINITIEF en zonder schrijfrechten', () => {
    renderTab([session({ status: SessionStatus.DEFINITIEF })]);
    expect(screen.queryByRole('button', { name: 'Inspecteurs toewijzen' })).not.toBeInTheDocument();

    renderTab([session()], { userCanWrite: false });
    expect(screen.queryByRole('button', { name: 'Inspecteurs toewijzen' })).not.toBeInTheDocument();
  });

  it('wijst via de modal inspecteurs toe aan de sessie en sluit daarna', async () => {
    renderTab([session()]);
    fireEvent.click(screen.getByRole('button', { name: 'Inspecteurs toewijzen' }));

    // Modal open → de sessie-variant van de assign-hook is aan p1/s1 gebonden.
    expect(vi.mocked(useAssignSessionInspectors)).toHaveBeenCalledWith('p1', 's1');

    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Toewijzen' }));

    await waitFor(() =>
      expect(assignMutateAsync).toHaveBeenCalledWith({
        inspectorIds: ['insp-1'],
        primaryInspectorId: 'insp-1',
      }),
    );
    // Succes → modal dicht (checkbox weg) — de lijst ververst via de hook-invalidatie.
    await waitFor(() => expect(screen.queryByRole('checkbox')).not.toBeInTheDocument());
  });

  it('invalideert detail- én lijstquery na een succesvolle assign (echte hook)', async () => {
    const real = await vi.importActual<typeof import('../hooks/use-planning-sessions')>(
      '../hooks/use-planning-sessions',
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    apiPost.mockResolvedValue(session({ status: SessionStatus.CONCEPT }));

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => real.useAssignSessionInspectors('p1', 's1'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ inspectorIds: ['insp-1'] });
    });

    expect(apiPost).toHaveBeenCalledWith('/planning/p1/sessions/s1/assign', {
      inspectorIds: ['insp-1'],
    });
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: planningKeys.detail('p1') });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: planningKeys.all });
    });
  });

  it('opent de override-dialoog bij een 409 met warnings en stuurt daarna de override', async () => {
    assignMutateAsync
      .mockRejectedValueOnce(
        new ApiClientError({
          message: 'Niet alle inspecteurs zijn beschikbaar',
          statusCode: 409,
          warnings: [
            {
              userId: 'insp-1',
              name: 'Ineke Inspecteur',
              date: '2026-08-03',
              reason: 'Verlof — hele dag geblokkeerd',
            },
          ],
        }),
      )
      .mockResolvedValueOnce({});

    renderTab([session()]);
    fireEvent.click(screen.getByRole('button', { name: 'Inspecteurs toewijzen' }));
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Toewijzen' }));

    // 409 + warnings → useAvailabilityOverride opent de confirm-dialoog.
    expect(
      await screen.findByRole('heading', { name: 'Beschikbaarheidswaarschuwing' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ineke Inspecteur is niet beschikbaar op/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toch inplannen' }));

    await waitFor(() => expect(assignMutateAsync).toHaveBeenCalledTimes(2));
    expect(assignMutateAsync).toHaveBeenLastCalledWith({
      inspectorIds: ['insp-1'],
      primaryInspectorId: 'insp-1',
      overrideAvailabilityWarnings: true,
    });
  });
});

describe('SessionsTab — Bevestigen-dead-end (B-310)', () => {
  it('toont bij NOG_TE_PLANNEN een uitgeschakelde Bevestigen-knop met uitleg-tooltip', () => {
    renderTab([session()]); // datum gezet, nog geen inspecteurs
    const btn = screen.getByRole('button', { name: 'Bevestigen' });
    expect(btn).toBeDisabled();
    expect(
      screen.getByTitle('Wijs eerst een inspecteur toe om deze sessie te kunnen bevestigen'),
    ).toBeInTheDocument();
  });

  it('legt in de tooltip uit dat datum én inspecteur nog ontbreken', () => {
    renderTab([session({ scheduledDate: null })]);
    expect(screen.getByTitle('Wijs eerst een inspecteur toe en kies een datum')).toBeInTheDocument();
  });

  it('Bevestigen is actief bij CONCEPT en roept de confirm-mutatie aan', async () => {
    renderTab([session({ status: SessionStatus.CONCEPT })]);
    const btn = screen.getByRole('button', { name: 'Bevestigen' });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await waitFor(() => expect(confirmMutateAsync).toHaveBeenCalled());
  });
});
