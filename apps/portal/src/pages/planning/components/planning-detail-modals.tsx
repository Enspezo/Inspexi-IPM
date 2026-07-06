import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal, useToast } from '@/components/ui';
import { useReschedulePlanningItem, useRejectPlanningItem } from '../hooks/use-planning';
import { useRejectSession, useRescheduleSession } from '../hooks/use-planning-sessions';
import { getErrorMessage } from '@/lib/api-client';

export function PlanningRescheduleModal({
  id,
  rescheduleOpen,
  setRescheduleOpen,
}: {
  id: string;
  rescheduleOpen: boolean;
  setRescheduleOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [rescheduleReason, setRescheduleReason] = useState('');
  const reschedule = useReschedulePlanningItem(id);

  const handleReschedule = async () => {
    if (!rescheduleReason.trim()) return;
    try {
      const newItem = await reschedule.mutateAsync({ reason: rescheduleReason });
      setRescheduleOpen(false);
      setRescheduleReason('');
      showToast('Afspraak verplaatst. Nieuwe planregel aangemaakt.', 'success');
      navigate(`/planning/${(newItem as any).id}`);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal
      isOpen={rescheduleOpen}
      onClose={() => setRescheduleOpen(false)}
      title="Afspraak verzetten"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Hiermee wordt de huidige planregel als vervallen gemarkeerd en wordt er een nieuwe aangemaakt.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reden</label>
          <textarea
            value={rescheduleReason}
            onChange={(e) => setRescheduleReason(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Vul een reden in (verplicht)"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRescheduleOpen(false)}>Annuleren</Button>
          <Button onClick={handleReschedule} disabled={!rescheduleReason.trim() || reschedule.isPending}>
            Verzetten
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function PlanningRejectModal({
  id,
  rejectOpen,
  setRejectOpen,
}: {
  id: string;
  rejectOpen: boolean;
  setRejectOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { showToast } = useToast();
  const [rejectReason, setRejectReason] = useState('');
  const reject = useRejectPlanningItem(id);

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    try {
      await reject.mutateAsync({ reason: rejectReason });
      setRejectOpen(false);
      setRejectReason('');
      showToast('Afspraak geweigerd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal
      isOpen={rejectOpen}
      onClose={() => setRejectOpen(false)}
      title="Afspraak weigeren"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reden voor weigering</label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Vul een reden in (verplicht)"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRejectOpen(false)}>Annuleren</Button>
          <Button onClick={handleReject} disabled={!rejectReason.trim() || reject.isPending}>
            Weigeren
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function SessionRejectModal({
  id,
  activeSessionId,
  sessionRejectOpen,
  setSessionRejectOpen,
}: {
  id: string;
  activeSessionId: string | null;
  sessionRejectOpen: boolean;
  setSessionRejectOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { showToast } = useToast();
  const [sessionRejectReason, setSessionRejectReason] = useState('');
  const rejectSessionMut = useRejectSession(id, activeSessionId ?? '');

  const handleRejectSession = async () => {
    if (!sessionRejectReason.trim()) return;
    try {
      await rejectSessionMut.mutateAsync({ reason: sessionRejectReason });
      setSessionRejectOpen(false);
      setSessionRejectReason('');
      showToast('Sessie geweigerd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal
      isOpen={sessionRejectOpen}
      onClose={() => { setSessionRejectOpen(false); setSessionRejectReason(''); }}
      title="Sessie weigeren"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reden voor weigering</label>
          <textarea
            value={sessionRejectReason}
            onChange={(e) => setSessionRejectReason(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Vul een reden in (verplicht)"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setSessionRejectOpen(false); setSessionRejectReason(''); }}>Annuleren</Button>
          <Button onClick={() => void handleRejectSession()} disabled={!sessionRejectReason.trim() || rejectSessionMut.isPending}>
            Weigeren
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function SessionRescheduleModal({
  id,
  activeSessionId,
  sessionRescheduleOpen,
  setSessionRescheduleOpen,
}: {
  id: string;
  activeSessionId: string | null;
  sessionRescheduleOpen: boolean;
  setSessionRescheduleOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { showToast } = useToast();
  const [sessionRescheduleReason, setSessionRescheduleReason] = useState('');
  const rescheduleSessionMut = useRescheduleSession(id, activeSessionId ?? '');

  const handleRescheduleSession = async () => {
    if (!sessionRescheduleReason.trim()) return;
    try {
      await rescheduleSessionMut.mutateAsync({ reason: sessionRescheduleReason });
      setSessionRescheduleOpen(false);
      setSessionRescheduleReason('');
      showToast('Sessie verzet. Nieuwe sessie aangemaakt.', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal
      isOpen={sessionRescheduleOpen}
      onClose={() => { setSessionRescheduleOpen(false); setSessionRescheduleReason(''); }}
      title="Sessie verzetten"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Hiermee wordt de huidige sessie als vervallen gemarkeerd en wordt er een nieuwe sessie aangemaakt (nog te plannen).
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reden</label>
          <textarea
            value={sessionRescheduleReason}
            onChange={(e) => setSessionRescheduleReason(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Vul een reden in (verplicht)"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setSessionRescheduleOpen(false); setSessionRescheduleReason(''); }}>Annuleren</Button>
          <Button onClick={() => void handleRescheduleSession()} disabled={!sessionRescheduleReason.trim() || rescheduleSessionMut.isPending}>
            Verzetten
          </Button>
        </div>
      </div>
    </Modal>
  );
}
