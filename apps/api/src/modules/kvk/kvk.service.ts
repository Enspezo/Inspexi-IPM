import {
  Injectable,
  BadGatewayException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface KvkSearchResult {
  kvkNummer: string;
  naam: string;
  straatnaam?: string;
  huisnummer?: string;
  postcode?: string;
  plaats?: string;
}

export interface KvkAddress {
  type: string;
  straatnaam?: string;
  huisnummer?: string;
  postcode?: string;
  plaats?: string;
}

export interface KvkCompanyProfile {
  kvkNummer: string;
  naam: string;
  website?: string;
  adressen: KvkAddress[];
}

@Injectable()
export class KvkService {
  private readonly baseUrlV2: string;
  private readonly baseUrlV1: string;
  private readonly apiKey: string;

  constructor(private readonly config: ConfigService) {
    const useTest =
      this.config.get<string>('KVK_USE_TEST_ENV', 'true') !== 'false';
    // Zoeken (search) gebruikt v2; basisprofielen gebruikt v1
    this.baseUrlV2 = useTest
      ? 'https://api.kvk.nl/test/api/v2'
      : 'https://api.kvk.nl/api/v2';
    this.baseUrlV1 = useTest
      ? 'https://api.kvk.nl/test/api/v1'
      : 'https://api.kvk.nl/api/v1';
    // Public KvK test API key — vervang door echte key in productie via KVK_API_KEY
    this.apiKey = this.config.get<string>(
      'KVK_API_KEY',
      'l7xx1f2691f2520d487185dbc7ab0d1cc2cf',
    );
  }

  async search(q: string): Promise<KvkSearchResult[]> {
    const isKvkNumber = /^\d{1,8}$/.test(q.trim());
    const param = isKvkNumber
      ? `kvkNummer=${encodeURIComponent(q.trim())}`
      : `naam=${encodeURIComponent(q.trim())}`;
    const url = `${this.baseUrlV2}/zoeken?${param}&resultatenPerPagina=10`;

    let res: Response;
    try {
      res = await fetch(url, { headers: { apikey: this.apiKey } });
    } catch {
      throw new BadGatewayException('KvK API onbereikbaar');
    }

    if (res.status === 400 || res.status === 404) return [];
    if (!res.ok) throw new BadGatewayException('KvK API fout');

    const data = (await res.json()) as any;
    return (data.resultaten ?? []).map((r: any) => ({
      kvkNummer: r.kvkNummer as string,
      naam: r.naam as string,
      straatnaam: r.adres?.binnenlandsAdres?.straatnaam as string | undefined,
      huisnummer:
        r.adres?.binnenlandsAdres?.huisnummer != null
          ? String(r.adres.binnenlandsAdres.huisnummer)
          : undefined,
      postcode: r.adres?.binnenlandsAdres?.postcode as string | undefined,
      plaats: r.adres?.binnenlandsAdres?.plaats as string | undefined,
    }));
  }

  async getProfile(kvkNummer: string): Promise<KvkCompanyProfile> {
    // Basisprofielen worden geleverd via de v1 API
    const url = `${this.baseUrlV1}/basisprofielen/${encodeURIComponent(kvkNummer)}`;

    let res: Response;
    try {
      res = await fetch(url, { headers: { apikey: this.apiKey } });
    } catch {
      throw new BadGatewayException('KvK API onbereikbaar');
    }

    if (res.status === 404)
      throw new NotFoundException('Bedrijf niet gevonden in KvK');
    if (!res.ok) throw new BadGatewayException('KvK API fout');

    const data = (await res.json()) as any;

    // Adresgegevens zitten in _embedded.hoofdvestiging.adressen (v1 API structuur)
    const hoofdvestiging = data._embedded?.hoofdvestiging;
    const rawAdressen: any[] = hoofdvestiging?.adressen ?? [];

    return {
      kvkNummer: data.kvkNummer as string,
      naam: data.naam as string,
      website: hoofdvestiging?.website as string | undefined,
      adressen: rawAdressen.map((a: any) => ({
        type: (a.type as string) ?? 'bezoekadres',
        straatnaam: a.straatnaam as string | undefined,
        huisnummer: a.huisnummer != null ? String(a.huisnummer) : undefined,
        postcode: a.postcode as string | undefined,
        plaats: a.plaats as string | undefined,
      })),
    };
  }
}
