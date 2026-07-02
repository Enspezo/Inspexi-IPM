import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/providers/auth-provider';
import { Badge } from '@/components/ui';
import {
  useUnreadCount,
  useRecentNotifications,
  useMarkRead,
} from '@/pages/notifications/hooks/use-notifications';
import { useTasks } from '@/pages/tasks/hooks/use-tasks';
import { SearchBox } from '@/components/search/search-box';
import { QuickCreateButton } from '@/components/layout/quick-create-button';
import { ChatButton } from '@/components/chat';
import { TaskStatus } from '@/types';
import type { Notification } from '@/types';
import { getNotificationRoute } from '@/lib/notifications';

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'zojuist';
  if (diffMin < 60) return `${diffMin} min geleden`;
  if (diffHour < 24) return `${diffHour} uur geleden`;
  if (diffDay < 7) return `${diffDay} dag${diffDay > 1 ? 'en' : ''} geleden`;
  return date.toLocaleDateString('nl-NL');
}

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const { data: unreadData } = useUnreadCount();
  const { data: recentData } = useRecentNotifications();
  const { data: myTasksData } = useTasks({ onlyMine: true, limit: 100 });
  const markRead = useMarkRead();

  const unreadCount = unreadData?.count ?? 0;
  const recentNotifications = recentData?.data ?? [];

  // Verlopen taken: deadline verstreken, niet voltooid
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const overdueTaskCount = (myTasksData?.data ?? []).filter(
    (t) =>
      t.status !== TaskStatus.VOLTOOID &&
      t.deadline &&
      new Date(t.deadline) < todayStart,
  ).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotifClick = (notif: Notification) => {
    if (!notif.isRead) {
      markRead.mutate(notif.id);
    }
    setIsNotifOpen(false);
    const route = getNotificationRoute(notif);
    if (route) navigate(route);
  };

  return (
    <header className="flex h-16 items-center border-b border-gray-200 bg-white px-6">
      {/* LEFT: global quick-create button — present on every view */}
      <div className="flex w-48 flex-shrink-0 items-center">
        <QuickCreateButton />
      </div>

      {/* CENTER: Search box */}
      <div className="flex flex-1 items-center justify-center">
        <SearchBox />
      </div>

      {/* RIGHT: actions */}
      <div className="flex w-48 flex-shrink-0 items-center justify-end gap-2">
        {/* Chat */}
        <ChatButton />

        {/* Notification bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => {
              setIsNotifOpen(!isNotifOpen);
              setIsDropdownOpen(false);
            }}
            className="relative rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {isNotifOpen && (
            <div
              className="absolute right-0 z-50 mt-2 w-96 rounded-xl border border-gray-200 bg-white shadow-lg"
              style={{ animation: 'fade-in 0.15s ease-out' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <p className="text-sm font-semibold text-gray-900">Notificaties</p>
                <Link
                  to="/notifications"
                  onClick={() => setIsNotifOpen(false)}
                  className="text-xs font-medium text-primary-600 hover:text-primary-800"
                >
                  Alles bekijken
                </Link>
              </div>

              {/* Pinned: verlopen taken */}
              {overdueTaskCount > 0 && (
                <Link
                  to="/tasks"
                  onClick={() => setIsNotifOpen(false)}
                  className="flex items-center gap-3 border-b border-orange-100 bg-orange-50 px-4 py-3 transition-colors hover:bg-orange-100"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100">
                    <svg className="h-4 w-4 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-orange-900">
                      {overdueTaskCount} verlopen {overdueTaskCount === 1 ? 'taak' : 'taken'}
                    </p>
                    <p className="text-xs text-orange-600">Klik om alle taken te bekijken</p>
                  </div>
                  <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
                    {overdueTaskCount}
                  </span>
                </Link>
              )}

              {/* Notification list */}
              <div className="max-h-96 overflow-y-auto">
                {recentNotifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">
                    Geen notificaties
                  </div>
                ) : (
                  recentNotifications.map((notif) => (
                    <button
                      key={notif.id}
                      onClick={() => handleNotifClick(notif)}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                        !notif.isRead ? 'border-l-2 border-l-primary-500 bg-primary-50/30' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm ${
                            !notif.isRead ? 'font-semibold text-gray-900' : 'text-gray-700'
                          }`}
                        >
                          {notif.title}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">{notif.body}</p>
                        <p className="mt-1 text-[10px] text-gray-400">
                          {formatRelativeTime(notif.createdAt)}
                        </p>
                      </div>
                      {!notif.isRead && (
                        <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-primary-500" />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => {
              setIsDropdownOpen(!isDropdownOpen);
              setIsNotifOpen(false);
            }}
            className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-gray-50"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary-700">
              {user?.firstName?.[0]}
              {user?.lastName?.[0]}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-sm font-medium text-gray-700">
                {user?.firstName} {user?.lastName}
              </p>
            </div>
            <svg
              className="h-4 w-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isDropdownOpen && (
            <div
              className="absolute right-0 mt-2 w-64 rounded-xl border border-gray-200 bg-white py-2 shadow-lg"
              style={{ animation: 'fade-in 0.15s ease-out' }}
            >
              {/* User info */}
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-sm font-medium text-gray-900">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-gray-500">{user?.email}</p>
                {user && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {user.roles.map((r) => (
                      <Badge key={r} role={r} />
                    ))}
                  </div>
                )}
              </div>

              {/* Menu items */}
              <div className="py-1">
                <Link
                  to="/profile"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Profiel
                </Link>
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Uitloggen
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
