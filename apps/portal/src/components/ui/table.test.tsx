import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Table, extractTextContent, type Column } from './table';

interface Row {
  id: string;
  name: string;
}

const LONG_NAME = 'TP ' + 'L'.repeat(220);

function renderTable(columns: Column<Row>[], rows: Row[] = [{ id: '1', name: LONG_NAME }]) {
  return render(
    <Table columns={columns} data={rows} keyExtractor={(r) => r.id} />,
  );
}

function bodyCells(container: HTMLElement): HTMLTableCellElement[] {
  return Array.from(container.querySelectorAll('tbody td'));
}

describe('Table — celtruncatie (B-301)', () => {
  it('kapt een extreem lange waarde af: max-w-xs + truncate + volledige waarde in title', () => {
    const { container } = renderTable([
      { key: 'name', header: 'Naam', render: (r) => r.name },
    ]);

    const [cell] = bodyCells(container);
    expect(cell.className).toContain('max-w-xs');
    expect(cell.className).toContain('truncate');
    expect(cell.className).not.toContain('whitespace-nowrap');
    expect(cell.title).toBe(LONG_NAME);
  });

  it('haalt de title-tekst ook uit geneste elementen (bv. een link/knop in de cel)', () => {
    const { container } = renderTable([
      {
        key: 'name',
        header: 'Naam',
        render: (r) => <button type="button">{r.name}</button>,
      },
    ]);

    const [cell] = bodyCells(container);
    expect(cell.title).toBe(LONG_NAME);
    expect(cell.className).toContain('truncate');
  });

  it('zet géén title op cellen zonder tekstinhoud (bv. icoon-knoppen)', () => {
    const { container } = renderTable([
      {
        key: 'actions',
        header: 'Acties',
        render: () => (
          <button type="button" aria-label="Verwijderen">
            <svg viewBox="0 0 20 20" />
          </button>
        ),
      },
    ]);

    const [cell] = bodyCells(container);
    expect(cell.hasAttribute('title')).toBe(false);
  });

  it('respecteert een eigen max-w-*-klasse als escape: geen truncate, wél oud nowrap-gedrag', () => {
    const { container } = renderTable([
      { key: 'name', header: 'Naam', render: (r) => r.name, className: 'max-w-none' },
    ]);

    const [cell] = bodyCells(container);
    expect(cell.className).toContain('max-w-none');
    expect(cell.className).toContain('whitespace-nowrap');
    expect(cell.className).not.toContain('max-w-xs');
    expect(cell.className).not.toContain('truncate');
    // De volledige waarde blijft via title beschikbaar.
    expect(cell.title).toBe(LONG_NAME);
  });

  it('combineert de standaardtruncatie met overige kolomklassen (bv. text-right)', () => {
    const { container } = renderTable([
      { key: 'name', header: 'Naam', render: (r) => r.name, className: 'text-right' },
    ]);

    const [cell] = bodyCells(container);
    expect(cell.className).toContain('text-right');
    expect(cell.className).toContain('max-w-xs');
    expect(cell.className).toContain('truncate');
  });

  it('toont de emptyMessage-cel zonder truncatie-attributen', () => {
    const { container } = renderTable(
      [{ key: 'name', header: 'Naam', render: (r) => r.name }],
      [],
    );

    expect(screen.getByText('Geen gegevens gevonden')).toBeInTheDocument();
    const [cell] = bodyCells(container);
    expect(cell.className).not.toContain('truncate');
  });
});

describe('extractTextContent', () => {
  it('leest strings, numbers en arrays', () => {
    expect(extractTextContent('abc')).toBe('abc');
    expect(extractTextContent(42)).toBe('42');
    expect(extractTextContent(['a', 'b', 3])).toBe('a b 3');
  });

  it('negeert null/undefined/boolean', () => {
    expect(extractTextContent(null)).toBe('');
    expect(extractTextContent(undefined)).toBe('');
    expect(extractTextContent(true)).toBe('');
  });

  it('daalt af in geneste elementen', () => {
    expect(
      extractTextContent(
        <span>
          Buiten <strong>binnen</strong>
        </span>,
      ),
    ).toBe('Buiten binnen');
  });
});
