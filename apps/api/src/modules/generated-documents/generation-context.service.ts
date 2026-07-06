// Bouwt de genormaliseerde render-context (`DocumentData`) voor een inspectieplan.
// Alle Prisma-query's / context-opbouw voor generated-documents zitten hier; de
// lifecycle- en ondertekenlogica staan in de zuster-services.
//
// De DocumentContext-opbouw (`buildFullContext`) is geport uit de App-bron
// (document-generation/document-render.service.ts → gatherData) en aangepast aan het
// Beheer-schema (Contact i.p.v. client; normTypeCode/statusCode; Organization zonder adres/kvk).
//
// Selectief per template-mode: SECTIONS-templates renderen findings/meetstaten/assets via
// Handlebars en hebben de volledige context nodig; BLOCKS- en DOCX-templates negeren de
// context bewijsbaar (de block-renderer krijgt 'm niet mee, DOCX gooit vóór gebruik), dus
// halen we daarvoor alléén de plan-header op en slaan we de zware finding-/foto-/meetstaat-
// queries + hun diep-geneste includes over.

import { Injectable } from '@nestjs/common';
import { AssetNodeType, TemplateMode, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound } from '@/common';
import { AssetNodesService } from '../asset-nodes/asset-nodes.service';
import type {
  DocumentData,
  OrganizationData,
  ClientData,
  LocationData,
  PlanData,
  InspectorData,
  ReviewerData,
  AssetData,
  FindingData,
  PhotoData,
  MeasurementSheetData,
  UsedInstrumentData,
  FindingSummary,
} from '../document-generation/types';

/** Relaties voor de plan-header (org/opdrachtgever/inspecteur/controleur). */
const PLAN_HEADER_INCLUDE = {
  organization: true,
  contact: { include: { addresses: true, contactPersons: { where: { isDeleted: false } } } },
  assignedUser: true,
  reviewer: true,
} satisfies Prisma.InspectionPlanInclude;

/** Volledige relaties die `buildFullContext` nodig heeft (SECTIONS-render). */
const PLAN_FULL_INCLUDE = {
  ...PLAN_HEADER_INCLUDE,
  inspectionTemplate: {
    include: {
      classificationModel: { include: { characteristics: { include: { options: true } } } },
    },
  },
  measurementSheetRecords: { include: { template: true, assetNode: true } },
} satisfies Prisma.InspectionPlanInclude;

type PlanHeader = Prisma.InspectionPlanGetPayload<{ include: typeof PLAN_HEADER_INCLUDE }>;
type PlanWithRelations = Prisma.InspectionPlanGetPayload<{ include: typeof PLAN_FULL_INCLUDE }>;
type FindingRow = Prisma.FindingGetPayload<true>;
type SheetRecordRow = Prisma.MeasurementSheetRecordGetPayload<{ include: { template: true } }>;

/**
 * Geassembleerde asset (oude `plan.assets`-vorm) — de losse Asset-tabel is opgegaan
 * in de AssetNode-boom (Fase 2b). We bouwen deze vorm in `buildFullContext` op uit de
 * ASSET-nodes van de boom + de findings/meetstaten die `inspectionPlanId` dragen.
 */
interface AssetWithRelations {
  id: string;
  name: string;
  assetType: string;
  identifier: string | null;
  locationDescription: string | null;
  statusCode: string;
  parentAssetId: string | null;
  technicalData: Prisma.JsonValue;
  findings: FindingRow[];
  measurementSheetRecords: SheetRecordRow[];
}
type ClassificationModelLite = {
  characteristics: Array<{ code: string; options: Array<{ code: string; name: string; color: string }> }>;
} | null;

@Injectable()
export class GenerationContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetNodes: AssetNodesService,
  ) {}

  /** Lite lookup: de `inspectionTemplateId` van een (org-scoped) plan — nodig om de
   * document-template en dus de template-mode te bepalen vóór de context-opbouw. */
  async getPlanInspectionTemplateId(planId: string, orgId: string): Promise<string | null> {
    const plan = assertFound(
      await this.prisma.inspectionPlan.findFirst({
        where: { id: planId, orgId, deletedAt: null },
        select: { inspectionTemplateId: true },
      }),
      'Inspectieplan',
    );
    return plan.inspectionTemplateId;
  }

  /**
   * Bouwt de render-context voor een plan, selectief per template-mode.
   * SECTIONS → volledige context; BLOCKS/DOCX → alleen de header (context wordt genegeerd).
   */
  async buildForPlan(planId: string, orgId: string, mode: TemplateMode): Promise<DocumentData> {
    if (mode === TemplateMode.SECTIONS) {
      const plan = assertFound(
        await this.prisma.inspectionPlan.findFirst({
          where: { id: planId, orgId, deletedAt: null },
          include: PLAN_FULL_INCLUDE,
        }),
        'Inspectieplan',
      );
      return this.buildFullContext(plan);
    }

    const plan = assertFound(
      await this.prisma.inspectionPlan.findFirst({
        where: { id: planId, orgId, deletedAt: null },
        include: PLAN_HEADER_INCLUDE,
      }),
      'Inspectieplan',
    );
    return this.buildHeaderContext(plan);
  }

  // ── Header (gedeeld door beide modes) ──────────────────
  private async buildPlanHeader(plan: PlanHeader): Promise<{
    organization: OrganizationData;
    client: ClientData;
    location: LocationData;
    plan: PlanData;
    inspector: InspectorData;
    reviewer?: ReviewerData;
  }> {
    // Norm-type label.
    const normType = await this.prisma.normTypeDefinition.findFirst({
      where: { code: plan.normTypeCode },
    });

    // Organisatie (Beheer-Organization heeft geen adres/kvk/telefoon).
    const org = plan.organization;
    const organization: OrganizationData = {
      name: org.name,
      logo: org.logoUrl || undefined,
      email: org.senderEmail || undefined,
    };

    // Opdrachtgever uit Contact (COMPANY → companyName; INDIVIDUAL → voor/achternaam).
    const contact = plan.contact;
    const primaryAddress = contact.addresses.find((a) => a.isPrimary) ?? contact.addresses[0];
    const primaryPerson = contact.contactPersons[0];
    const contactName =
      contact.companyName ||
      [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
      'Onbekend';
    const client: ClientData = {
      name: contactName,
      contactPerson: primaryPerson
        ? `${primaryPerson.firstName} ${primaryPerson.lastName}`
        : undefined,
      address: primaryAddress
        ? [primaryAddress.street, primaryAddress.houseNumber].filter(Boolean).join(' ')
        : undefined,
      postalCode: primaryAddress?.postalCode || undefined,
      city: primaryAddress?.city || undefined,
      phone: contact.phone || primaryPerson?.phone || undefined,
      email: contact.email || primaryPerson?.email || undefined,
    };

    const location: LocationData = {
      name: plan.projectName,
      address: [plan.addressStreet, plan.addressHouseNumber].filter(Boolean).join(' '),
      postalCode: plan.addressPostalCode || undefined,
      city: plan.addressCity || undefined,
    };

    const planData: PlanData = {
      id: plan.id,
      reference: plan.referenceNumber || plan.id.substring(0, 8).toUpperCase(),
      projectName: plan.projectName,
      date: plan.startedAt || plan.plannedDate || plan.createdAt,
      plannedDate: plan.plannedDate || undefined,
      scope: plan.description || undefined,
      description: plan.description || undefined,
      normType: plan.normTypeCode,
      normTypeName: normType?.label || plan.normTypeCode,
      status: plan.statusCode,
    };

    const inspector: InspectorData = plan.assignedUser
      ? { name: `${plan.assignedUser.firstName} ${plan.assignedUser.lastName}`, email: plan.assignedUser.email }
      : { name: 'Niet toegewezen' };
    const reviewer: ReviewerData | undefined = plan.reviewer
      ? { name: `${plan.reviewer.firstName} ${plan.reviewer.lastName}`, email: plan.reviewer.email }
      : undefined;

    return { organization, client, location, plan: planData, inspector, reviewer };
  }

  /** Minimale context voor modes die de context negeren (BLOCKS/DOCX): header + lege lijsten. */
  private async buildHeaderContext(plan: PlanHeader): Promise<DocumentData> {
    const header = await this.buildPlanHeader(plan);
    const now = new Date();
    return {
      ...header,
      assets: [],
      findings: [],
      findingsSummary: { total: 0, byClassification: {}, byStatus: {} },
      measurementSheets: [],
      currentDate: now,
      generatedAt: now,
    };
  }

  // ── DocumentContext-opbouw (geport uit App-bron, aangepast aan Beheer-schema) ──
  private async buildFullContext(plan: PlanWithRelations): Promise<DocumentData> {
    const header = await this.buildPlanHeader(plan);
    const planAssets = await this.assemblePlanAssets(plan);

    // Foto's voor assets + findings ophalen en per entiteit groeperen.
    const assetIds = planAssets.map((a) => a.id);
    const findingIds = planAssets.flatMap((a) => a.findings.map((f) => f.id));
    const photos = await this.prisma.photo.findMany({
      where: {
        deletedAt: null,
        OR: [
          { entityType: 'asset', entityId: { in: assetIds } },
          { entityType: 'finding', entityId: { in: findingIds } },
        ],
      },
      orderBy: { sortOrder: 'asc' },
    });
    const photosByEntity = new Map<string, PhotoData[]>();
    for (const photo of photos) {
      const key = `${photo.entityType}:${photo.entityId}`;
      const arr = photosByEntity.get(key) ?? [];
      arr.push({
        id: photo.id,
        url: `/api/v1/photos/${photo.id}/download`,
        thumbnailUrl: `/api/v1/photos/${photo.id}/download?thumb=1`,
        caption: photo.caption || undefined,
        capturedAt: photo.capturedAt || undefined,
      });
      photosByEntity.set(key, arr);
    }

    const classificationModel = (plan.inspectionTemplate?.classificationModel ??
      null) as ClassificationModelLite;
    const assets = this.buildAssetTree(planAssets, photosByEntity, classificationModel);
    const findings = planAssets.flatMap((asset) =>
      asset.findings.map((f) => this.mapFinding(f, asset, photosByEntity, classificationModel)),
    );
    const findingsSummary = this.buildFindingsSummary(findings);

    const measurementSheets = await this.buildMeasurementSheets(plan, header.inspector);

    const now = new Date();
    return {
      ...header,
      assets,
      findings,
      findingsSummary,
      measurementSheets,
      currentDate: now,
      generatedAt: now,
    };
  }

  /**
   * Assembleert de oude `plan.assets`-vorm uit de AssetNode-boom (Fase 2b): alle
   * ASSET-nodes onder `plan.locationId`, met de findings/meetstaten die
   * `inspectionPlanId = plan.id` dragen eronder gegroepeerd.
   */
  private async assemblePlanAssets(plan: PlanWithRelations): Promise<AssetWithRelations[]> {
    const nodes = plan.locationId
      ? await this.assetNodes.listLocationNodesByOrg(
          plan.locationId,
          plan.orgId,
          AssetNodeType.ASSET,
        )
      : [];
    if (!nodes.length) return [];

    const [findings, sheetRecords] = await Promise.all([
      this.prisma.finding.findMany({
        where: { inspectionPlanId: plan.id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.measurementSheetRecord.findMany({
        where: { inspectionPlanId: plan.id },
        include: { template: true },
      }),
    ]);

    const findingsByNode = new Map<string, FindingRow[]>();
    for (const f of findings) {
      (findingsByNode.get(f.assetNodeId) ?? findingsByNode.set(f.assetNodeId, []).get(f.assetNodeId)!).push(f);
    }
    const sheetsByNode = new Map<string, SheetRecordRow[]>();
    for (const r of sheetRecords) {
      (sheetsByNode.get(r.assetNodeId) ?? sheetsByNode.set(r.assetNodeId, []).get(r.assetNodeId)!).push(r);
    }

    return nodes.map((n) => ({
      id: n.id,
      name: n.name,
      assetType: n.typeCode,
      identifier: n.identifier,
      locationDescription: n.description,
      statusCode: n.statusCode,
      parentAssetId: n.parentId,
      technicalData: n.technicalData,
      findings: findingsByNode.get(n.id) ?? [],
      measurementSheetRecords: sheetsByNode.get(n.id) ?? [],
    }));
  }

  private async buildMeasurementSheets(
    plan: PlanWithRelations,
    inspector: InspectorData,
  ): Promise<MeasurementSheetData[]> {
    // Gebruikte meetmiddelen: snapshot-first (historische juistheid); val terug op
    // één batch-query op de live meetmiddelen voor records zonder snapshot.
    const fallbackIds = [
      ...new Set(
        plan.measurementSheetRecords
          .filter((r) => !this.readInstrumentSnapshot(r.data))
          .flatMap((r) => r.usedInstrumentIds ?? []),
      ),
    ];
    const liveInstruments = fallbackIds.length
      ? await this.prisma.measurementInstrument.findMany({
          where: { id: { in: fallbackIds }, orgId: plan.orgId },
          select: {
            id: true,
            code: true,
            brand: true,
            type: true,
            serialNumber: true,
            lastCalibrationDate: true,
            nextCalibrationDue: true,
          },
        })
      : [];
    const liveById = new Map(liveInstruments.map((i) => [i.id, i]));

    return plan.measurementSheetRecords.map((record) => ({
      id: record.id,
      name: record.template.name,
      templateCode: record.template.code,
      assetId: record.assetNodeId || undefined,
      assetName: record.assetNode?.name || undefined,
      date: record.completedAt || record.createdAt,
      inspector: inspector.name,
      sections: this.parseMeasurementData(record.data as Record<string, unknown>),
      usedInstruments:
        this.readInstrumentSnapshot(record.data) ??
        (record.usedInstrumentIds ?? [])
          .map((id) => liveById.get(id))
          .filter((i): i is NonNullable<typeof i> => Boolean(i))
          .map((i) => ({
            id: i.id,
            code: i.code,
            brand: i.brand,
            type: i.type,
            serialNumber: i.serialNumber,
            lastCalibrationDate: i.lastCalibrationDate,
            nextCalibrationDue: i.nextCalibrationDue,
          })),
    }));
  }

  private buildAssetTree(
    assets: AssetWithRelations[],
    photosByEntity: Map<string, PhotoData[]>,
    classificationModel: ClassificationModelLite,
  ): AssetData[] {
    const assetMap = new Map<string, AssetData>();
    for (const asset of assets) {
      assetMap.set(asset.id, {
        id: asset.id,
        name: asset.name,
        type: asset.assetType,
        typeName: asset.assetType,
        identifier: asset.identifier || undefined,
        locationDescription: asset.locationDescription || undefined,
        status: asset.statusCode,
        photos: photosByEntity.get(`asset:${asset.id}`) || [],
        findings: asset.findings.map((f) => this.mapFinding(f, asset, photosByEntity, classificationModel)),
        measurements: this.aggregateMeasurements(asset.measurementSheetRecords),
        technicalData: asset.technicalData as Record<string, unknown>,
        children: [],
      });
    }

    const rootAssets: AssetData[] = [];
    for (const asset of assets) {
      const assetData = assetMap.get(asset.id)!;
      if (asset.parentAssetId && assetMap.has(asset.parentAssetId)) {
        assetMap.get(asset.parentAssetId)!.children!.push(assetData);
      } else {
        rootAssets.push(assetData);
      }
    }
    return rootAssets;
  }

  private mapFinding(
    finding: FindingRow,
    asset: { id: string; name: string; locationDescription: string | null },
    photosByEntity: Map<string, PhotoData[]>,
    classificationModel: ClassificationModelLite,
  ): FindingData {
    const classValues = finding.classificationValues as Record<string, string> | null;
    const classification = this.getMainClassification(classValues, classificationModel);
    return {
      id: finding.id,
      reference: finding.normReference || undefined,
      shortDescription: finding.shortDescription,
      longDescription: finding.longDescription || undefined,
      classification: classification.code,
      classificationColor: classification.color,
      classificationName: classification.name,
      assetId: asset.id,
      assetName: asset.name,
      locationDescription: finding.locationDescription || asset.locationDescription || undefined,
      photos: photosByEntity.get(`finding:${finding.id}`) || [],
      recommendation: finding.recommendation || undefined,
      status: finding.statusCode,
      normReference: finding.normReference || undefined,
    };
  }

  private getMainClassification(
    classificationValues: Record<string, string> | null,
    classificationModel: ClassificationModelLite,
  ): { code: string; name: string; color: string } {
    if (!classificationValues || Object.keys(classificationValues).length === 0) {
      return { code: '-', name: 'Niet geclassificeerd', color: '#666666' };
    }
    const mainCharCode =
      Object.keys(classificationValues).find((k) =>
        ['CLASSIFICATIE', 'RISICO', 'SEVERITY', 'PRIORITEIT'].includes(k.toUpperCase()),
      ) ?? Object.keys(classificationValues)[0];
    const code = classificationValues[mainCharCode];

    if (classificationModel) {
      const characteristic = classificationModel.characteristics.find((c) => c.code === mainCharCode);
      const option = characteristic?.options.find((o) => o.code === code);
      if (option) return { code, name: option.name, color: option.color };
    }

    const defaultColors: Record<string, string> = {
      '1': '#dc2626',
      '2': '#ea580c',
      '3': '#ca8a04',
      '4': '#16a34a',
      A: '#dc2626',
      B: '#ea580c',
      C: '#ca8a04',
      D: '#2563eb',
      E: '#16a34a',
    };
    return { code, name: code, color: defaultColors[code] || '#666666' };
  }

  private aggregateMeasurements(records: Array<{ data: Prisma.JsonValue }>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const record of records) {
      const formData = record.data as Record<string, unknown> | null;
      if (formData) Object.assign(result, formData);
    }
    return result;
  }

  /** Leest het ingebakken meetmiddel-snapshot uit record.data (of null). */
  private readInstrumentSnapshot(data: unknown): UsedInstrumentData[] | null {
    const snap = (data as Record<string, unknown> | null)?.__usedInstrumentsSnapshot;
    return Array.isArray(snap) ? (snap as UsedInstrumentData[]) : null;
  }

  private parseMeasurementData(
    formData: Record<string, unknown>,
  ): Array<{ name: string; fields: Record<string, unknown> }> {
    if (formData && Array.isArray(formData.sections)) {
      return formData.sections as Array<{ name: string; fields: Record<string, unknown> }>;
    }
    return [{ name: 'Meetgegevens', fields: formData ?? {} }];
  }

  private buildFindingsSummary(findings: FindingData[]): FindingSummary {
    const byClassification: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const finding of findings) {
      byClassification[finding.classification] = (byClassification[finding.classification] || 0) + 1;
      byStatus[finding.status] = (byStatus[finding.status] || 0) + 1;
    }
    return { total: findings.length, byClassification, byStatus };
  }
}
