import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QuoteLineDto } from './set-quote-lines.dto';
import { RejectQuoteDto } from './review-approval.dto';

/**
 * DTO-grenswaardetests (WP-B5): B-302/B-303 (@Min/@Max op offerteregels met
 * NL-meldingen) en B-314 (RejectQuoteDto.note optioneel).
 */
describe('QuoteLineDto validation (B-302/B-303)', () => {
  const validLine = {
    description: 'NEN1010 Inspectie',
    quantity: 3,
    unit: 'uur',
    unitPrice: 85,
    vatRate: 21,
    discountPct: 10,
  };

  async function validateLine(overrides: Record<string, unknown>) {
    const dto = plainToInstance(QuoteLineDto, { ...validLine, ...overrides });
    return validate(dto);
  }

  function messagesOf(errors: Awaited<ReturnType<typeof validate>>): string[] {
    return errors.flatMap((e) => Object.values(e.constraints ?? {}));
  }

  it('accepts a normal line', async () => {
    expect(await validateLine({})).toHaveLength(0);
  });

  it('accepts boundary values (quantity/unitPrice max, korting/btw 0 en 100)', async () => {
    expect(
      await validateLine({ quantity: 9_999_999.99, unitPrice: 9_999_999.99, vatRate: 100, discountPct: 100 }),
    ).toHaveLength(0);
    expect(await validateLine({ unitPrice: 0, vatRate: 0, discountPct: 0 })).toHaveLength(0);
  });

  it('rejects quantity 999999999 with a Dutch message (B-303)', async () => {
    const errors = await validateLine({ quantity: 999_999_999 });
    expect(messagesOf(errors)).toContain('Aantal mag maximaal 9.999.999,99 zijn');
  });

  it('rejects a negative quantity with a Dutch message', async () => {
    const errors = await validateLine({ quantity: -1 });
    expect(messagesOf(errors)).toContain('Aantal mag niet negatief zijn');
  });

  it('rejects a negative unitPrice (B-302)', async () => {
    const errors = await validateLine({ unitPrice: -100 });
    expect(messagesOf(errors)).toContain('Eenheidsprijs mag niet negatief zijn');
  });

  it('rejects unitPrice above the numeric(12,2)-safe bound', async () => {
    const errors = await validateLine({ unitPrice: 100_000_000_000 });
    expect(messagesOf(errors)).toContain('Eenheidsprijs mag maximaal € 9.999.999,99 zijn');
  });

  it('rejects discountPct above 100 (B-302)', async () => {
    const errors = await validateLine({ discountPct: 150 });
    expect(messagesOf(errors)).toContain('Korting mag maximaal 100% zijn');
  });

  it('rejects vatRate above 100 and below 0 (B-302)', async () => {
    expect(messagesOf(await validateLine({ vatRate: 250 }))).toContain(
      'Btw-tarief mag maximaal 100% zijn',
    );
    expect(messagesOf(await validateLine({ vatRate: -50 }))).toContain(
      'Btw-tarief mag niet negatief zijn',
    );
  });
});

describe('RejectQuoteDto validation (B-314)', () => {
  it('accepts an empty body — note is optioneel', async () => {
    const dto = plainToInstance(RejectQuoteDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts a note when provided', async () => {
    const dto = plainToInstance(RejectQuoteDto, { note: 'Prijs te hoog' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a non-string note with a Dutch message', async () => {
    const dto = plainToInstance(RejectQuoteDto, { note: 123 });
    const errors = await validate(dto);
    const messages = errors.flatMap((e) => Object.values(e.constraints ?? {}));
    expect(messages).toContain('Reden voor afwijzing moet tekst zijn');
  });
});
