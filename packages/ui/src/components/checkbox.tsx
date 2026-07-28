import { forwardRef, type InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className, id, disabled, ...props }, ref) => {
    const checkboxId = id || (label ? `cb-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
      <label
        htmlFor={checkboxId}
        className={clsx(
          'inline-flex items-center gap-2 text-sm',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        )}
      >
        <input
          ref={ref}
          id={checkboxId}
          type="checkbox"
          disabled={disabled}
          className={clsx(
            'h-4 w-4 rounded border-gray-300 text-primary-600',
            'focus:ring-2 focus:ring-primary-500/20 focus:ring-offset-0',
            'disabled:cursor-not-allowed',
            className,
          )}
          {...props}
        />
        {label && <span className="text-gray-700">{label}</span>}
      </label>
    );
  },
);

Checkbox.displayName = 'Checkbox';
