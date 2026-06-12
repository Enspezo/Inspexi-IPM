import { useEffect, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { apiClient } from '@/lib/api-client';
import { Card, Button, useToast, useConfirm } from '@/components/ui';

// ─── Inspector Color & iCal Card ──────────────────────────

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899',
  '#14B8A6', '#6366F1', '#F43F5E', '#84CC16',
];

export function InspectorCard() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [color, setColor] = useState(user?.color || '#3B82F6');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    if (user?.color) setColor(user.color);
  }, [user?.color]);

  const handleSaveColor = async () => {
    setSaving(true);
    try {
      await apiClient.patch(`/users/${user!.id}/color`, { color });
      refreshUser();
      showToast('Kleur opgeslagen', 'success');
    } catch {
      showToast('Opslaan mislukt', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRotateIcalToken = async () => {
    const confirmed = await confirm({
      title: 'iCal-token vernieuwen',
      message:
        'De huidige feed-URL wordt direct ongeldig. Agenda-apps die de oude URL gebruiken ontvangen geen afspraken meer en moeten opnieuw gekoppeld worden.',
      confirmLabel: 'Vernieuwen',
    });
    if (!confirmed) return;

    setRotating(true);
    try {
      await apiClient.post('/users/me/rotate-ical-token', {});
      await refreshUser();
      showToast('iCal-token vernieuwd — koppel uw agenda-app opnieuw', 'success');
    } catch {
      showToast('Vernieuwen mislukt', 'error');
    } finally {
      setRotating(false);
    }
  };

  const handleCopyIcal = () => {
    const icalUrl = `${window.location.origin}/api/v1/ical/${user?.icalToken}.ics`;
    navigator.clipboard.writeText(icalUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Card title="Inspecteur-instellingen">
      <div className="space-y-6">
        {/* Color picker */}
        <div>
          <p className="mb-3 text-sm font-medium text-gray-700">Kleur in planning</p>
          <p className="mb-3 text-xs text-gray-500">
            Deze kleur wordt gebruikt om u te onderscheiden in de planningsoverzichten.
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full border-2 transition-all ${
                  color === c ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-8 w-8 cursor-pointer rounded-full border-2 border-gray-300 p-0.5"
              title="Aangepaste kleur"
            />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: color }}
            >
              {user?.initials || `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`}
            </div>
            <span className="text-sm text-gray-500">Zo ziet uw avatar eruit in de planning</span>
          </div>
          <div className="mt-4">
            <Button size="sm" onClick={handleSaveColor} isLoading={saving}>
              Kleur opslaan
            </Button>
          </div>
        </div>

        {/* iCal feed */}
        <div className="border-t border-gray-200 pt-6">
          <p className="mb-2 text-sm font-medium text-gray-700">Persoonlijke agendafeed (iCal)</p>
          <p className="mb-3 text-xs text-gray-500">
            Abonneer u op uw afspraken vanuit elke agenda-app (Google Calendar, Outlook, Apple Calendar, etc.).
            De URL is persoonlijk en beveiligd — deel deze niet.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-700">
              {`${window.location.origin}/api/v1/ical/${user?.icalToken}.ics`}
            </code>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleCopyIcal}
            >
              {copied ? 'Gekopieerd!' : 'Kopieer'}
            </Button>
          </div>
          <div className="mt-3">
            <Button size="sm" variant="danger" onClick={handleRotateIcalToken} isLoading={rotating}>
              Token vernieuwen
            </Button>
            <p className="mt-2 text-xs text-gray-500">
              Is de URL gelekt? Vernieuw het token — de oude feed-URL werkt dan direct niet meer.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
