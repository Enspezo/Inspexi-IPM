// Bouwt de compacte JSON-payload voor de AI-voorcontrole (PRD-13 §13.6.2):
// plan-metadata + assets in scope (checklists/metingen/meetstaten/findings)
// + de platte tekst van het laatste REPORT-document. Foto's/binaire content
// gaan bewust NIET mee (kosten/privacy); wel metadata (foto-aantallen).
//
// Leest InspectionPlan/GeneratedDocument rechtstreeks via Prisma — geen
// afhankelijkheid van andere feature-services (voorkomt module-cycles).

import { Injectable } from '@nestjs/common';
import { DocumentType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound } from '@/common';

/** Max tekens van de rapporttekst (PRD: ~40k). */
export const REPORT_MAX_CHARS = 40_000;
/** Harde bovengrens op de totale JSON-payload (PRD: ~100k). */
export const TOTAL_MAX_CHARS = 100_000;
/** Truncatie-marker zodat de AI weet dat er is afgekapt. */
export const TRUNCATION_MARKER = '\n\n[… ingekort: de rest van het rapport is afgekapt …]';
const CHECKLIST_TRUNCATED = '[ingekort: checklist-antwoorden weggelaten wegens payload-limiet]';

export interface AiReviewInput {
  /** De volledige JSON-payload (string) voor het user-bericht. */
  payloadJson: string;
  /** Norm-code van het plan (voor de norm-contextlaag in de prompt). */
  normTypeCode: string;
  /** Id van het meegenomen REPORT-document; null wanneer er (nog) geen is. */
  generatedDocumentId: string | null;
  /** Id's die in de input voorkomen — alleen deze mag de AI terugverwijzen. */
  knownAssetNodeIds: Set<string>;
  knownFindingIds: Set<string>;
  knownMeasurementIds: Set<string>;
  reportTruncated: boolean;
  totalTruncated: boolean;
}

interface AssetRow {
  id: string;
  type_code: string;
  node_number: string | null;
  name: string;
  identifier: string | null;
  description: string | null;
  status: string;
}

/** HTML → platte tekst voor de rapport-laag (tiptap/Handlebars-output). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

@Injectable()
export class AiReviewInputBuilder {
  constructor(private readonly prisma: PrismaService) {}

  async build(planId: string, orgId: string): Promise<AiReviewInput> {
    const plan = assertFound(
      await this.prisma.inspectionPlan.findFirst({
        where: { id: planId, orgId, deletedAt: null },
        include: {
          contact: { select: { companyName: true, firstName: true, lastName: true } },
          assignedUser: { select: { firstName: true, lastName: true } },
          location: { select: { name: true } },
          scopeLocations: {
            include: { assetNode: { select: { id: true, name: true, nodeNumber: true } } },
          },
        },
      }),
      'Inspectieplan',
    );

    const [assets, visualInspections, measurementRecords, sheetRecords, findings, report] =
      await Promise.all([
        this.loadScopeAssets(plan.locationId, orgId),
        this.prisma.visualInspection.findMany({
          where: { inspectionPlanId: planId, deletedAt: null },
          select: { id: true, assetNodeId: true, status: true, checklistResults: true },
        }),
        this.prisma.measurementRecord.findMany({
          where: { inspectionPlanId: planId, deletedAt: null },
          select: { id: true, assetNodeId: true, status: true, measurements: true },
        }),
        this.prisma.measurementSheetRecord.findMany({
          where: { inspectionPlanId: planId, deletedAt: null },
          select: {
            id: true,
            assetNodeId: true,
            data: true,
            finalCheckExecuted: true,
            finalCheckPassed: true,
            template: { select: { code: true, name: true } },
          },
        }),
        this.prisma.finding.findMany({
          where: { inspectionPlanId: planId, deletedAt: null },
          select: {
            id: true,
            assetNodeId: true,
            shortDescription: true,
            longDescription: true,
            classificationValues: true,
            recommendation: true,
            normReference: true,
            statusCode: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.generatedDocument.findFirst({
          where: { inspectionPlanId: planId, orgId, documentType: DocumentType.REPORT },
          orderBy: { generatedAt: 'desc' },
          select: { id: true, htmlContent: true, editedContent: true },
        }),
      ]);

    // Foto-metadata: aantal foto's per finding (de foto's zelf gaan niet mee).
    const photoCounts = findings.length
      ? await this.prisma.photo.groupBy({
          by: ['entityId'],
          where: {
            deletedAt: null,
            entityType: 'finding',
            entityId: { in: findings.map((f) => f.id) },
          },
          _count: { _all: true },
        })
      : [];
    const photosByFinding = new Map(photoCounts.map((p) => [p.entityId, p._count._all]));

    // Uitvoeringsdata per asset groeperen; execution-records op nodes buiten de
    // (geladen) boom blijven zichtbaar via een synthetische asset-entry.
    const assetsById = new Map(assets.map((a) => [a.id, this.mapAsset(a)]));
    const assetFor = (assetNodeId: string) => {
      let entry = assetsById.get(assetNodeId);
      if (!entry) {
        entry = this.mapAsset({
          id: assetNodeId,
          type_code: 'onbekend',
          node_number: null,
          name: 'Onbekende asset (buiten de geladen boom)',
          identifier: null,
          description: null,
          status: 'onbekend',
        });
        assetsById.set(assetNodeId, entry);
      }
      return entry;
    };
    for (const vi of visualInspections) {
      assetFor(vi.assetNodeId).checklists.push({
        id: vi.id,
        status: vi.status,
        resultaten: vi.checklistResults as unknown,
      });
    }
    for (const mr of measurementRecords) {
      assetFor(mr.assetNodeId).metingen.push({
        id: mr.id,
        status: mr.status,
        metingen: mr.measurements as unknown,
      });
    }
    for (const sr of sheetRecords) {
      assetFor(sr.assetNodeId).meetstaten.push({
        id: sr.id,
        template: `${sr.template.code} — ${sr.template.name}`,
        eindcontroleUitgevoerd: sr.finalCheckExecuted,
        eindcontroleGeslaagd: sr.finalCheckPassed,
        data: sr.data as unknown,
      });
    }
    for (const f of findings) {
      assetFor(f.assetNodeId).findings.push({
        id: f.id,
        omschrijving: f.shortDescription,
        toelichting: f.longDescription,
        classificatie: f.classificationValues as unknown,
        aanbeveling: f.recommendation,
        normverwijzing: f.normReference,
        status: f.statusCode,
        fotoAantal: photosByFinding.get(f.id) ?? 0,
      });
    }

    const contactName =
      plan.contact.companyName ||
      [plan.contact.firstName, plan.contact.lastName].filter(Boolean).join(' ') ||
      'Onbekend';

    let reportTruncated = false;
    let reportText: string | null = null;
    if (report) {
      reportText = htmlToText(report.editedContent ?? report.htmlContent);
      if (reportText.length > REPORT_MAX_CHARS) {
        reportText = reportText.slice(0, REPORT_MAX_CHARS) + TRUNCATION_MARKER;
        reportTruncated = true;
      }
    }

    const payload = {
      plan: {
        id: plan.id,
        projectNaam: plan.projectName,
        referentie: plan.referenceNumber,
        normType: plan.normTypeCode,
        inspectieType: plan.inspectionTypeCode,
        status: plan.statusCode,
        opdrachtgever: contactName,
        inspecteur: plan.assignedUser
          ? `${plan.assignedUser.firstName} ${plan.assignedUser.lastName}`
          : null,
        geplandeDatum: plan.plannedDate,
        gestartOp: plan.startedAt,
        ingediendOp: plan.submittedAt,
        hoofdlocatie: plan.location?.name ?? null,
        scopeDeellocaties: plan.scopeLocations.map((s) => ({
          assetNodeId: s.assetNode.id,
          nodeNumber: s.assetNode.nodeNumber,
          naam: s.assetNode.name,
        })),
      },
      assets: [...assetsById.values()],
      rapport: report
        ? { generatedDocumentId: report.id, ingekort: reportTruncated, tekst: reportText }
        : null,
    };

    let payloadJson = JSON.stringify(payload);
    let totalTruncated = false;

    // Bij overschrijding van de totale limiet: eerst het rapport verder inkorten…
    if (payloadJson.length > TOTAL_MAX_CHARS && payload.rapport?.tekst) {
      const overshoot = payloadJson.length - TOTAL_MAX_CHARS;
      const keep = Math.max(0, payload.rapport.tekst.length - overshoot - TRUNCATION_MARKER.length);
      payload.rapport.tekst = payload.rapport.tekst.slice(0, keep) + TRUNCATION_MARKER;
      payload.rapport.ingekort = true;
      reportTruncated = true;
      payloadJson = JSON.stringify(payload);
    }
    // …dan de checklist-antwoorden.
    if (payloadJson.length > TOTAL_MAX_CHARS) {
      for (const asset of payload.assets) {
        for (const checklist of asset.checklists) checklist.resultaten = CHECKLIST_TRUNCATED;
      }
      totalTruncated = true;
      payloadJson = JSON.stringify(payload);
    }

    return {
      payloadJson,
      normTypeCode: plan.normTypeCode,
      generatedDocumentId: report?.id ?? null,
      knownAssetNodeIds: new Set(assetsById.keys()),
      knownFindingIds: new Set(findings.map((f) => f.id)),
      knownMeasurementIds: new Set([
        ...measurementRecords.map((m) => m.id),
        ...sheetRecords.map((s) => s.id),
      ]),
      reportTruncated,
      totalTruncated,
    };
  }

  private mapAsset(row: AssetRow) {
    return {
      assetNodeId: row.id,
      nodeNumber: row.node_number,
      naam: row.name,
      typeCode: row.type_code,
      identifier: row.identifier,
      omschrijving: row.description,
      status: row.status,
      checklists: [] as Array<{ id: string; status: string; resultaten: unknown }>,
      metingen: [] as Array<{ id: string; status: string; metingen: unknown }>,
      meetstaten: [] as Array<{
        id: string;
        template: string;
        eindcontroleUitgevoerd: boolean;
        eindcontroleGeslaagd: boolean | null;
        data: unknown;
      }>,
      findings: [] as Array<{
        id: string;
        omschrijving: string;
        toelichting: string | null;
        classificatie: unknown;
        aanbeveling: string | null;
        normverwijzing: string | null;
        status: string;
        fotoAantal: number;
      }>,
    };
  }

  /**
   * ASSET-nodes in de boom van de hoofdlocatie van het plan (ltree-subtree,
   * zelfde patroon als AssetNodesService.listSubtree — hier rechtstreeks via
   * Prisma om een module-cycle te vermijden).
   */
  private async loadScopeAssets(locationId: string | null, orgId: string): Promise<AssetRow[]> {
    if (!locationId) return [];
    return this.prisma.$queryRaw<AssetRow[]>(Prisma.sql`
      SELECT n.id, n.type_code, n.node_number, n.name, n.identifier, n.description, n.status
      FROM imp_asset_nodes n
      JOIN imp_asset_nodes root
        ON root.root_location_id = ${locationId}::uuid AND root.deleted_at IS NULL
      WHERE n.path <@ root.path
        AND n.deleted_at IS NULL
        AND n.node_type = 'ASSET'
        AND n.org_id = ${orgId}::uuid
      ORDER BY n.path
    `);
  }
}
