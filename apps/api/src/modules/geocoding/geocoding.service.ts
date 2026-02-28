import {
  Injectable,
  BadGatewayException,
  NotFoundException,
} from '@nestjs/common';

export interface AddressSuggestion {
  id: string;
  label: string;
}

export interface ParsedAddress {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  lat: number;
  lng: number;
  /** Volledige ruwe PDOK-respons — bewaar als JSON voor toekomstig gebruik */
  pdokData: Record<string, unknown>;
}

@Injectable()
export class GeocodingService {
  private readonly PDOK_BASE =
    'https://api.pdok.nl/bzk/locatieserver/search/v3_1';

  async suggest(q: string): Promise<AddressSuggestion[]> {
    const url = `${this.PDOK_BASE}/suggest?q=${encodeURIComponent(q)}&fq=type:adres&rows=5`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new BadGatewayException('PDOK API onbereikbaar');
    }
    if (!res.ok) throw new BadGatewayException('PDOK API onbereikbaar');
    const data = await res.json() as any;
    return (data.response?.docs ?? []).map((doc: any) => ({
      id: doc.id as string,
      label: doc.weergavenaam as string,
    }));
  }

  async lookup(id: string): Promise<ParsedAddress> {
    const url = `${this.PDOK_BASE}/lookup?id=${encodeURIComponent(id)}`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new BadGatewayException('PDOK API onbereikbaar');
    }
    if (!res.ok) throw new BadGatewayException('PDOK API onbereikbaar');
    const data = await res.json() as any;
    const doc = data.response?.docs?.[0];
    if (!doc) throw new NotFoundException('Adres niet gevonden');

    // Parse WKT centroide: "POINT(lon lat)"
    const wkt: string = doc.centroide_ll ?? '';
    const match = wkt.match(/POINT\(([^\s]+)\s+([^\)]+)\)/);
    if (!match) throw new BadGatewayException('Ongeldige coördinaten van PDOK');
    const lng = parseFloat(match[1]);
    const lat = parseFloat(match[2]);

    // Build house number: number + optional letter + optional addition
    const houseNumber = [
      doc.huisnummer != null ? String(doc.huisnummer) : null,
      doc.huisletter ?? null,
      doc.huisnummertoevoeging ?? null,
    ]
      .filter(Boolean)
      .join('');

    return {
      street: doc.straatnaam ?? '',
      houseNumber,
      postalCode: doc.postcode ?? '',
      city: doc.woonplaatsnaam ?? '',
      lat,
      lng,
      // Sla de volledige PDOK-respons op voor toekomstig gebruik
      // (gemeentenaam, provincienaam, BAG-IDs, wijknaam, buurtnaam, etc.)
      pdokData: doc as Record<string, unknown>,
    };
  }
}
