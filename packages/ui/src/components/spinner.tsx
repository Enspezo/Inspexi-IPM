import { clsx } from 'clsx';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-3',
};

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      className={clsx(
        'animate-spin rounded-full border-primary-200 border-t-primary-600',
        sizeClasses[size],
        className,
      )}
      role="status"
      aria-label="Laden..."
    >
      <span className="sr-only">Laden...</span>
    </div>
  );
}
