import { Availability } from '@/types';
import { CHAT_PRESENCE, CHAT_PRESENCE_DOT, getStatusConfig } from '@/lib/status';

interface AvatarUser {
  firstName: string;
  lastName: string;
  initials: string | null;
  avatarUrl?: string | null;
  availability?: Availability | null;
}

export function PresenceDot({
  availability,
  className = '',
}: {
  availability?: Availability | null;
  className?: string;
}) {
  const dot = CHAT_PRESENCE_DOT[availability ?? Availability.OFFLINE] ?? 'bg-gray-300';
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${dot} ${className}`} />;
}

export function PresenceLabel({ availability }: { availability?: Availability | null }) {
  const cfg = getStatusConfig(CHAT_PRESENCE, availability ?? Availability.OFFLINE);
  return <span className="text-xs text-gray-500">{cfg.label}</span>;
}

function initialsOf(user: Pick<AvatarUser, 'firstName' | 'lastName' | 'initials'>): string {
  const fromName = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`;
  return (user.initials || fromName || '?').toUpperCase();
}

export function ChatAvatar({
  user,
  size = 'md',
  showPresence = true,
}: {
  user: AvatarUser | null;
  size?: 'sm' | 'md';
  showPresence?: boolean;
}) {
  const dim = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  return (
    <div className="relative shrink-0">
      <div
        className={`flex ${dim} items-center justify-center rounded-full bg-primary-100 font-medium text-primary-700`}
      >
        {user ? initialsOf(user) : '?'}
      </div>
      {showPresence && user?.availability && (
        <PresenceDot
          availability={user.availability}
          className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white"
        />
      )}
    </div>
  );
}

/** Ronde icoon-avatar voor team-threads. */
export function TeamAvatar({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  return (
    <div
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700`}
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a3 3 0 10-2.5-4.5"
        />
      </svg>
    </div>
  );
}
