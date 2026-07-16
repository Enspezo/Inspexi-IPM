import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma';
import {
  AiReviewInputBuilder,
  htmlToText,
  REPORT_MAX_CHARS,
  TOTAL_MAX_CHARS,
} from './ai-review-input.builder';

describe('AiReviewInputBuilder', () => {
  const prisma = {
    inspectionPlan: { findFirst: jest.fn() },
    visualInspection: { findMany: jest.fn() },
    measurementRecord: { findMany: jest.fn() },
    measurementSheetRecord: { findMany: jest.fn() },
    finding: { findMany: jest.fn() },
    generatedDocument: { findFirst: jest.fn() },
    photo: { groupBy: jest.fn() },
    $queryRaw: jest.fn(),
  };

  const builder = new AiReviewInputBuilder(prisma as unknown as PrismaService);

  const basePlan = {
    id: 'plan1',
    orgId: 'org1',
    locationId: 'loc1',
    projectName: 'Kantoorpand Zuidas',
    referenceNumber: 'REF-1',
    normTypeCode: 'NEN3140',
    inspectionTypeCode: 'initial',
    statusCode: 'pending_review',
    plannedDate: null,
    startedAt: null,
    submittedAt: null,
    contact: { companyName: 'Demo BV', firstName: null, lastName: null },
    assignedUser: { firstName: 'Ineke', lastName: 'Inspecteur' },
    location: { name: 'Kantoorpand Zuidas' },
    scopeLocations: [
      { assetNode: { id: 'nodeL1', name: 'Verdieping 1', nodeNumber: 'LOC-0001' } },
    ],
  };

  const assetRow = {
    id: 'asset1',
    type_code: 'verdeler',
    node_number: 'VD-0001',
    name: 'Hoofdverdeler',
    identifier: 'HV-1',
    description: null,
    status: 'inspected',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.inspectionPlan.findFirst.mockResolvedValue(basePlan);
    prisma.$queryRaw.mockResolvedValue([assetRow]);
    prisma.visualInspection.findMany.mockResolvedValue([]);
    prisma.measurementRecord.findMany.mockResolvedValue([]);
    prisma.measurementSheetRecord.findMany.mockResolvedValue([]);
    prisma.finding.findMany.mockResolvedValue([]);
    prisma.generatedDocument.findFirst.mockResolvedValue(null);
    prisma.photo.groupBy.mockResolvedValue([]);
  });

  it('gooit NotFoundException voor een onbekend/vreemd plan', async () => {
    prisma.inspectionPlan.findFirst.mockResolvedValue(null);
    await expect(builder.build('plan1', 'org1')).rejects.toThrow(NotFoundException);
  });

  it('bouwt de payload met plan, assets en known-id-sets; zonder rapport is rapport null', async () => {
    prisma.finding.findMany.mockResolvedValue([
      {
        id: 'f1',
        assetNodeId: 'asset1',
        shortDescription: 'Kapotte wartel',
        longDescription: null,
        classificationValues: {},
        recommendation: null,
        normReference: null,
        statusCode: 'open',
      },
    ]);
    prisma.measurementRecord.findMany.mockResolvedValue([
      { id: 'm1', assetNodeId: 'asset1', status: 'completed', measurements: [] },
    ]);
    prisma.measurementSheetRecord.findMany.mockResolvedValue([
      {
        id: 's1',
        assetNodeId: 'asset1',
        data: {},
        finalCheckExecuted: true,
        finalCheckPassed: true,
        template: { code: 'MS1', name: 'Meetstaat' },
      },
    ]);
    prisma.photo.groupBy.mockResolvedValue([{ entityId: 'f1', _count: { _all: 2 } }]);

    const input = await builder.build('plan1', 'org1');
    const payload = JSON.parse(input.payloadJson);

    expect(payload.plan.projectNaam).toBe('Kantoorpand Zuidas');
    expect(payload.plan.opdrachtgever).toBe('Demo BV');
    expect(payload.plan.scopeDeellocaties).toHaveLength(1);
    expect(payload.assets).toHaveLength(1);
    expect(payload.assets[0].findings[0]).toMatchObject({ id: 'f1', fotoAantal: 2 });
    expect(payload.rapport).toBeNull();

    expect(input.generatedDocumentId).toBeNull();
    expect(input.knownAssetNodeIds.has('asset1')).toBe(true);
    expect(input.knownFindingIds.has('f1')).toBe(true);
    // Meetrecords én meetstaat-records tellen als bekende meting-id's.
    expect(input.knownMeasurementIds.has('m1')).toBe(true);
    expect(input.knownMeasurementIds.has('s1')).toBe(true);
    expect(input.reportTruncated).toBe(false);
    expect(input.totalTruncated).toBe(false);
  });

  it('gebruikt editedContent boven htmlContent voor de rapporttekst', async () => {
    prisma.generatedDocument.findFirst.mockResolvedValue({
      id: 'doc1',
      htmlContent: '<p>origineel</p>',
      editedContent: '<p>bewerkt</p>',
    });
    const input = await builder.build('plan1', 'org1');
    const payload = JSON.parse(input.payloadJson);
    expect(payload.rapport.tekst).toBe('bewerkt');
    expect(payload.rapport.generatedDocumentId).toBe('doc1');
    expect(input.generatedDocumentId).toBe('doc1');
  });

  it('kort een rapport boven de rapport-limiet in met truncatie-marker', async () => {
    prisma.generatedDocument.findFirst.mockResolvedValue({
      id: 'doc1',
      htmlContent: `<p>${'x'.repeat(REPORT_MAX_CHARS + 5000)}</p>`,
      editedContent: null,
    });
    const input = await builder.build('plan1', 'org1');
    const payload = JSON.parse(input.payloadJson);
    expect(input.reportTruncated).toBe(true);
    expect(payload.rapport.ingekort).toBe(true);
    expect(payload.rapport.tekst).toContain('ingekort');
    expect(payload.rapport.tekst.length).toBeLessThan(REPORT_MAX_CHARS + 200);
  });

  it('kort bij overschrijding van de totale limiet eerst het rapport en dan de checklists in', async () => {
    // Grote checklist-antwoorden duwen de totale payload over de limiet zonder rapport.
    prisma.visualInspection.findMany.mockResolvedValue([
      {
        id: 'vi1',
        assetNodeId: 'asset1',
        status: 'completed',
        checklistResults: ['a'.repeat(TOTAL_MAX_CHARS)],
      },
    ]);
    const input = await builder.build('plan1', 'org1');
    const payload = JSON.parse(input.payloadJson);
    expect(input.totalTruncated).toBe(true);
    expect(payload.assets[0].checklists[0].resultaten).toContain('ingekort');
    expect(input.payloadJson.length).toBeLessThanOrEqual(TOTAL_MAX_CHARS);
  });

  it('maakt een synthetische asset-entry voor uitvoeringsrecords op onbekende nodes', async () => {
    prisma.finding.findMany.mockResolvedValue([
      {
        id: 'f9',
        assetNodeId: 'weesnode',
        shortDescription: 'Wees-finding',
        longDescription: null,
        classificationValues: {},
        recommendation: null,
        normReference: null,
        statusCode: 'open',
      },
    ]);
    const input = await builder.build('plan1', 'org1');
    const payload = JSON.parse(input.payloadJson);
    const synthetic = payload.assets.find((a: { assetNodeId: string }) => a.assetNodeId === 'weesnode');
    expect(synthetic).toBeDefined();
    expect(synthetic.findings).toHaveLength(1);
    expect(input.knownAssetNodeIds.has('weesnode')).toBe(true);
  });

  it('haalt geen boom op zonder locationId (assets leeg)', async () => {
    prisma.inspectionPlan.findFirst.mockResolvedValue({ ...basePlan, locationId: null });
    const input = await builder.build('plan1', 'org1');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(JSON.parse(input.payloadJson).assets).toEqual([]);
  });

  describe('htmlToText', () => {
    it('stript tags/entiteiten en behoudt regelstructuur', () => {
      expect(htmlToText('<style>p{color:red}</style><h1>Titel</h1><p>Regel &amp; twee</p>')).toBe(
        'Titel\nRegel & twee',
      );
    });
  });
});
