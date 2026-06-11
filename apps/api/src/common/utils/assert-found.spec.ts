import { NotFoundException } from '@nestjs/common';
import { assertFound } from './assert-found';

describe('assertFound', () => {
  it('returns the entity when present', () => {
    const entity = { id: '1' };
    expect(assertFound(entity, 'Relatie')).toBe(entity);
  });

  it('throws a Dutch NotFoundException for null/undefined', () => {
    expect(() => assertFound(null, 'Relatie')).toThrow(NotFoundException);
    expect(() => assertFound(null, 'Relatie')).toThrow('Relatie niet gevonden');
    expect(() => assertFound(undefined, 'Offerte')).toThrow('Offerte niet gevonden');
  });
});
