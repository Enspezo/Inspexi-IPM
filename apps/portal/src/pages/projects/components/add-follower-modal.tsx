import { useState, useEffect } from 'react';
import { Button, Input, Select, Modal, Checkbox } from '@/components/ui';
import type { AddProjectFollowerData } from '../hooks/use-project-followers';
import { apiClient } from '@/lib/api-client';

// ─── Add Follower Modal ─────────────────────────────────────

export function AddFollowerModal({
  projectId,
  onClose,
  onAdd,
  isAdding,
}: {
  projectId: string;
  onClose: () => void;
  onAdd: (data: AddProjectFollowerData) => void;
  isAdding: boolean;
}) {
  const [mode, setMode] = useState<'user' | 'external'>('user');
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [users, setUsers] = useState<{ value: string; label: string }[]>([]);

  // Permission defaults for external followers
  const [canViewGeneral, setCanViewGeneral] = useState(true);
  const [canViewRequests, setCanViewRequests] = useState(false);
  const [canViewQuotes, setCanViewQuotes] = useState(true);
  const [canViewPlanning, setCanViewPlanning] = useState(true);
  const [canViewDocuments, setCanViewDocuments] = useState(false);

  useEffect(() => {
    apiClient
      .get<any[]>('/users')
      .then((res) => {
        const list = Array.isArray(res) ? res : (res as any).data ?? [];
        setUsers(
          list.map((u: any) => ({
            value: u.id,
            label: `${u.firstName} ${u.lastName}`,
          })),
        );
      })
      .catch(() => {});
  }, []);

  const handleSubmit = () => {
    if (mode === 'user' && userId) {
      onAdd({ userId });
    } else if (mode === 'external' && email) {
      onAdd({
        email,
        name: name || undefined,
        canViewGeneral,
        canViewRequests,
        canViewQuotes,
        canViewPlanning,
        canViewDocuments,
      });
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Volger toevoegen">
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button
            variant={mode === 'user' ? 'primary' : 'secondary'}
            onClick={() => setMode('user')}
          >
            Medewerker
          </Button>
          <Button
            variant={mode === 'external' ? 'primary' : 'secondary'}
            onClick={() => setMode('external')}
          >
            Extern
          </Button>
        </div>

        {mode === 'user' ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Medewerker
            </label>
            <Select
              options={[
                { value: '', label: 'Selecteer medewerker...' },
                ...users,
              ]}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                E-mailadres
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@voorbeeld.nl"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Naam
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Naam (optioneel)"
              />
            </div>

            {/* Permission checkboxes */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Zichtbare informatie
              </label>
              <div className="space-y-2">
                <Checkbox
                  label="Algemeen"
                  checked={canViewGeneral}
                  onChange={(e) => setCanViewGeneral(e.target.checked)}
                />
                <Checkbox
                  label="Aanvragen"
                  checked={canViewRequests}
                  onChange={(e) => setCanViewRequests(e.target.checked)}
                />
                <Checkbox
                  label="Offertes"
                  checked={canViewQuotes}
                  onChange={(e) => setCanViewQuotes(e.target.checked)}
                />
                <Checkbox
                  label="Planning"
                  checked={canViewPlanning}
                  onChange={(e) => setCanViewPlanning(e.target.checked)}
                />
                <Checkbox
                  label="Documenten (enkel gedeelde)"
                  checked={canViewDocuments}
                  onChange={(e) => setCanViewDocuments(e.target.checked)}
                />
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={isAdding}
            disabled={mode === 'user' ? !userId : !email}
          >
            Toevoegen
          </Button>
        </div>
      </div>
    </Modal>
  );
}
