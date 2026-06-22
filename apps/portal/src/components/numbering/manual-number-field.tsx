import type { UseFormRegisterReturn } from 'react-hook-form';
import { Input } from '@/components/ui';
import type { NumberingModel } from '@/types';
import { useNumberingSchemes } from '@/pages/organization/hooks/use-numbering-schemes';

interface ManualNumberFieldProps {
  model: NumberingModel;
  label: string;
  registration: UseFormRegisterReturn;
  error?: string;
}

/**
 * Optional manual-number input, shown only when the org's scheme for `model` has
 * `allowManualEntry` enabled. Left empty → the server auto-generates the number.
 * Renders nothing otherwise, so create forms stay clean by default.
 */
export function ManualNumberField({ model, label, registration, error }: ManualNumberFieldProps) {
  const { data: schemes } = useNumberingSchemes();
  const scheme = schemes?.find((s) => s.model === model);
  if (!scheme?.allowManualEntry) return null;

  return (
    <Input
      label={`${label} (handmatig — leeg laten voor automatisch)`}
      placeholder="Automatisch"
      error={error}
      {...registration}
    />
  );
}
