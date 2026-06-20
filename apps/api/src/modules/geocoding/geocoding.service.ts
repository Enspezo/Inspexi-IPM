import {
  Injectable,
  BadGatewayException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma';

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

/** BAG-bouwgegevens, verrijkt via de PDOK BAG OGC API. */
export interface BagBuildingData {
  gebruiksfunctie: string | null;
  bouwjaar: number | null;
  oppervlakte: number | null;
  bagId: string | null;
}

/** Betekenisvolle PDOK-operaties die naar `PdokApiLog` geschreven worden. */
export type PdokOperation = 'LOOKUP' | 'BAG_ENRICH' | 'REFRESH';

/** Context voor het loggen van een PDOK-call (org/gebruiker/locatie). */
export interface PdokLogContext {
  operation: PdokOperation;
  orgId: string | null;
  userId?: string | null;
  locationId?: string | null;
}

/** Harde timeout op elke externe PDOK/Nominatim-call (ms). Voorkomt dat een
 *  trage/hangende upstream een create of refresh onbeperkt blokkeert. */
const PDOK_FETCH_TIMEOUT_MS = 8000;

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  /** PDOK Locatieserver (suggest/lookup). */
  private readonly locatieserverBase: string;
  /** PDOK BAG OGC API Features v2 (keyless) voor bouwgegevens. */
  private readonly bagOgcBase: string;
  private readonly NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.locatieserverBase = this.config.get<string>(
      'PDOK_LOCATIESERVER_URL',
      'https://api.pdok.nl/bzk/locatieserver/search/v3_1',
    );
    this.bagOgcBase = this.config.get<string>(
      'PDOK_BAG_OGC_URL',
      'https://api.pdok.nl/kadaster/bag/ogc/v2',
    );
  }

  /**
   * Centrale PDOK-fetch met DB-logging. Schrijft altijd een `PdokApiLog`-rij
   * (tenzij `orgId` ontbreekt, bv. SUPERUSER zonder org). Retourneert de
   * Response — ook bij een HTTP-fout (de caller beslist) — of `null` bij een
   * netwerkfout. Gooit nooit; logging is fire-and-forget.
   */
  private async loggedFetch(
    url: string,
    ctx: PdokLogContext,
    requestParams?: Record<string, unknown>,
    init?: RequestInit,
  ): Promise<Response | null> {
    const start = Date.now();
    let httpStatus: number | null = null;
    let success = false;
    let errorMessage: string | null = null;
    let res: Response | null = null;
    try {
      res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(PDOK_FETCH_TIMEOUT_MS),
      });
      httpStatus = res.status;
      success = res.ok;
      if (!res.ok) errorMessage = `HTTP ${res.status}`;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      res = null;
    } finally {
      this.writePdokLog(ctx, url, requestParams, {
        httpStatus,
        success,
        durationMs: Date.now() - start,
        errorMessage,
      });
    }
    return res;
  }

  /** Schrijf een operationele PDOK-logrij (fire-and-forget, blokkeert nooit). */
  private writePdokLog(
    ctx: PdokLogContext,
    endpoint: string,
    requestParams: Record<string, unknown> | undefined,
    result: {
      httpStatus: number | null;
      success: boolean;
      durationMs: number;
      errorMessage: string | null;
    },
  ): void {
    // Zonder org kunnen we niet org-scoped loggen (bv. SUPERUSER-domein) — sla over.
    if (!ctx.orgId) return;
    this.prisma.pdokApiLog
      .create({
        data: {
          orgId: ctx.orgId,
          userId: ctx.userId ?? null,
          locationId: ctx.locationId ?? null,
          operation: ctx.operation,
          endpoint,
          requestParams: (requestParams ?? null) as never,
          httpStatus: result.httpStatus,
          success: result.success,
          durationMs: result.durationMs,
          errorMessage: result.errorMessage,
        },
      })
      .catch((err) =>
        this.logger.error(
          `PdokApiLog schrijven mislukt (${ctx.operation})`,
          err instanceof Error ? err.stack : String(err),
        ),
      );
  }

  /**
   * Adres-autocomplete. Bewust NIET gelogd: dit wordt per toetsaanslag
   * aangeroepen en zou de log vervuilen.
   */
  async suggest(q: string): Promise<AddressSuggestion[]> {
    const url = `${this.locatieserverBase}/suggest?q=${encodeURIComponent(q)}&fq=type:adres&rows=5`;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(PDOK_FETCH_TIMEOUT_MS) });
    } catch {
      throw new BadGatewayException('PDOK API onbereikbaar');
    }
    if (!res.ok) throw new BadGatewayException('PDOK API onbereikbaar');
    const data = (await res.json()) as any;
    return (data.response?.docs ?? []).map((doc: any) => ({
      id: doc.id as string,
      label: doc.weergavenaam as string,
    }));
  }

  /**
   * Haal adresdetails op via de Locatieserver `lookup`. Betekenisvol →
   * gelogd (operatie via `ctx.operation`, default LOOKUP).
   */
  async lookup(id: string, ctx?: Partial<PdokLogContext>): Promise<ParsedAddress> {
    const url = `${this.locatieserverBase}/lookup?id=${encodeURIComponent(id)}`;
    const res = await this.loggedFetch(
      url,
      { operation: ctx?.operation ?? 'LOOKUP', orgId: ctx?.orgId ?? null, userId: ctx?.userId, locationId: ctx?.locationId },
      { id },
    );
    if (!res) throw new BadGatewayException('PDOK API onbereikbaar');
    if (!res.ok) throw new BadGatewayException('PDOK API onbereikbaar');
    const data = (await res.json()) as any;
    const doc = data.response?.docs?.[0];
    if (!doc) throw new NotFoundException('Adres niet gevonden');

    // Parse WKT centroide: "POINT(lon lat)"
    const wkt: string = doc.centroide_ll ?? '';
    const match = wkt.match(/POINT\(([^\s]+)\s+([^)]+)\)/);
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

  /**
   * Resolveer een vrij adres naar een Locatieserver-adres-id en haal de details
   * op. Gebruikt voor het verrijken van locaties zónder opgeslagen `pdokData`.
   * Retourneert `null` als er geen match is.
   */
  async lookupByAddress(
    street: string,
    houseNumber: string,
    postalCode: string,
    city: string,
    ctx?: Partial<PdokLogContext>,
  ): Promise<ParsedAddress | null> {
    const q = `${street} ${houseNumber}, ${postalCode} ${city}`.trim();
    let suggestions: AddressSuggestion[];
    try {
      suggestions = await this.suggest(q);
    } catch {
      return null;
    }
    if (!suggestions.length) return null;
    try {
      return await this.lookup(suggestions[0].id, ctx);
    } catch {
      return null;
    }
  }

  /**
   * Haal de BAG-bouwgegevens (gebruiksfunctie, bouwjaar, oppervlakte, pand-id)
   * op voor een adresseerbaar-object-id (verblijfsobject) via de keyless PDOK
   * BAG OGC API. Fail-soft: ontbrekende/onbereikbare data → `null`-velden.
   *
   * Flow: verblijfsobject → oppervlakte + gebruiksdoel + pand.href; daarna het
   * pand → identificatie (= `bagId` voor de BAG-viewer deeplink) + bouwjaar.
   */
  async bagEnrich(
    adresseerbaarobjectId: string | null | undefined,
    ctx?: Partial<PdokLogContext>,
  ): Promise<BagBuildingData> {
    const empty: BagBuildingData = {
      gebruiksfunctie: null,
      bouwjaar: null,
      oppervlakte: null,
      bagId: null,
    };
    if (!adresseerbaarobjectId) return empty;

    const logCtx: PdokLogContext = {
      operation: ctx?.operation ?? 'BAG_ENRICH',
      orgId: ctx?.orgId ?? null,
      userId: ctx?.userId,
      locationId: ctx?.locationId,
    };

    // 1) Verblijfsobject → oppervlakte, gebruiksdoel, pand-href
    const vboUrl = `${this.bagOgcBase}/collections/verblijfsobject/items?identificatie=${encodeURIComponent(adresseerbaarobjectId)}&f=json`;
    const vboRes = await this.loggedFetch(vboUrl, logCtx, {
      collection: 'verblijfsobject',
      identificatie: adresseerbaarobjectId,
    });
    if (!vboRes || !vboRes.ok) return empty;

    let vboProps: Record<string, any> | null = null;
    let pandHref: string | null = null;
    try {
      const vboData = (await vboRes.json()) as any;
      vboProps = vboData?.features?.[0]?.properties ?? null;
      const rawHref = vboProps?.['pand.href'];
      pandHref = Array.isArray(rawHref) ? (rawHref[0] ?? null) : (rawHref ?? null);
    } catch {
      return empty;
    }
    if (!vboProps) return empty;

    const result: BagBuildingData = {
      gebruiksfunctie: this.firstString(vboProps.gebruiksdoel),
      oppervlakte: this.toNumber(vboProps.oppervlakte),
      bouwjaar: null,
      bagId: null,
    };

    // 2) Pand → bagId (identificatie) + bouwjaar. Volg de href alleen als die
    // absoluut is (een malformde/relatieve href zou een nutteloze faal-call zijn).
    if (pandHref && /^https?:\/\//i.test(pandHref)) {
      const pandUrl = pandHref.includes('?')
        ? `${pandHref}&f=json`
        : `${pandHref}?f=json`;
      const pandRes = await this.loggedFetch(pandUrl, logCtx, {
        collection: 'pand',
        href: pandHref,
      });
      if (pandRes && pandRes.ok) {
        try {
          const pandData = (await pandRes.json()) as any;
          // Een href naar een enkel item geeft een Feature; een items-query een
          // FeatureCollection. Ondersteun beide vormen.
          const pandProps =
            pandData?.properties ?? pandData?.features?.[0]?.properties ?? null;
          if (pandProps) {
            result.bagId = this.firstString(pandProps.identificatie);
            result.bouwjaar = this.toNumber(pandProps.bouwjaar);
            if (!result.gebruiksfunctie) {
              result.gebruiksfunctie = this.firstString(pandProps.gebruiksdoel);
            }
          }
        } catch {
          // pand-parse mislukt → bouwjaar/bagId blijven null, rest behouden
        }
      }
    }

    return result;
  }

  /** Eerste niet-lege string uit een waarde die string of string[] kan zijn. */
  private firstString(value: unknown): string | null {
    if (Array.isArray(value)) {
      const first = value.find((v) => v != null && String(v).length > 0);
      return first != null ? String(first) : null;
    }
    if (value == null) return null;
    const s = String(value);
    return s.length > 0 ? s : null;
  }

  /** Veilige numerieke parse; `null` bij ontbrekende/ongeldige waarde. */
  private toNumber(value: unknown): number | null {
    if (value == null) return null;
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Geocodeer een adres via Nominatim (OpenStreetMap) als fallback wanneer
   * geen PDOK-data beschikbaar is. Retourneert null bij mislukken.
   */
  async nominatimGeocode(
    street: string,
    houseNumber: string,
    postalCode: string,
    city: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const q = `${street} ${houseNumber}, ${postalCode} ${city}, Nederland`;
    try {
      const res = await fetch(
        `${this.NOMINATIM_BASE}/search?format=json&q=${encodeURIComponent(q)}&countrycodes=nl&limit=1`,
        {
          headers: { 'User-Agent': 'InspeXi-Beheer/1.0' },
          signal: AbortSignal.timeout(PDOK_FETCH_TIMEOUT_MS),
        },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as any[];
      if (!data[0]) return null;
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    } catch (err) {
      this.logger.warn(`Nominatim geocoding mislukt voor "${q}"`, err);
      return null;
    }
  }

  /**
   * Extraheer lat/lng uit een opgeslagen PDOK-doc (centroide_ll WKT veld).
   * Retourneert null als het veld ontbreekt of niet parseerbaar is.
   */
  extractCoordsFromPdokData(
    pdokData: Record<string, unknown>,
  ): { lat: number; lng: number } | null {
    const wkt = pdokData['centroide_ll'] as string | undefined;
    if (!wkt) return null;
    const match = wkt.match(/POINT\(([^\s]+)\s+([^)]+)\)/);
    if (!match) return null;
    const lng = parseFloat(match[1]);
    const lat = parseFloat(match[2]);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { lat, lng };
  }

  /**
   * Haal het adresseerbaar-object-id (verblijfsobject-BAG-id) uit opgeslagen
   * PDOK-data. Dit voedt `bagEnrich`.
   */
  extractAdresseerbaarObjectId(
    pdokData: Record<string, unknown> | null | undefined,
  ): string | null {
    if (!pdokData) return null;
    return this.firstString(pdokData['adresseerbaarobject_id']);
  }
}
