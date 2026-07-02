import { useState, useRef, useEffect, type ReactNode, type ButtonHTMLAttributes } from 'react';

export interface ActionMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  /** Native tooltip, e.g. to explain why an action is disabled */
  title?: string;
  variant?: 'danger';
}

interface ActionMenuProps {
  /** Workflow actions — shown under chevron (>) trigger */
  primaryActions?: ActionMenuItem[];
  /** Create/add actions — shown under plus (+) trigger */
  secondaryActions?: ActionMenuItem[];
}

export function ActionMenu({ primaryActions = [], secondaryActions = [] }: ActionMenuProps) {
  const hasPrimary = primaryActions.length > 0;
  const hasSecondary = secondaryActions.length > 0;

  if (!hasPrimary && !hasSecondary) return null;

  return (
    <div className="flex items-center gap-0.5">
      {hasPrimary && (
        <ActionMenuTrigger
          actions={primaryActions}
          actionVariant="primary"
          icon="chevron"
          title="Acties"
        />
      )}
      {hasSecondary && (
        <ActionMenuTrigger
          actions={secondaryActions}
          actionVariant="secondary"
          icon="plus"
          title="Aanmaken"
        />
      )}
    </div>
  );
}

/**
 * Shared dropdown-menu behaviour: open/close, hover-open, click-outside, ESC,
 * and an accessible menu panel of {@link ActionMenuItem}s. Consumers supply
 * their own trigger via `renderTrigger` so the same dropdown can sit behind a
 * small icon button (ActionMenu) or a large prominent button (quick-create).
 */
export interface DropdownMenuProps {
  actions: ActionMenuItem[];
  actionVariant?: 'primary' | 'secondary';
  /** Horizontal alignment of the panel relative to the trigger. */
  align?: 'left' | 'right';
  /** Open the menu on hover (matches the legacy ActionMenu behaviour). */
  openOnHover?: boolean;
  menuClassName?: string;
  /**
   * Render the trigger button. Spread `buttonProps` onto a <button> so the
   * shared aria attributes and toggle handler stay consistent.
   */
  renderTrigger: (args: {
    isOpen: boolean;
    buttonProps: ButtonHTMLAttributes<HTMLButtonElement>;
  }) => ReactNode;
}

export function DropdownMenu({
  actions,
  actionVariant = 'secondary',
  align = 'right',
  openOnHover = true,
  menuClassName,
  renderTrigger,
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handleMouseEnter = () => {
    if (!openOnHover) return;
    clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (!openOnHover) return;
    timeoutRef.current = setTimeout(() => setIsOpen(false), 150);
  };

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        // Return focus to the trigger (first button within the wrapper).
        menuRef.current?.querySelector('button')?.focus();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  const buttonProps: ButtonHTMLAttributes<HTMLButtonElement> = {
    type: 'button',
    'aria-haspopup': 'menu',
    'aria-expanded': isOpen,
    onClick: () => setIsOpen((o) => !o),
  };

  return (
    <div
      ref={menuRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {renderTrigger({ isOpen, buttonProps })}

      <div
        role="menu"
        className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full z-30 mt-1 min-w-[200px] ${
          align === 'right' ? 'origin-top-right' : 'origin-top-left'
        } overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg transition-all duration-200 ${
          isOpen ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'
        } ${menuClassName ?? ''}`}
      >
        <div className="py-1">
          {actions.map((action, i) => (
            <ActionButton
              key={i}
              action={action}
              variant={actionVariant}
              onClose={() => setIsOpen(false)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ActionMenuTrigger({
  actions,
  actionVariant,
  icon,
  title,
}: {
  actions: ActionMenuItem[];
  actionVariant: 'primary' | 'secondary';
  icon: 'chevron' | 'plus';
  title: string;
}) {
  return (
    <DropdownMenu
      actions={actions}
      actionVariant={actionVariant}
      align="right"
      renderTrigger={({ isOpen, buttonProps }) => (
        <button
          {...buttonProps}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-primary-600 transition-colors hover:bg-primary-50"
          title={title}
        >
          {icon === 'chevron' ? (
            <svg
              className={`h-5 w-5 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          ) : (
            <svg
              className={`h-6 w-6 transition-transform duration-200 ${isOpen ? 'rotate-45' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          )}
        </button>
      )}
    />
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
      role="menuitem"
      onClick={handleClick}
      disabled={action.disabled || action.isLoading}
      title={action.title}
      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${colorClasses}`}
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
