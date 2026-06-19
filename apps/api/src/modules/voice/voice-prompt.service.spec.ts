import { Test, TestingModule } from '@nestjs/testing';
import { VoicePromptService } from './voice-prompt.service';
import { PrismaService } from '@/prisma';

describe('VoicePromptService', () => {
  let service: VoicePromptService;

  const mockPrisma = {
    voiceBasePrompt: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    voiceTemplatePrompt: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    voiceUserPrompt: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoicePromptService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<VoicePromptService>(VoicePromptService);
  });

  describe('buildCombinedPrompt — 3-lagen-merge', () => {
    it('voegt base + norm + template + user-lagen samen in de juiste volgorde', async () => {
      mockPrisma.voiceBasePrompt.findFirst.mockResolvedValue({ content: 'BASE_CONTENT', isActive: true });
      mockPrisma.voiceTemplatePrompt.findUnique.mockResolvedValue({ isActive: true, content: 'TEMPLATE_CONTENT' });
      mockPrisma.voiceUserPrompt.findFirst.mockImplementation((args: any) =>
        Promise.resolve(
          args.where.templateId == null
            ? { isActive: true, content: 'USER_GLOBAL' }
            : { isActive: true, content: 'USER_TEMPLATE' },
        ),
      );

      const result = await service.buildCombinedPrompt('tmpl-1', 'user-1', 'org-1', 'NEN1010');

      // alle lagen aanwezig
      expect(result).toContain('BASE_CONTENT');
      expect(result).toContain('## Norm Context');
      expect(result).toContain('NEN1010');
      expect(result).toContain('## Template-instructies');
      expect(result).toContain('TEMPLATE_CONTENT');
      expect(result).toContain('## Persoonlijke voorkeuren');
      expect(result).toContain('USER_GLOBAL');
      expect(result).toContain('## Persoonlijke voorkeuren (dit template)');
      expect(result).toContain('USER_TEMPLATE');

      // volgorde: base < norm < template < user-globaal < user-template
      const order = [
        'BASE_CONTENT',
        '## Norm Context',
        '## Template-instructies',
        'USER_GLOBAL',
        '## Persoonlijke voorkeuren (dit template)',
      ].map((s) => result.indexOf(s));
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(order.every((i) => i >= 0)).toBe(true);
    });

    it('valt terug op de geporte default-base-prompt als er geen actieve base-prompt is', async () => {
      mockPrisma.voiceBasePrompt.findFirst.mockResolvedValue(null);

      const result = await service.buildCombinedPrompt();

      // markers uit de volledige geporte NL-domeinprompt
      expect(result).toContain('loop_impedance');
      expect(result).toContain('## Output Schema');
      expect(result).toContain('ANTWOORD ALLEEN MET VALIDE JSON');
      expect(result).toContain('insulation_resistance');
    });

    it('slaat de norm-laag over zonder normTypeCode', async () => {
      mockPrisma.voiceBasePrompt.findFirst.mockResolvedValue({ content: 'BASE_CONTENT', isActive: true });
      const result = await service.buildCombinedPrompt(undefined, undefined, null, undefined);
      expect(result).toBe('BASE_CONTENT');
      expect(result).not.toContain('## Norm Context');
    });

    it('sluit een inactieve template-prompt uit', async () => {
      mockPrisma.voiceBasePrompt.findFirst.mockResolvedValue({ content: 'BASE_CONTENT', isActive: true });
      mockPrisma.voiceTemplatePrompt.findUnique.mockResolvedValue({ isActive: false, content: 'IGNORED' });
      const result = await service.buildCombinedPrompt('tmpl-1', undefined, 'org-1');
      expect(result).toBe('BASE_CONTENT');
      expect(result).not.toContain('IGNORED');
    });

    it('vraagt de template-prompt org-scoped op via de composite key', async () => {
      mockPrisma.voiceBasePrompt.findFirst.mockResolvedValue({ content: 'BASE', isActive: true });
      mockPrisma.voiceTemplatePrompt.findUnique.mockResolvedValue(null);
      await service.buildCombinedPrompt('tmpl-1', undefined, 'org-1');
      expect(mockPrisma.voiceTemplatePrompt.findUnique).toHaveBeenCalledWith({
        where: { orgId_templateId: { orgId: 'org-1', templateId: 'tmpl-1' } },
      });
    });
  });

  describe('activateBasePrompt', () => {
    it('deactiveert eerst alle anderen, daarna activeert de gekozen prompt', async () => {
      mockPrisma.voiceBasePrompt.findUnique.mockResolvedValue({ id: 'bp-1', isActive: false });
      mockPrisma.$transaction.mockResolvedValue([]);
      await service.activateBasePrompt('bp-1');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.voiceBasePrompt.updateMany).toHaveBeenCalledWith({
        where: { isActive: true },
        data: { isActive: false },
      });
    });
  });
});
