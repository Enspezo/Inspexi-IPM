import { getErrorMessage } from '@/lib/api-client';
import { useNavigate } from 'react-router-dom';
import { PlanningStatus } from '@/types';
import type { PlanningItem } from '@/types';
import { ActionMenu, useToast } from '@/components/ui';
import { PLANNING_STATUS, getStatusConfig } from '@/lib/status';
import { planningStatusLabel } from './planning-detail-shared';
import {
  useAcceptPlanningItem,
  useCompletePlanningItem,
  useSendConfirmation,
} from '../hooks/use-planning';

export function PlanningDetailHeader({
  id,
  item,
  definitiefCount,
  totalActiveCount,
  canActAsInspector,
  canReschedule,
  userCanWrite,
  setRejectOpen,
  setRescheduleOpen,
  setIsTaskOpen,
}: {
  id: string;
  item: PlanningItem;
  definitiefCount: number;
  totalActiveCount: number;
  canActAsInspector: boolean;
  canReschedule: boolean;
  userCanWrite: boolean;
  setRejectOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRescheduleOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsTaskOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const complete = useCompletePlanningItem(id);
  const sendConfirmation = useSendConfirmation(id);
  const accept = useAcceptPlanningItem(id);

  const handleComplete = async () => {
    try {
      await complete.mutateAsync(undefined);
      showToast('Afspraak afgerond', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleSendConfirmation = async () => {
    try {
      await sendConfirmation.mutateAsync(undefined);
      showToast('Bevestiging verstuurd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleAccept = async () => {
    try {
      await accept.mutateAsync(undefined);
      showToast('Afspraak geaccepteerd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <div className="mb-6">
      <button
        onClick={() => navigate('/planning')}
        className="text-sm text-gray-500 hover:text-gray-700 mb-3 flex items-center gap-1"
      >
        ← Terug naar planning
      </button>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{item.productName}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusConfig(PLANNING_STATUS, item.status).classes}`}>
              {planningStatusLabel(item.status)}
            </span>
            {item.isMultiDay && (
              <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
                Meerdaags · {definitiefCount}/{totalActiveCount} definitief
              </span>
            )}
            {item.labels.map((l) => (
              <span key={l} className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {l}
              </span>
            ))}
            {item.project && (
              <button
                onClick={() => navigate(`/projects/${item.project!.id}`)}
                className="inline-flex items-center rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-700 hover:bg-primary-200"
              >
                {item.project.projectNumber}
              </button>
            )}
          </div>
        </div>
        <ActionMenu
          primaryActions={[
            ...(canActAsInspector ? [
              {
                label: 'Accepteren',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
                onClick: handleAccept,
                disabled: accept.isPending,
              },
              {
                label: 'Weigeren',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
                onClick: () => setRejectOpen(true),
                variant: 'danger' as const,
              },
            ] : []),
            ...(userCanWrite && !item.isCancelled && item.status !== PlanningStatus.AFGEROND ? [
              {
                label: 'Afronden',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
                onClick: handleComplete,
                disabled: complete.isPending,
              },
              ...(canReschedule ? [{
                label: 'Verzetten',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
                onClick: () => setRescheduleOpen(true),
              }] : []),
              ...(item.status === PlanningStatus.GEPLAND ? [{
                label: 'Bevestiging sturen',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
                onClick: handleSendConfirmation,
                disabled: sendConfirmation.isPending,
              }] : []),
            ] : []),
          ]}
          secondaryActions={[
            {
              label: 'Taak aanmaken',
              icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
              onClick: () => setIsTaskOpen(true),
            },
          ]}
        />
      </div>
    </div>
  );
}
