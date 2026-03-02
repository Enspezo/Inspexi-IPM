import { useState, useRef, useEffect, type ReactNode } from 'react';

export interface ActionMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  variant?: 'danger';
}

interface ActionMenuProps {
  /** View-specific actions — primary color, shown at top */
  primaryActions?: ActionMenuItem[];
  /** General actions (e.g. Taak aanmaken, Bewerken) — grey, shown at bottom */
  secondaryActions?: ActionMenuItem[];
}

export function ActionMenu({ primaryActions = [], secondaryActions = [] }: ActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const allActions = [...primaryActions, ...secondaryActions];
  if (allActions.length === 0) return null;

  const handleMouseEnter = () => {
    clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setIsOpen(false), 150);
  };

  // Close on click outside (for touch devices)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  return (
    <div
      ref={menuRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* + icon trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-600 transition-colors hover:bg-primary-50"
        title="Acties"
      >
        <svg
          className={`h-6 w-6 transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Dropdown */}
      <div
        className={`absolute right-0 top-full z-30 mt-1 min-w-[200px] origin-top-right overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg transition-all duration-200 ${
          isOpen
            ? 'scale-100 opacity-100'
            : 'pointer-events-none scale-95 opacity-0'
        }`}
      >
        {/* Primary actions (view-specific) — primary color */}
        {primaryActions.length > 0 && (
          <div className="py-1">
            {primaryActions.map((action, i) => (
              <ActionButton key={i} action={action} variant="primary" onClose={() => setIsOpen(false)} />
            ))}
          </div>
        )}

        {/* Divider between groups */}
        {primaryActions.length > 0 && secondaryActions.length > 0 && (
          <div className="border-t border-gray-100" />
        )}

        {/* Secondary actions (general) — grey */}
        {secondaryActions.length > 0 && (
          <div className="py-1">
            {secondaryActions.map((action, i) => (
              <ActionButton key={i} action={action} variant="secondary" onClose={() => setIsOpen(false)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  action,
  variant,
  onClose,
}: {
  action: ActionMenuItem;
  variant: 'primary' | 'secondary';
  onClose: () => void;
}) {
  const handleClick = () => {
    if (action.disabled || action.isLoading) return;
    action.onClick();
    onClose();
  };

  const colorClasses =
    action.variant === 'danger'
      ? 'text-danger-600 hover:bg-danger-50'
      : variant === 'primary'
        ? 'text-primary-700 hover:bg-primary-50'
        : 'text-gray-700 hover:bg-gray-50';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={action.disabled || action.isLoading}
      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium transition-colors disabled:opacity-50 ${colorClasses}`}
    >
      {action.isLoading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : action.icon ? (
        <span className="flex h-4 w-4 items-center justify-center">{action.icon}</span>
      ) : null}
      {action.label}
    </button>
  );
}
