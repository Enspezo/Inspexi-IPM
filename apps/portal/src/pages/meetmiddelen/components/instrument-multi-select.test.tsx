import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InstrumentMultiSelect } from './instrument-multi-select';
import { MEETMIDDEL_KALIBRATIE_STATUS, MEETMIDDEL_STATUS } from '@/lib/status';
import type { MeasurementInstrument } from '@/types';

const inst = (over: Partial<MeasurementInstrument>): MeasurementInstrument =>
  ({
    id: 'x', orgId: 'o', code: 'MM', brand: 'B', type: 'T', serialNumber: null,
    calibrationIntervalMonths: 12, status: 'ACTIEF' as any, assignedToUserId: 'u',
    notes: null, lastCalibrationDate: null, nextCalibrationDue: null,
    isDeleted: false, createdAt: '', updatedAt: '', calibrationStatus: 'GELDIG',
    ...over,
  }) as MeasurementInstrument;

describe('InstrumentMultiSelect', () => {
  const instruments = [
    inst({ id: 'mi-1', code: 'MM-001', calibrationStatus: 'GELDIG' }),
    inst({ id: 'mi-2', code: 'MM-002', assignedToUserId: null, calibrationStatus: 'VERLOPEN' }),
  ];

  it('renders an option per instrument', () => {
    render(<InstrumentMultiSelect instruments={instruments} selectedIds={[]} onChange={() => {}} />);
    expect(screen.getByText(/MM-001/)).toBeInTheDocument();
    expect(screen.getByText(/MM-002/)).toBeInTheDocument();
    expect(screen.getByText(/op voorraad/)).toBeInTheDocument();
  });

  it('adds an id when an unchecked box is toggled', () => {
    const onChange = vi.fn();
    render(<InstrumentMultiSelect instruments={instruments} selectedIds={[]} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(onChange).toHaveBeenCalledWith(['mi-1']);
  });

  it('removes an id when a checked box is toggled', () => {
    const onChange = vi.fn();
    render(<InstrumentMultiSelect instruments={instruments} selectedIds={['mi-1', 'mi-2']} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(onChange).toHaveBeenCalledWith(['mi-2']);
  });

  it('shows a placeholder when there are no instruments', () => {
    render(<InstrumentMultiSelect instruments={[]} selectedIds={[]} onChange={() => {}} />);
    expect(screen.getByText(/Geen meetmiddelen beschikbaar/)).toBeInTheDocument();
  });
});

describe('meetmiddel status maps', () => {
  it('covers all derived calibration statuses', () => {
    expect(Object.keys(MEETMIDDEL_KALIBRATIE_STATUS).sort()).toEqual(
      ['BINNENKORT', 'GEEN_KALIBRATIE', 'GELDIG', 'VERLOPEN'].sort(),
    );
  });

  it('covers all lifecycle statuses', () => {
    expect(Object.keys(MEETMIDDEL_STATUS).sort()).toEqual(
      ['ACTIEF', 'AFGEKEURD', 'BUITEN_GEBRUIK'].sort(),
    );
  });
});
