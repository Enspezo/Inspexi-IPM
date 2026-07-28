import { BadRequestException, ValidationError } from '@nestjs/common';
import {
  nlValidationExceptionFactory,
  translateValidationMessage,
} from './nl-validation';

describe('translateValidationMessage (WP-C1 / B-501)', () => {
  const cases: Array<[string, string]> = [
    ['defaultVat must not be less than 0', 'defaultVat moet minimaal 0 zijn'],
    ['defaultVat must not be greater than 100', 'defaultVat mag maximaal 100 zijn'],
    [
      'name must be longer than or equal to 2 characters',
      'name moet minimaal 2 tekens bevatten',
    ],
    [
      'aiReviewInstructions must be shorter than or equal to 2000 characters',
      'aiReviewInstructions mag maximaal 2000 tekens bevatten',
    ],
    ['roles must contain at least 1 elements', 'roles moet minimaal 1 item bevatten'],
    ['email must be an email', 'email moet een geldig e-mailadres zijn'],
    ['title should not be empty', 'title mag niet leeg zijn'],
    ['title must be a string', 'title moet tekst zijn'],
    [
      'quantity must be a number conforming to the specified constraints',
      'quantity moet een getal zijn',
    ],
    ['sortOrder must be an integer number', 'sortOrder moet een geheel getal zijn'],
    ['isActive must be a boolean value', 'isActive moet ja of nee zijn'],
    ['contactId must be a UUID', 'contactId moet een geldige identificatie (UUID) zijn'],
    [
      'status must be one of the following values: OPEN, CLOSED',
      'status moet een van de volgende waarden zijn: OPEN, CLOSED',
    ],
    ['property foo should not exist', 'Onbekend veld: foo'],
  ];

  it.each(cases)('%s → %s', (english, dutch) => {
    expect(translateValidationMessage(english)).toBe(dutch);
  });

  it('laat bestaande (Nederlandse) custom messages ongemoeid', () => {
    expect(translateValidationMessage('Aantal mag niet negatief zijn')).toBe(
      'Aantal mag niet negatief zijn',
    );
    expect(translateValidationMessage('Naam moet minimaal 2 tekens bevatten')).toBe(
      'Naam moet minimaal 2 tekens bevatten',
    );
  });
});

describe('nlValidationExceptionFactory — geneste padprefixen (WP-B5-restpunt)', () => {
  function makeError(partial: Partial<ValidationError>): ValidationError {
    return { property: '', children: [], ...partial } as ValidationError;
  }

  function messagesOf(exception: BadRequestException): string[] {
    const response = exception.getResponse() as { message: string[] };
    return Array.isArray(response.message) ? response.message : [response.message];
  }

  it('maakt "lines.0.quantity" leesbaar als "Regel 1: …"', () => {
    const errors = [
      makeError({
        property: 'lines',
        children: [
          makeError({
            property: '0',
            children: [
              makeError({
                property: 'quantity',
                constraints: { min: 'Aantal mag niet negatief zijn' },
              }),
            ],
          }),
        ],
      }),
    ];

    const messages = messagesOf(nlValidationExceptionFactory(errors));
    expect(messages).toEqual(['Regel 1: Aantal mag niet negatief zijn']);
  });

  it('vertaalt een Engelse default binnen een genest pad', () => {
    const errors = [
      makeError({
        property: 'lines',
        children: [
          makeError({
            property: '1',
            children: [
              makeError({
                property: 'unitPrice',
                constraints: { max: 'unitPrice must not be greater than 9999999.99' },
              }),
            ],
          }),
        ],
      }),
    ];

    const messages = messagesOf(nlValidationExceptionFactory(errors));
    expect(messages).toEqual(['Regel 2: unitPrice mag maximaal 9999999.99 zijn']);
  });

  it('geeft top-level meldingen zonder prefix door', () => {
    const errors = [
      makeError({
        property: 'defaultVat',
        constraints: { min: 'defaultVat must not be less than 0' },
      }),
    ];
    expect(messagesOf(nlValidationExceptionFactory(errors))).toEqual([
      'defaultVat moet minimaal 0 zijn',
    ]);
  });

  it('valt terug op een generieke NL-melding zonder constraint-details', () => {
    expect(messagesOf(nlValidationExceptionFactory([]))).toEqual(['Ongeldige aanvraag']);
  });
});
