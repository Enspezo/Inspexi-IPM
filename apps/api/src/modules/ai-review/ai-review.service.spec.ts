import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiReviewItemStatus, AiReviewRunStatus, Role, User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { AnthropicClientService } from '@/common/services/anthropic/anthropic-client.service';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { AiReviewService } from './ai-review.service';
import { AiReviewInputBuilder, AiReviewInput } from './ai-review-input.builder';

describe('AiReviewService', () => {
  const prisma = {
    inspectionPlan: { findFirst: jest.fn() },
    organization: { findUnique: jest.fn() },
    aiReviewRun: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    aiReviewItem: { findFirst: jest.fn(), update: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const config = {
    get: jest.fn((key: string, def?: string) =>
      key === 'ANTHROPIC_REVIEW_MODEL' ? 'claude-review-test' : def,
    ),
  } as unknown as ConfigService;
  const anthropic = { isAvailable: jest.fn(), createMessage: jest.fn() };
  const entitlements = { assertFeature: jest.fn() };
  const builder = { build: jest.fn() };

  const service = new AiReviewService(
    prisma as unknown as PrismaService,
    config,
    anthropic as unknown as AnthropicClientService,
    entitlements as unknown as EntitlementsService,
    builder as unknown as AiReviewInputBuilder,
  );

  const user = { id: 'u1', orgId: 'org1', roles: [Role.MANAGER] } as User;
  const plan = { id: 'plan1', orgId: 'org1', normTypeCode: 'NEN3140' };

  const input: AiReviewInput = {
    payloadJson: '{"plan":{}}',
    normTypeCode: 'NEN3140',
    generatedDocumentId: 'doc1',
    knownAssetNodeIds: new Set(['asset1']),
    knownFindingIds: new Set(['f1']),
    knownMeasurementIds: new Set(['m1']),
    reportTruncated: false,
    totalTruncated: false,
  };

  const toolResponse = (toolInput: unknown) => ({
    content: [{ type: 'tool_use', name: 'report_review_findings', input: toolInput }],
    usage: { input_tokens: 1200, output_tokens: 340 },
  });

  /** Wacht tot de setImmediate-geplande analyse gestart is. */
  const flushImmediate = () => new Promise(setImmediate);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.inspectionPlan.findFirst.mockResolvedValue(plan);
    prisma.organization.findUnique.mockResolvedValue({
      aiReviewEnabled: true,
      aiReviewInstructions: null,
    });
    prisma.aiReviewRun.findFirst.mockResolvedValue(null);
    prisma.aiReviewRun.create.mockResolvedValue({ id: 'run1', status: AiReviewRunStatus.PENDING });
    prisma.aiReviewRun.update.mockResolvedValue({});
    prisma.aiReviewItem.createMany.mockResolvedValue({ count: 0 });
    anthropic.isAvailable.mockReturnValue(true);
    entitlements.assertFeature.mockResolvedValue(undefined);
    builder.build.mockResolvedValue(input);
  });

  describe('status', () => {
    it('geeft beschikbaarheid en het geconfigureerde model terug', () => {
      expect(service.status()).toEqual({ available: true, model: 'claude-review-test' });
    });
  });

  describe('startRun — guards', () => {
    it('gooit 404 voor een onbekend/vreemd plan', async () => {
      prisma.inspectionPlan.findFirst.mockResolvedValue(null);
      await expect(service.startRun('plan1', user)).rejects.toThrow(NotFoundException);
      expect(prisma.aiReviewRun.create).not.toHaveBeenCalled();
    });

    it('propageert de entitlement-403 (AI_REVIEW niet in abonnement)', async () => {
      entitlements.assertFeature.mockRejectedValue(new ForbiddenException('nee'));
      await expect(service.startRun('plan1', user)).rejects.toThrow(ForbiddenException);
      expect(entitlements.assertFeature).toHaveBeenCalledWith('org1', 'AI_REVIEW', expect.any(String));
      expect(prisma.aiReviewRun.create).not.toHaveBeenCalled();
    });

    it('gooit 400 wanneer de org-toggle uit staat', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        aiReviewEnabled: false,
        aiReviewInstructions: null,
      });
      await expect(service.startRun('plan1', user)).rejects.toThrow(BadRequestException);
      expect(prisma.aiReviewRun.create).not.toHaveBeenCalled();
    });

    it('gooit 503 wanneer de AI-dienst niet geconfigureerd is', async () => {
      anthropic.isAvailable.mockReturnValue(false);
      await expect(service.startRun('plan1', user)).rejects.toThrow(ServiceUnavailableException);
      expect(prisma.aiReviewRun.create).not.toHaveBeenCalled();
    });

    it('gooit 409 wanneer er al een PENDING-run voor het plan draait', async () => {
      prisma.aiReviewRun.findFirst.mockResolvedValue({ id: 'lopend' });
      await expect(service.startRun('plan1', user)).rejects.toThrow(
        new ConflictException('Er draait al een AI-analyse voor dit plan'),
      );
      expect(prisma.aiReviewRun.create).not.toHaveBeenCalled();
    });
  });

  describe('startRun — happy path', () => {
    it('maakt een PENDING-run en start de analyse asynchroon', async () => {
      const executeSpy = jest
        .spyOn(service, 'executeRun')
        .mockResolvedValue(undefined);

      const run = await service.startRun('plan1', user);

      expect(run).toMatchObject({ id: 'run1', status: AiReviewRunStatus.PENDING });
      expect(prisma.aiReviewRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: 'org1',
          inspectionPlanId: 'plan1',
          triggeredBy: 'u1',
          model: 'claude-review-test',
          status: AiReviewRunStatus.PENDING,
        }),
      });
      // De analyse draait pas ná de request-cyclus (setImmediate).
      expect(executeSpy).not.toHaveBeenCalled();
      await flushImmediate();
      expect(executeSpy).toHaveBeenCalledWith('run1', 'plan1', 'org1', null);
      executeSpy.mockRestore();
    });
  });

  describe('executeRun', () => {
    it('schrijft items, summary en tokencounts weg en zet de run op COMPLETED', async () => {
      anthropic.createMessage.mockResolvedValue(
        toolResponse({
          summary: 'Drie aandachtspunten.',
          items: [
            {
              severity: 'CRITICAL',
              category: 'NORMERING',
              title: 'Meting buiten norm',
              description: 'Zonder afwijking.',
              assetNodeId: 'asset1',
              findingId: 'f1',
              measurementRecordId: 'm1',
            },
            {
              severity: 'WARNING',
              category: 'CONSISTENTIE',
              title: 'Verzonnen verwijzing',
              description: 'Onbekende id-verwijzingen worden gestript.',
              assetNodeId: 'verzonnen',
              findingId: 'ook-verzonnen',
            },
          ],
        }),
      );

      await service.executeRun('run1', 'plan1', 'org1', null);

      expect(anthropic.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-review-test',
          max_tokens: 4096,
          tool_choice: { type: 'tool', name: 'report_review_findings' },
        }),
        { timeout: 120_000, maxRetries: 1 },
      );
      const created = prisma.aiReviewItem.createMany.mock.calls[0][0].data;
      expect(created).toHaveLength(2);
      expect(created[0]).toMatchObject({
        runId: 'run1',
        orgId: 'org1',
        severity: 'CRITICAL',
        assetNodeId: 'asset1',
        findingId: 'f1',
        measurementRecordId: 'm1',
        sortOrder: 0,
      });
      // Onbekende id's gestript, item behouden.
      expect(created[1]).toMatchObject({
        assetNodeId: null,
        findingId: null,
        measurementRecordId: null,
        sortOrder: 1,
      });
      expect(prisma.aiReviewRun.update).toHaveBeenCalledWith({
        where: { id: 'run1' },
        data: expect.objectContaining({
          status: AiReviewRunStatus.COMPLETED,
          summary: 'Drie aandachtspunten.',
          generatedDocumentId: 'doc1',
          inputTokens: 1200,
          outputTokens: 340,
        }),
      });
    });

    it('coerceert ongeldige severity naar INFO en filtert items zonder titel/omschrijving', async () => {
      anthropic.createMessage.mockResolvedValue(
        toolResponse({
          summary: 's',
          items: [
            { severity: 'MEGA', category: '', title: 'Geldig', description: 'ok' },
            { severity: 'INFO', title: '', description: 'geen titel' },
            { severity: 'INFO', title: 'geen omschrijving' },
          ],
        }),
      );
      await service.executeRun('run1', 'plan1', 'org1', null);
      const created = prisma.aiReviewItem.createMany.mock.calls[0][0].data;
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ severity: 'INFO', category: 'OVERIG', title: 'Geldig' });
    });

    it('stuurt de org-instructies als extra promptlaag mee', async () => {
      anthropic.createMessage.mockResolvedValue(toolResponse({ summary: 's', items: [] }));
      await service.executeRun('run1', 'plan1', 'org1', 'Let op NEN 3140-terminologie.');
      const system = anthropic.createMessage.mock.calls[0][0].system as string;
      expect(system).toContain('Organisatie-instructies');
      expect(system).toContain('Let op NEN 3140-terminologie.');
      expect(system).toContain('NEN3140');
    });

    it('zet de run op FAILED met NL-melding bij een API-fout en gooit niet', async () => {
      anthropic.createMessage.mockRejectedValue(new Error('timeout'));
      await expect(service.executeRun('run1', 'plan1', 'org1', null)).resolves.toBeUndefined();
      expect(prisma.aiReviewRun.update).toHaveBeenCalledWith({
        where: { id: 'run1' },
        data: expect.objectContaining({
          status: AiReviewRunStatus.FAILED,
          errorMessage: expect.stringContaining('De AI-analyse is mislukt'),
        }),
      });
      expect(prisma.aiReviewItem.createMany).not.toHaveBeenCalled();
    });

    it('zet de run op FAILED wanneer de respons geen tool-use bevat', async () => {
      anthropic.createMessage.mockResolvedValue({ content: [{ type: 'text', text: 'oeps' }], usage: {} });
      await service.executeRun('run1', 'plan1', 'org1', null);
      expect(prisma.aiReviewRun.update).toHaveBeenCalledWith({
        where: { id: 'run1' },
        data: expect.objectContaining({ status: AiReviewRunStatus.FAILED }),
      });
    });
  });

  describe('getForPlan', () => {
    it('geeft de laatste run terug (of null zonder runs)', async () => {
      prisma.aiReviewRun.findMany.mockResolvedValue([]);
      expect(await service.getForPlan('plan1', user)).toBeNull();
      expect(prisma.aiReviewRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1 }),
      );
    });

    it('geeft met all=true alle runs terug', async () => {
      prisma.aiReviewRun.findMany.mockResolvedValue([{ id: 'r2' }, { id: 'r1' }]);
      const result = await service.getForPlan('plan1', user, true);
      expect(result).toHaveLength(2);
      expect(prisma.aiReviewRun.findMany).toHaveBeenCalledWith(
        expect.not.objectContaining({ take: 1 }),
      );
    });

    it('gooit 404 voor een vreemd plan', async () => {
      prisma.inspectionPlan.findFirst.mockResolvedValue(null);
      await expect(service.getForPlan('plan1', user)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateItemStatus', () => {
    beforeEach(() => {
      prisma.aiReviewItem.findFirst.mockResolvedValue({ id: 'item1' });
      prisma.aiReviewItem.update.mockResolvedValue({ id: 'item1' });
    });

    it('zet checkedBy/checkedAt bij CHECKED', async () => {
      await service.updateItemStatus('item1', AiReviewItemStatus.CHECKED, user);
      expect(prisma.aiReviewItem.update).toHaveBeenCalledWith({
        where: { id: 'item1' },
        data: expect.objectContaining({
          status: AiReviewItemStatus.CHECKED,
          checkedBy: 'u1',
          checkedAt: expect.any(Date),
        }),
      });
    });

    it('zet checkedBy/checkedAt bij DISMISSED', async () => {
      await service.updateItemStatus('item1', AiReviewItemStatus.DISMISSED, user);
      expect(prisma.aiReviewItem.update).toHaveBeenCalledWith({
        where: { id: 'item1' },
        data: expect.objectContaining({ status: AiReviewItemStatus.DISMISSED, checkedBy: 'u1' }),
      });
    });

    it('wist checkedBy/checkedAt bij heropenen (OPEN)', async () => {
      await service.updateItemStatus('item1', AiReviewItemStatus.OPEN, user);
      expect(prisma.aiReviewItem.update).toHaveBeenCalledWith({
        where: { id: 'item1' },
        data: { status: AiReviewItemStatus.OPEN, checkedBy: null, checkedAt: null },
      });
    });

    it('gooit 404 voor een vreemd item', async () => {
      prisma.aiReviewItem.findFirst.mockResolvedValue(null);
      await expect(
        service.updateItemStatus('item1', AiReviewItemStatus.CHECKED, user),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
