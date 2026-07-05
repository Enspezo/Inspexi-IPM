import { BadRequestException } from '@nestjs/common';
import { jsonObjectSchema, jsonArraySchema, validateJsonColumn } from './json-column';

describe('validateJsonColumn', () => {
  it('passes undefined through untouched (partial PATCH)', () => {
    expect(validateJsonColumn(jsonObjectSchema, undefined, 'metadata')).toBeUndefined();
  });

  it('accepts a plain object and returns it unchanged (passthrough)', () => {
    const value = { a: 1, nested: { b: 'x' }, unknownKey: true };
    expect(validateJsonColumn(jsonObjectSchema, value, 'technische gegevens')).toEqual(value);
  });

  it('accepts an array for array columns', () => {
    const value = [{ itemCode: 'x', result: 'pass' }, 'anything'];
    expect(validateJsonColumn(jsonArraySchema, value, 'metingen')).toEqual(value);
  });

  it('rejects an array where an object is expected — 400 with NL message', () => {
    expect(() => validateJsonColumn(jsonObjectSchema, ['x'], 'metadata')).toThrow(BadRequestException);
    try {
      validateJsonColumn(jsonObjectSchema, ['x'], 'metadata');
    } catch (e) {
      expect((e as BadRequestException).message).toContain('Ongeldige metadata');
    }
  });

  it('rejects primitives and null for object columns', () => {
    expect(() => validateJsonColumn(jsonObjectSchema, 'garbage', 'metadata')).toThrow(BadRequestException);
    expect(() => validateJsonColumn(jsonObjectSchema, 42, 'metadata')).toThrow(BadRequestException);
    expect(() => validateJsonColumn(jsonObjectSchema, null, 'metadata')).toThrow(BadRequestException);
  });

  it('rejects a non-array for array columns', () => {
    expect(() => validateJsonColumn(jsonArraySchema, { not: 'array' }, 'metingen')).toThrow(
      BadRequestException,
    );
  });

  it('allows null when the schema is nullable', () => {
    expect(validateJsonColumn(jsonObjectSchema.nullable(), null, 'metadata')).toBeNull();
  });
});
