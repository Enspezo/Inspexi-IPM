import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RepairAccessType, ResolutionStatusCode } from '@/types';
import type { Finding, FindingResolution } from '@/types';
import { FindingRepairInfo, repairContactLabel } from './finding-repair-info';

const resolution = (over: Partial<FindingResolution>): FindingResolution => ({
  id: 'res-1',
  statusCode: ResolutionStatusCode.REPORTED,
  description: null,
  resolvedAt: '2026-07-01T10:00:00.000Z',
  photos: [],
  repairSession: null,
  ...over,
});

const finding = (resolutions: FindingResolution[]): Finding =>
  ({ id: 'f-1', statusCode: 'resolved', resolutions }) as unknown as Finding;

describe('repairContactLabel', () => {
  it('combineert naam en bedrijf', () => {
    expect(
      repairContactLabel({
        contactName: 'Jan Hersteller',
        companyName: 'Herstel BV',
        email: null,
        accessType: RepairAccessType.ANONYMOUS,
      }),
    ).toBe('Jan Hersteller — Herstel BV');
  });

  it("valt terug op 'Ingelogde klant' bij CLIENT_USER zonder naam", () => {
    expect(
      repairContactLabel({
        contactName: null,
        companyName: null,
        email: null,
        accessType: RepairAccessType.CLIENT_USER,
      }),
    ).toBe('Ingelogde klant');
  });
});

describe('FindingRepairInfo', () => {
  it('rendert niets zonder REPORTED/CONFLICT-resoluties', () => {
    const { container } = render(<FindingRepairInfo finding={finding([])} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('toont het REPORTED-blok met werkzaamheden, bron en invullergegevens', () => {
    render(
      <FindingRepairInfo
        finding={finding([
          resolution({
            description: 'Kabelgoot vervangen en opnieuw gemonteerd',
            repairSession: {
              contactName: 'Jan Hersteller',
              companyName: null,
              email: 'jan@herstel.nl',
              accessType: RepairAccessType.ANONYMOUS,
            },
          }),
        ])}
      />,
    );

    // 'Online herstel' staat er twee keer: als bloktitel én als bron-waarde.
    expect(screen.getAllByText('Online herstel')).toHaveLength(2);
    expect(screen.getByText('Hersteld gemeld')).toBeInTheDocument();
    expect(screen.getByText('Kabelgoot vervangen en opnieuw gemonteerd')).toBeInTheDocument();
    expect(screen.getByText('Jan Hersteller')).toBeInTheDocument();
    expect(screen.getByText('jan@herstel.nl')).toBeInTheDocument();
  });

  it('toont de CONFLICT-omschrijving pas na uitklappen', () => {
    render(
      <FindingRepairInfo
        finding={finding([
          resolution({
            statusCode: ResolutionStatusCode.CONFLICT,
            description: 'Wij hadden dit ook al hersteld',
          }),
        ])}
      />,
    );

    const toggle = screen.getByRole('button', { name: /Conflict — niet doorgevoerd/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Wij hadden dit ook al hersteld')).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Wij hadden dit ook al hersteld')).toBeInTheDocument();
  });

  it('negeert resoluties met andere statussen (bv. PENDING_VERIFICATION)', () => {
    const { container } = render(
      <FindingRepairInfo
        finding={finding([
          resolution({ statusCode: ResolutionStatusCode.PENDING_VERIFICATION }),
        ])}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
