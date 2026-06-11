import { clsx } from 'clsx';
import type { ReactNode } from 'react';

interface ErrorBoxProps {
  children: ReactNode;
  className?: string;
}

/** Uniforme foutmelding-box (rood vlak met danger-tekst). */
export function ErrorBox({ children, className }: ErrorBoxProps) {
  if (!children) return null;

  return (
    <div role="alert" className={clsx('rounded-lg bg-danger-50 p-4 text-sm text-danger-600', className)}>
      {children}
    </div>
  );
}
