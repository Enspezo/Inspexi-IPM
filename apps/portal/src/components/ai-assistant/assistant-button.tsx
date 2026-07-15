import { useAuth } from '@/providers/auth-provider';
import { useFeatures } from '@/providers/feature-provider';
import { useTenant } from '@/providers/tenant-provider';
import { useAiAgent } from '@/providers/ai-agent-provider';

/** Toont de AI-assistent-knop in de header wanneer de add-on beschikbaar is. */
export function useAiAgentAvailable(): boolean {
  const { user } = useAuth();
  const { hasFeature } = useFeatures();
  const { orgBranding } = useTenant();
  return (
    !!user?.orgId &&
    hasFeature('AI_AGENT') &&
    orgBranding?.aiAgentEnabled !== false
  );
}

export function AssistantButton() {
  const available = useAiAgentAvailable();
  const { toggle, isOpen } = useAiAgent();

  if (!available) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="AI-assistent"
      title="AI-assistent"
      className={`relative rounded-lg p-2 transition-colors ${
        isOpen ? 'bg-primary-50 text-primary-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
      }`}
    >
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 1.75l1.6 3.7 3.65.32-2.77 2.4.85 3.58L10 9.9 6.67 11.74l.85-3.58L4.75 5.77l3.65-.32L10 1.75z" />
        <path d="M15.5 12.5l.7 1.6 1.6.14-1.2 1.05.37 1.56-1.47-.82-1.47.82.37-1.56-1.2-1.05 1.6-.14.7-1.6z" />
      </svg>
    </button>
  );
}
