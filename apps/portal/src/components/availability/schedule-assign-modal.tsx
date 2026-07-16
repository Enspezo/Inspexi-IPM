import { useEffect, useState } from 'react';
import { Button, ErrorBox, Modal, Select, Input, useToast } from '@/components/ui';
import {
  useAvailabilityTemplates,
  useAssignSchedule,
} from '@/pages/availability/hooks/use-availability';

interface ScheduleAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

/** Wijs een weekschema-template toe vanaf een ingangsdatum. */
export function ScheduleAssignModal({ isOpen, onClose, userId }: ScheduleAssignModalProps) {
  const { showToast } = useToast();
  const { data: templatesResp } = useAvailabilityTemplates({ limit: 100 });
  const assignMutation = useAssignSchedule(userId);

  const [templateId, setTemplateId] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [error, setError] = useState('');

  const templates = (templatesResp?.data ?? []).filter((t) => t.isActive && !t.isDeleted);

  useEffect(() => {
    if (isOpen) {
      setTemplateId('');
      setValidFrom('');
      setError('');
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    setError('');
    if (!templateId) {
      setError('Kies een template');
      return;
    }
    if (!validFrom) {
      setError('Kies een ingangsdatum');
      return;
    }
    try {
      await assignMutation.mutateAsync({ templateId, validFrom });
      showToast('Weekschema toegewezen', 'success');
      onClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const templateOptions = templates.map((t) => ({ value: t.id, label: t.name }));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Weekschema toewijzen">
      <div className="space-y-4">
        {error && <ErrorBox>{error}</ErrorBox>}

        {templates.length === 0 ? (
          <p className="text-sm text-gray-500">
            Er zijn nog geen actieve beschikbaarheidstemplates. Maak er eerst één aan onder
            Organisatie → Beschikbaarheid.
          </p>
        ) : (
          <>
            <Select
              label="Template"
              placeholder="Kies een weekschema"
              options={templateOptions}
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            />
            <Input
              label="Ingangsdatum"
              type="date"
              helperText="De lopende toewijzing wordt op deze datum afgesloten."
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
          </>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            isLoading={assignMutation.isPending}
            disabled={templates.length === 0}
          >
            Toewijzen
          </Button>
        </div>
      </div>
    </Modal>
  );
}
