import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '@/components/ui';
import type { ClassificationOption } from '@/types';
import { OptionModal } from './option-modal';
import { useCreateOption, useUpdateOption } from '../hooks/use-classification-models';

vi.mock('../hooks/use-classification-models', () => ({
  useCreateOption: vi.fn(),
  useUpdateOption: vi.fn(),
}));

const createMutateAsync = vi.fn().mockResolvedValue({});
const updateMutateAsync = vi.fn().mockResolvedValue({});

function setup(option: ClassificationOption | null = null) {
  vi.mocked(useCreateOption).mockReturnValue({
    mutateAsync: createMutateAsync,
    isPending: false,
  } as any);
  vi.mocked(useUpdateOption).mockReturnValue({
    mutateAsync: updateMutateAsync,
    isPending: false,
  } as any);
  return render(
    <ToastProvider>
      <OptionModal isOpen onClose={vi.fn()} modelId="m1" charId="c1" option={option} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  createMutateAsync.mockResolvedValue({});
  updateMutateAsync.mockResolvedValue({});
});

describe('OptionModal — isCritical (PRD-14)', () => {
  it('stuurt isCritical: true mee bij aanmaken wanneer de checkbox is aangevinkt', async () => {
    setup();

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'C1' } });
    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Direct gevaar' } });
    fireEvent.click(screen.getByLabelText('Kritiek'));
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'C1', name: 'Direct gevaar', isCritical: true }),
    );
  });

  it('stuurt isCritical: false mee wanneer de checkbox uit blijft', async () => {
    setup();

    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'C3' } });
    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Gering risico' } });
    fireEvent.click(screen.getByRole('button', { name: 'Toevoegen' }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
    expect(createMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ isCritical: false }),
    );
  });

  it('vult de checkbox voor vanuit een bestaande optie en stuurt de wijziging mee', async () => {
    setup({
      id: 'opt-1',
      characteristicId: 'c1',
      code: 'C1',
      name: 'Direct gevaar',
      description: null,
      color: '#DC2626',
      sortOrder: 1,
      isCritical: true,
    });

    const checkbox = screen.getByLabelText('Kritiek');
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox); // uitvinken
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));

    await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
    expect(updateMutateAsync).toHaveBeenCalledWith({
      optionId: 'opt-1',
      data: expect.objectContaining({ isCritical: false }),
    });
  });
});
