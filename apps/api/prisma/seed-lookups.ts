import { PrismaClient } from '@prisma/client';

const GRAY = '#6B7280';
const BLUE = '#3B82F6';
const AMBER = '#F59E0B';
const ORANGE = '#F97316';
const GREEN = '#16A34A';
const RED = '#DC2626';

type Row = { code: string; label: string; color: string | null; sortOrder: number };

const sys = (rows: Row[]) =>
  rows.map((r) => ({ ...r, isActive: true, isSystem: true })); // orgId blijft null (default)

export async function seedLookups(prisma: PrismaClient): Promise<void> {
  // 1. Inspectietypes
  await prisma.inspectionTypeOption.deleteMany({ where: { orgId: null } });
  await prisma.inspectionTypeOption.createMany({
    data: sys([
      { code: 'initial', label: 'Eerste inspectie', color: BLUE, sortOrder: 10 },
      { code: 'periodic', label: 'Periodieke inspectie', color: BLUE, sortOrder: 20 },
      { code: 'modification', label: 'Wijzigingsinspectie', color: BLUE, sortOrder: 30 },
      { code: 'reinspection', label: 'Herinspectie', color: BLUE, sortOrder: 40 },
    ]),
  });

  // 2. Inspectieplan-status
  await prisma.planStatusType.deleteMany({ where: { orgId: null } });
  await prisma.planStatusType.createMany({
    data: sys([
      { code: 'draft', label: 'Concept', color: GRAY, sortOrder: 10 },
      { code: 'planned', label: 'Gepland', color: BLUE, sortOrder: 20 },
      { code: 'in_progress', label: 'Mee bezig', color: AMBER, sortOrder: 30 },
      { code: 'pending_review', label: 'Wacht op review', color: ORANGE, sortOrder: 40 },
      { code: 'reviewed', label: 'Beoordeeld', color: BLUE, sortOrder: 50 },
      { code: 'approved', label: 'Goedgekeurd', color: GREEN, sortOrder: 60 },
      { code: 'completed', label: 'Afgerond', color: GREEN, sortOrder: 70 },
      { code: 'cancelled', label: 'Geannuleerd', color: RED, sortOrder: 80 },
    ]),
  });

  // 3. Asset-status
  await prisma.assetStatusType.deleteMany({ where: { orgId: null } });
  await prisma.assetStatusType.createMany({
    data: sys([
      { code: 'new', label: 'Nieuw', color: GRAY, sortOrder: 10 },
      { code: 'in_progress', label: 'Mee bezig', color: AMBER, sortOrder: 20 },
      { code: 'completed', label: 'Voltooid', color: GREEN, sortOrder: 30 },
      { code: 'rejected', label: 'Afgekeurd', color: RED, sortOrder: 40 },
      { code: 'not_applicable', label: 'N.v.t.', color: GRAY, sortOrder: 50 },
    ]),
  });

  // 4. Constatering-status
  await prisma.findingStatusType.deleteMany({ where: { orgId: null } });
  await prisma.findingStatusType.createMany({
    data: sys([
      { code: 'open', label: 'Open', color: RED, sortOrder: 10 },
      { code: 'acknowledged', label: 'Erkend', color: AMBER, sortOrder: 20 },
      { code: 'resolved', label: 'Opgelost', color: GREEN, sortOrder: 30 },
      { code: 'disputed', label: 'Betwist', color: ORANGE, sortOrder: 40 },
    ]),
  });

  // 5. Rapport-status
  await prisma.reportStatusType.deleteMany({ where: { orgId: null } });
  await prisma.reportStatusType.createMany({
    data: sys([
      { code: 'draft', label: 'Concept', color: GRAY, sortOrder: 10 },
      { code: 'generating', label: 'Genereren', color: BLUE, sortOrder: 20 },
      { code: 'generated', label: 'Gegenereerd', color: BLUE, sortOrder: 30 },
      { code: 'approved', label: 'Goedgekeurd', color: GREEN, sortOrder: 40 },
      { code: 'sent', label: 'Verstuurd', color: GREEN, sortOrder: 50 },
      { code: 'archived', label: 'Gearchiveerd', color: GRAY, sortOrder: 60 },
    ]),
  });

  // 6. Ondertekenaar-types
  await prisma.signatoryTypeOption.deleteMany({ where: { orgId: null } });
  await prisma.signatoryTypeOption.createMany({
    data: sys([
      { code: 'inspector', label: 'Inspecteur', color: BLUE, sortOrder: 10 },
      { code: 'reviewer', label: 'Beoordelaar', color: BLUE, sortOrder: 20 },
      { code: 'client', label: 'Opdrachtgever', color: GRAY, sortOrder: 30 },
      { code: 'installation_responsible', label: 'Installatieverantwoordelijke', color: GRAY, sortOrder: 40 },
    ]),
  });

  // 7. Ondertekenaar-rollen (documentondertekening)
  await prisma.signerRoleOption.deleteMany({ where: { orgId: null } });
  await prisma.signerRoleOption.createMany({
    data: sys([
      { code: 'INSPECTOR', label: 'Inspecteur', color: BLUE, sortOrder: 10 },
      { code: 'REVIEWER', label: 'Beoordelaar', color: BLUE, sortOrder: 20 },
      { code: 'CLIENT', label: 'Opdrachtgever', color: GRAY, sortOrder: 30 },
      { code: 'INSTALLATION_RESPONSIBLE', label: 'Installatieverantwoordelijke', color: GRAY, sortOrder: 40 },
    ]),
  });

  // 8. Pass/fail-status (metingen)
  await prisma.passFailStatusType.deleteMany({ where: { orgId: null } });
  await prisma.passFailStatusType.createMany({
    data: sys([
      { code: 'PASS', label: 'Goed', color: GREEN, sortOrder: 10 },
      { code: 'FAIL', label: 'Afgekeurd', color: RED, sortOrder: 20 },
      { code: 'WARNING', label: 'Aandacht', color: AMBER, sortOrder: 30 },
      { code: 'NOT_APPLICABLE', label: 'N.v.t.', color: GRAY, sortOrder: 40 },
    ]),
  });

  // 9. Afhandeling-status (constatering-resolutie door klant)
  await prisma.resolutionStatusType.deleteMany({ where: { orgId: null } });
  await prisma.resolutionStatusType.createMany({
    data: sys([
      { code: 'PENDING_VERIFICATION', label: 'Wacht op verificatie', color: AMBER, sortOrder: 10 },
      { code: 'VERIFIED', label: 'Geverifieerd', color: GREEN, sortOrder: 20 },
      { code: 'REJECTED', label: 'Afgewezen', color: RED, sortOrder: 30 },
    ]),
  });

  // 10. Verzoek-types (client-portal)
  await prisma.clientRequestTypeOption.deleteMany({ where: { orgId: null } });
  await prisma.clientRequestTypeOption.createMany({
    data: sys([
      { code: 'REINSPECTION', label: 'Herinspectie', color: BLUE, sortOrder: 10 },
      { code: 'NEW_ASSIGNMENT', label: 'Nieuwe opdracht', color: BLUE, sortOrder: 20 },
      { code: 'QUESTION', label: 'Vraag', color: GRAY, sortOrder: 30 },
      { code: 'OTHER', label: 'Overig', color: GRAY, sortOrder: 40 },
    ]),
  });

  // 11. Verzoek-status (client-portal)
  await prisma.clientRequestStatusType.deleteMany({ where: { orgId: null } });
  await prisma.clientRequestStatusType.createMany({
    data: sys([
      { code: 'PENDING_REQUEST', label: 'In afwachting', color: AMBER, sortOrder: 10 },
      { code: 'IN_PROGRESS_REQUEST', label: 'In behandeling', color: BLUE, sortOrder: 20 },
      { code: 'COMPLETED_REQUEST', label: 'Afgehandeld', color: GREEN, sortOrder: 30 },
      { code: 'CANCELLED_REQUEST', label: 'Geannuleerd', color: RED, sortOrder: 40 },
    ]),
  });

  console.log('🌱 Lookup-systeemdefaults geseed (11 tabellen)');
}
