import { useId, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';

export interface AccordionSectionProps {
  /** Header content (links). Bv. titel + telling. */
  title: ReactNode;
  /** Optionele content rechts in de header (bv. groeps-toggles). */
  headerActions?: ReactNode;
  /** Of de sectie standaard open is. */
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Toegankelijke, in-/uitklapbare accordion-sectie. Meerdere secties mogen
 * tegelijk open staan (elke sectie beheert zijn eigen state). De header is een
 * <button> met aria-expanded en aria-controls; de content krijgt role="region".
 *
 * `headerActions` staat buiten de toggle-button zodat interactieve controls
 * (zoals groeps-toggles) niet de open/dicht-klik triggeren.
 */
export function AccordionSection({
  title,
  headerActions,
  defaultOpen = false,
  children,
  className,
}: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  const headerId = useId();

  return (
    <div
      className={clsx(
        'overflow-hidden rounded-lg border border-gray-200',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 bg-gray-50 px-4 py-3">
        <button
          type="button"
          id={headerId}
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left text-sm font-medium text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1"
        >
          <svg
            className={clsx(
              'h-4 w-4 shrink-0 text-gray-400 transition-transform',
              open && 'rotate-90',
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          {title}
        </button>
        {headerActions && (
          <div className="flex shrink-0 items-center gap-3">{headerActions}</div>
        )}
      </div>
      {open && (
        <div
          id={contentId}
          role="region"
          aria-labelledby={headerId}
          className="border-t border-gray-200 px-4 py-3"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export interface AccordionProps {
  children: ReactNode;
  className?: string;
}

/** Container die meerdere AccordionSection-children verticaal stapelt. */
export function Accordion({ children, className }: AccordionProps) {
  return <div className={clsx('space-y-2', className)}>{children}</div>;
}
