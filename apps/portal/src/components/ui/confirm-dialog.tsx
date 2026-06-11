import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Modal } from './modal';
import { Button } from './button';

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  /** Default: 'Bevestigen' */
  confirmLabel?: string;
  /** Default: 'Annuleren' */
  cancelLabel?: string;
  /** 'danger' (default) voor destructieve acties, 'primary' voor neutrale bevestiging */
  variant?: 'danger' | 'primary';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Promise-based vervanging van window.confirm().
 *
 * ```tsx
 * const confirm = useConfirm();
 * const handleDelete = async () => {
 *   if (!(await confirm({ title: 'Document verwijderen', message: 'Weet je het zeker?' }))) return;
 *   deleteDocument.mutate();
 * };
 * ```
 */
export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error('useConfirm moet binnen een ConfirmProvider gebruikt worden');
  }
  return confirm;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      // Een eventueel openstaande dialog wordt vervangen; die belofte lossen we op als geannuleerd
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const close = useCallback((confirmed: boolean) => {
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <Modal isOpen title={options.title} onClose={() => close(false)}>
          <div className="space-y-4">
            <div className="text-sm text-gray-700">{options.message}</div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => close(false)}>
                {options.cancelLabel ?? 'Annuleren'}
              </Button>
              <Button variant={options.variant ?? 'danger'} onClick={() => close(true)}>
                {options.confirmLabel ?? 'Bevestigen'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}
