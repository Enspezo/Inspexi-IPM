import { z } from 'zod';

// ─── Form schemas ────────────────────────────────────────────

export const editSchema = z.object({
  internalNotes: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

export type EditFormData = z.infer<typeof editSchema>;

// ─── Line form ───────────────────────────────────────────────

export interface LineFormValues {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
}

export const defaultLine: LineFormValues = {
  description: '',
  quantity: 1,
  unit: 'stuk',
  unitPrice: 0,
  vatRate: 21,
};
