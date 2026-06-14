/**
 * Fase 1 — Globale lookup-defaults voor het inspectiedomein.
 *
 * De 11 per-org overschrijfbare status/type-lijsten (zie FASE1-SCHEMA.md §3a).
 * Deze set wordt als systeemdefault geseed (orgId = null, isSystem = true) en
 * door elke organisatie geërfd. Een org kan een systeemcode herlabelen/kleuren
 * (eigen rij met dezelfde `code`) of eigen extra codes toevoegen.
 *
 * De vaste systeemcodes hieronder blijven leidend voor de state-machine-logica
 * in de backend; orgs mogen ze herlabelen maar niet verwijderen.
 */
import { PrismaClient } from '@prisma/client';

export interface LookupRow {
  code: string;
  label: string;
  color?: string;
  sortOrder: number;
}

export interface LookupSet {
  /** Naam van de Prisma-delegate, bv. 'planStatusType' */
  model:
    | 'inspectionTypeOption'
    | 'planStatusType'
    | 'assetStatusType'
    | 'findingStatusType'
    | 'reportStatusType'
    | 'signatoryTypeOption'
    | 'signerRoleOption'
    | 'passFailStatusType'
    | 'resolutionStatusType'
    | 'clientRequestTypeOption'
    | 'clientRequestStatusType';
  label: string;
  rows: LookupRow[];
}

export const LOOKUP_SETS: LookupSet[] = [
  {
    model: 'inspectionTypeOption',
    label: 'Inspectietypes',
    rows: [
      { code: 'initial', label: 'Eerste inspectie', color: '#2563EB', sortOrder: 0 },
      { code: 'periodic', label: 'Periodieke inspectie', color: '#0891B2', sortOrder: 1 },
      { code: 'modification', label: 'Wijziging', color: '#CA8A04', sortOrder: 2 },
      { code: 'reinspection', label: 'Herinspectie', color: '#7C3AED', sortOrder: 3 },
    ],
  },
  {
    model: 'planStatusType',
    label: 'Inspectieplan-statussen',
    rows: [
      { code: 'draft', label: 'Concept', color: '#6B7280', sortOrder: 0 },
      { code: 'planned', label: 'Gepland', color: '#2563EB', sortOrder: 1 },
      { code: 'in_progress', label: 'In uitvoering', color: '#D97706', sortOrder: 2 },
      { code: 'pending_review', label: 'Wacht op review', color: '#CA8A04', sortOrder: 3 },
      { code: 'reviewed', label: 'Beoordeeld', color: '#0891B2', sortOrder: 4 },
      { code: 'approved', label: 'Goedgekeurd', color: '#16A34A', sortOrder: 5 },
      { code: 'completed', label: 'Afgerond', color: '#15803D', sortOrder: 6 },
      { code: 'cancelled', label: 'Geannuleerd', color: '#DC2626', sortOrder: 7 },
    ],
  },
  {
    model: 'assetStatusType',
    label: 'Asset-statussen',
    rows: [
      { code: 'new', label: 'Nieuw', color: '#6B7280', sortOrder: 0 },
      { code: 'in_progress', label: 'In uitvoering', color: '#D97706', sortOrder: 1 },
      { code: 'completed', label: 'Afgerond', color: '#16A34A', sortOrder: 2 },
      { code: 'rejected', label: 'Afgekeurd', color: '#DC2626', sortOrder: 3 },
      { code: 'not_applicable', label: 'Niet van toepassing', color: '#9CA3AF', sortOrder: 4 },
    ],
  },
  {
    model: 'findingStatusType',
    label: 'Constatering-statussen',
    rows: [
      { code: 'open', label: 'Open', color: '#DC2626', sortOrder: 0 },
      { code: 'acknowledged', label: 'Erkend', color: '#D97706', sortOrder: 1 },
      { code: 'resolved', label: 'Opgelost', color: '#16A34A', sortOrder: 2 },
      { code: 'disputed', label: 'Betwist', color: '#7C3AED', sortOrder: 3 },
    ],
  },
  {
    model: 'reportStatusType',
    label: 'Rapport-statussen',
    rows: [
      { code: 'draft', label: 'Concept', color: '#6B7280', sortOrder: 0 },
      { code: 'generating', label: 'Wordt gegenereerd', color: '#D97706', sortOrder: 1 },
      { code: 'generated', label: 'Gegenereerd', color: '#0891B2', sortOrder: 2 },
      { code: 'approved', label: 'Goedgekeurd', color: '#16A34A', sortOrder: 3 },
      { code: 'sent', label: 'Verzonden', color: '#2563EB', sortOrder: 4 },
      { code: 'archived', label: 'Gearchiveerd', color: '#9CA3AF', sortOrder: 5 },
    ],
  },
  {
    model: 'signatoryTypeOption',
    label: 'Ondertekenaar-types',
    rows: [
      { code: 'inspector', label: 'Inspecteur', color: '#2563EB', sortOrder: 0 },
      { code: 'reviewer', label: 'Beoordelaar', color: '#0891B2', sortOrder: 1 },
      { code: 'client', label: 'Opdrachtgever', color: '#16A34A', sortOrder: 2 },
      { code: 'installation_responsible', label: 'Installatieverantwoordelijke', color: '#CA8A04', sortOrder: 3 },
    ],
  },
  {
    model: 'signerRoleOption',
    label: 'Ondertekenaar-rollen',
    rows: [
      { code: 'INSPECTOR', label: 'Inspecteur', color: '#2563EB', sortOrder: 0 },
      { code: 'REVIEWER', label: 'Beoordelaar', color: '#0891B2', sortOrder: 1 },
      { code: 'CLIENT', label: 'Opdrachtgever', color: '#16A34A', sortOrder: 2 },
      { code: 'INSTALLATION_RESPONSIBLE', label: 'Installatieverantwoordelijke', color: '#CA8A04', sortOrder: 3 },
    ],
  },
  {
    model: 'passFailStatusType',
    label: 'Goed/afkeur-statussen',
    rows: [
      { code: 'PASS', label: 'Voldoet', color: '#16A34A', sortOrder: 0 },
      { code: 'FAIL', label: 'Voldoet niet', color: '#DC2626', sortOrder: 1 },
      { code: 'WARNING', label: 'Aandachtspunt', color: '#D97706', sortOrder: 2 },
      { code: 'NOT_APPLICABLE', label: 'Niet van toepassing', color: '#9CA3AF', sortOrder: 3 },
    ],
  },
  {
    model: 'resolutionStatusType',
    label: 'Oplossing-statussen',
    rows: [
      { code: 'PENDING_VERIFICATION', label: 'Wacht op verificatie', color: '#D97706', sortOrder: 0 },
      { code: 'VERIFIED', label: 'Geverifieerd', color: '#16A34A', sortOrder: 1 },
      { code: 'REJECTED', label: 'Afgewezen', color: '#DC2626', sortOrder: 2 },
    ],
  },
  {
    model: 'clientRequestTypeOption',
    label: 'Klantverzoek-types',
    rows: [
      { code: 'REINSPECTION', label: 'Herinspectie', color: '#7C3AED', sortOrder: 0 },
      { code: 'NEW_ASSIGNMENT', label: 'Nieuwe opdracht', color: '#2563EB', sortOrder: 1 },
      { code: 'QUESTION', label: 'Vraag', color: '#0891B2', sortOrder: 2 },
      { code: 'OTHER', label: 'Overig', color: '#9CA3AF', sortOrder: 3 },
    ],
  },
  {
    model: 'clientRequestStatusType',
    label: 'Klantverzoek-statussen',
    rows: [
      { code: 'PENDING_REQUEST', label: 'Open', color: '#D97706', sortOrder: 0 },
      { code: 'IN_PROGRESS_REQUEST', label: 'In behandeling', color: '#2563EB', sortOrder: 1 },
      { code: 'COMPLETED_REQUEST', label: 'Afgehandeld', color: '#16A34A', sortOrder: 2 },
      { code: 'CANCELLED_REQUEST', label: 'Geannuleerd', color: '#DC2626', sortOrder: 3 },
    ],
  },
];

/**
 * Seed de globale lookup-defaults: orgId null, isSystem true.
 *
 * De seed-cleanup leegt deze tabellen vooraf, dus createMany volstaat en
 * vermijdt de bekende valkuil van upsert op een nullable composite-unique
 * (SQL behandelt NULL als distinct, waardoor org-null rijen niet uniek matchen).
 */
export async function seedInspectionLookups(prisma: PrismaClient): Promise<void> {
  for (const set of LOOKUP_SETS) {
    const delegate = (prisma as any)[set.model];
    await delegate.createMany({
      data: set.rows.map((row) => ({
        orgId: null,
        code: row.code,
        label: row.label,
        color: row.color ?? null,
        sortOrder: row.sortOrder,
        isActive: true,
        isSystem: true,
      })),
    });
  }
}
