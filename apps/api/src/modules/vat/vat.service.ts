import {
  Injectable,
  BadGatewayException,
  BadRequestException,
} from '@nestjs/common';

export interface VatValidationResult {
  /** Tijdstip van de controle */
  checkedAt: string;
  /** Is het BTW-nummer geldig? */
  isValid: boolean;
  /** VIES statuscode (bijv. "VALID", "INVALID") */
  userError: string;
  /** Landcode (bijv. "NL") */
  countryCode: string;
  /** BTW-nummer zonder landcode */
  vatNumber: string;
  /** Bedrijfsnaam zoals geregistreerd in VIES */
  name: string | null;
  /** Adres zoals geregistreerd in VIES */
  address: string | null;
  /** Unieke consultatie-ID van VIES — nuttig als bewijs */
  requestIdentifier: string | null;
  /** Datum van het VIES-verzoek */
  requestDate: string | null;
}

/** Haal landcode (NL) en nummer (123456789B01) op uit een BTW-nummer */
function parseVatNumber(raw: string): { countryCode: string; number: string } | null {
  const cleaned = raw.replace(/[\s\-\.]/g, '').toUpperCase();
  if (cleaned.length < 4) return null;
  const countryCode = cleaned.slice(0, 2);
  const number = cleaned.slice(2);
  if (!/^[A-Z]{2}$/.test(countryCode) || !number) return null;
  return { countryCode, number };
}

@Injectable()
export class VatService {
  private readonly VIES_BASE =
    'https://ec.europa.eu/taxation_customs/vies/rest-api/ms';

  async check(rawVatNumber: string): Promise<VatValidationResult> {
    const parsed = parseVatNumber(rawVatNumber);
    if (!parsed) {
      throw new BadRequestException(
        'Ongeldig BTW-nummer formaat — verwacht bijv. NL123456789B01',
      );
    }

    const { countryCode, number } = parsed;
    const url = `${this.VIES_BASE}/${countryCode}/vat/${number}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json' },
      });
    } catch {
      throw new BadGatewayException('VIES API onbereikbaar');
    }

    // 404 van VIES betekent dat het nummer niet bestaat
    if (res.status === 404) {
      return {
        checkedAt: new Date().toISOString(),
        isValid: false,
        userError: 'INVALID',
        countryCode,
        vatNumber: number,
        name: null,
        address: null,
        requestIdentifier: null,
        requestDate: null,
      };
    }

    if (!res.ok) {
      throw new BadGatewayException('VIES API fout');
    }

    const data = (await res.json()) as any;

    return {
      checkedAt: new Date().toISOString(),
      isValid: data.isValid === true,
      userError: data.userError ?? (data.isValid ? 'VALID' : 'INVALID'),
      countryCode,
      vatNumber: data.vatNumber ?? number,
      name: data.name ?? null,
      address: data.address ?? null,
      requestIdentifier: data.requestIdentifier ?? null,
      requestDate: data.requestDate ?? null,
    };
  }
}
