import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui';
import { Availability } from '@/types';
import { CHAT_PRESENCE, getStatusConfig } from '@/lib/status';
import { usePresence, useUpdatePresence } from '@/pages/chat/hooks/use-chat';
import { PresenceDot } from './chat-avatar';

const OPTIONS: Availability[] = [
  Availability.BESCHIKBAAR,
  Availability.BEZIG,
  Availability.AFWEZIG,
  Availability.OFFLINE,
];

export function PresencePicker() {
  const { data: presence } = usePresence();
  const updatePresence = useUpdatePresence();
  const { showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const current = presence?.availability ?? Availability.BESCHIKBAAR;
  const currentCfg = getStatusConfig(CHAT_PRESENCE, current);

  useEffect(() => {
    setNote(presence?.availabilityNote ?? '');
  }, [presence?.availabilityNote]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function apply(availability: Availability, availabilityNote: string) {
    try {
      await updatePresence.mutateAsync({ availability, availabilityNote: availabilityNote || undefined });
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
        title="Mijn status"
      >
        <PresenceDot availability={current} />
        <span>{currentCfg.label}</span>
        <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          {OPTIONS.map((opt) => {
            const cfg = getStatusConfig(CHAT_PRESENCE, opt);
            return (
              <button
                key={opt}
                onClick={() => void apply(opt, note)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-50 ${
                  opt === current ? 'bg-gray-50 font-medium' : ''
                }`}
              >
                <PresenceDot availability={opt} />
                <span className="flex-1">{cfg.label}</span>
                {opt === current && (
                  <svg className="h-4 w-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
          <div className="mt-2 border-t border-gray-100 pt-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void apply(current, note);
              }}
              onBlur={() => {
                if ((presence?.availabilityNote ?? '') !== note) void apply(current, note);
              }}
              placeholder="Statusnotitie (optioneel)"
              maxLength={200}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/30"
            />
          </div>
        </div>
      )}
    </div>
  );
}
