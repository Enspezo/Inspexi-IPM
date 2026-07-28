import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { NumberingService } from './numbering.service';

/** Build a P2002 unique-constraint violation the way the service detects it. */
function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('dup', {
    code: 'P2002',
    clientVersion: 'x',
  });
}

describe('NumberingService', () => {
  let service: NumberingService;
  let mockPrisma: {
    numberingScheme: { upsert: jest.Mock; findMany: jest.Mock };
    numberingCounter: Record<string, never>;
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
    request: { findFirst: jest.Mock };
    quote: { findFirst: jest.Mock };
    project: { findFirst: jest.Mock };
    product: { findFirst: jest.Mock };
  };

  const ORG = 'org-1';
  const mockTx = { tx: true };

  const sequentialScheme = (overrides: Record<string, unknown> = {}) => ({
    id: 'scheme-1',
    orgId: ORG,
    model: 'REQUEST',
    prefix: 'AANV-[jaar]-',
    suffix: '',
    mode: 'SEQUENTIAL',
    start: 1,
    interval: 1,
    digits: 4,
    resetPolicy: 'PER_YEAR',
    allowManualEntry: false,
    isActive: true,
    ...overrides,
  });

  beforeEach(async () => {
    mockPrisma = {
      numberingScheme: { upsert: jest.fn(), findMany: jest.fn() },
      numberingCounter: {},
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
      request: { findFirst: jest.fn() },
      quote: { findFirst: jest.fn() },
      project: { findFirst: jest.fn() },
      product: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NumberingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NumberingService>(NumberingService);
    jest.clearAllMocks();
  });

  describe('runWithGeneratedNumber', () => {
    it('SEQUENTIAL happy path: composes the number and returns the create result', async () => {
      mockPrisma.numberingScheme.upsert.mockResolvedValue(sequentialScheme());
      mockPrisma.$queryRaw.mockResolvedValue([{ value: 5 }]);
      mockPrisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
        cb(mockTx),
      );

      const create = jest.fn(async (_tx, value: string) => ({ id: 'r1', number: value }));

      const result = await service.runWithGeneratedNumber(
        'REQUEST',
        ORG,
        {},
        create,
      );

      expect(create).toHaveBeenCalledTimes(1);
      const passedValue = create.mock.calls[0][1] as string;
      expect(passedValue).toContain('AANV-');
      expect(passedValue).toContain('0005');
      expect(result).toEqual({ id: 'r1', number: passedValue });
      // counter was bumped exactly once
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('manual + allowManualEntry=true: uses the manual value, no counter bump', async () => {
      mockPrisma.numberingScheme.upsert.mockResolvedValue(
        sequentialScheme({ allowManualEntry: true }),
      );
      mockPrisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
        cb(mockTx),
      );

      const create = jest.fn(async (_tx, value: string) => ({ id: 'r1', number: value }));

      const result = await service.runWithGeneratedNumber(
        'REQUEST',
        ORG,
        { manual: 'CUSTOM-001' },
        create,
      );

      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0][1]).toBe('CUSTOM-001');
      expect(result).toEqual({ id: 'r1', number: 'CUSTOM-001' });
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('manual + allowManualEntry=false: throws BadRequestException, create not called', async () => {
      mockPrisma.numberingScheme.upsert.mockResolvedValue(
        sequentialScheme({ allowManualEntry: false }),
      );
      const create = jest.fn();

      await expect(
        service.runWithGeneratedNumber('REQUEST', ORG, { manual: 'X-1' }, create),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.runWithGeneratedNumber('REQUEST', ORG, { manual: 'X-1' }, create),
      ).rejects.toThrow(/handmatige nummering/i);
      expect(create).not.toHaveBeenCalled();
    });

    it('retries once on a P2002 collision then resolves', async () => {
      mockPrisma.numberingScheme.upsert.mockResolvedValue(sequentialScheme());
      mockPrisma.$queryRaw.mockResolvedValue([{ value: 5 }]);
      mockPrisma.$transaction
        .mockImplementationOnce(() => {
          throw uniqueViolation();
        })
        .mockImplementation((cb: (tx: unknown) => unknown) => cb(mockTx));

      const create = jest.fn(async (_tx, value: string) => ({ id: 'r2', number: value }));

      const result = await service.runWithGeneratedNumber(
        'REQUEST',
        ORG,
        {},
        create,
      );

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ id: 'r2', number: expect.stringContaining('AANV-') });
    });

    it('rejects with ConflictException after retries are exhausted', async () => {
      mockPrisma.numberingScheme.upsert.mockResolvedValue(sequentialScheme());
      mockPrisma.$queryRaw.mockResolvedValue([{ value: 5 }]);
      mockPrisma.$transaction.mockImplementation(() => {
        throw uniqueViolation();
      });

      const create = jest.fn(async (_tx, value: string) => ({ value }));

      await expect(
        service.runWithGeneratedNumber('REQUEST', ORG, {}, create),
      ).rejects.toThrow(ConflictException);
    });

    it('ASSET_NODE: resolves [typecode] from the loaded context (e.g. WCD-0005)', async () => {
      mockPrisma.numberingScheme.upsert.mockResolvedValue(
        sequentialScheme({
          model: 'ASSET_NODE',
          prefix: '[typecode]-',
          resetPolicy: 'CONTINUOUS',
        }),
      );
      mockPrisma.$queryRaw.mockResolvedValue([{ value: 5 }]);
      mockPrisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(mockTx));

      const create = jest.fn(async (_tx, value: string) => ({ id: 'n1', number: value }));
      const loadContext = jest.fn(async () => ({ typeShortCode: 'wcd' }));

      const result = await service.runWithGeneratedNumber(
        'ASSET_NODE',
        ORG,
        { loadContext },
        create,
      );

      // loadContext runs because the prefix carries the data-driven [typecode] token.
      expect(loadContext).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0][1]).toBe('WCD-0005');
      expect(result).toEqual({ id: 'n1', number: 'WCD-0005' });
    });

    it('LOCATION_NODE: provisions the LOC- default scheme via ensureScheme', async () => {
      // Geen bestaand schema → upsert geeft het default LOCATION_NODE-schema terug.
      mockPrisma.numberingScheme.upsert.mockImplementation(async (args: any) => ({
        id: 'loc-scheme',
        orgId: ORG,
        isActive: true,
        ...args.create,
      }));
      mockPrisma.$queryRaw.mockResolvedValue([{ value: 1 }]);
      mockPrisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(mockTx));

      const create = jest.fn(async (_tx, value: string) => ({ id: 'l1', number: value }));
      const result = await service.runWithGeneratedNumber('LOCATION_NODE', ORG, {}, create);

      expect(mockPrisma.numberingScheme.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orgId_model: { orgId: ORG, model: 'LOCATION_NODE' } },
          create: expect.objectContaining({ prefix: 'LOC-', resetPolicy: 'CONTINUOUS' }),
        }),
      );
      expect(result).toEqual({ id: 'l1', number: 'LOC-0001' });
    });

    // WP-C3 (B-203): een leeg-resolvende [typecode] gaf misvormde, org-unieke
    // nummers als `-0033` — de generatie moet dan geweigerd worden, vóór de
    // counter-bump.
    it('ASSET_NODE: refuses generation when [typecode] resolves empty (B-203)', async () => {
      mockPrisma.numberingScheme.upsert.mockResolvedValue(
        sequentialScheme({
          model: 'ASSET_NODE',
          prefix: '[typecode]-',
          resetPolicy: 'CONTINUOUS',
        }),
      );

      const create = jest.fn();

      await expect(
        service.runWithGeneratedNumber(
          'ASSET_NODE',
          ORG,
          { context: { typeShortCode: null } },
          create,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(create).not.toHaveBeenCalled();
      // Geen counter-bump voor een geweigerde generatie.
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('ASSET_NODE: allows an empty shortcode when the scheme does not use [typecode]', async () => {
      mockPrisma.numberingScheme.upsert.mockResolvedValue(
        sequentialScheme({
          model: 'ASSET_NODE',
          prefix: 'A-',
          resetPolicy: 'CONTINUOUS',
        }),
      );
      mockPrisma.$queryRaw.mockResolvedValue([{ value: 7 }]);
      mockPrisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(mockTx));

      const create = jest.fn(async (_tx, value: string) => ({ id: 'n1', number: value }));
      const result = await service.runWithGeneratedNumber(
        'ASSET_NODE',
        ORG,
        { context: { typeShortCode: null } },
        create,
      );

      expect(result).toEqual({ id: 'n1', number: 'A-0007' });
    });
  });

  describe('validateManualNumber', () => {
    it('throws BadRequestException when manual entry is not allowed', async () => {
      mockPrisma.numberingScheme.upsert.mockResolvedValue(
        sequentialScheme({ model: 'QUOTE', allowManualEntry: false }),
      );

      await expect(
        service.validateManualNumber(ORG, 'QUOTE', 'OFF-2026-0001'),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns the trimmed value when allowed and no duplicate exists', async () => {
      mockPrisma.numberingScheme.upsert.mockResolvedValue(
        sequentialScheme({ model: 'QUOTE', allowManualEntry: true }),
      );
      mockPrisma.quote.findFirst.mockResolvedValue(null);

      const result = await service.validateManualNumber(
        ORG,
        'QUOTE',
        '  OFF-2026-0001  ',
      );

      expect(result).toBe('OFF-2026-0001');
      expect(mockPrisma.quote.findFirst).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when the value already exists', async () => {
      mockPrisma.numberingScheme.upsert.mockResolvedValue(
        sequentialScheme({ model: 'QUOTE', allowManualEntry: true }),
      );
      mockPrisma.quote.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.validateManualNumber(ORG, 'QUOTE', 'OFF-2026-0001'),
      ).rejects.toThrow(ConflictException);
    });

    it('uses the correct delegate per model', async () => {
      const cases: Array<['REQUEST' | 'QUOTE' | 'PROJECT' | 'PRODUCT', keyof typeof mockPrisma]> =
        [
          ['REQUEST', 'request'],
          ['QUOTE', 'quote'],
          ['PROJECT', 'project'],
          ['PRODUCT', 'product'],
        ];

      for (const [model, delegate] of cases) {
        mockPrisma.numberingScheme.upsert.mockResolvedValue(
          sequentialScheme({ model, allowManualEntry: true }),
        );
        (mockPrisma[delegate] as { findFirst: jest.Mock }).findFirst.mockResolvedValue(
          null,
        );

        await expect(
          service.validateManualNumber(ORG, model, 'VAL-1'),
        ).resolves.toBe('VAL-1');
        expect(
          (mockPrisma[delegate] as { findFirst: jest.Mock }).findFirst,
        ).toHaveBeenCalled();
      }
    });
  });

  describe('preview', () => {
    it('returns a non-empty example matching the scheme format', async () => {
      mockPrisma.numberingScheme.upsert.mockResolvedValue(
        sequentialScheme({ model: 'QUOTE', prefix: 'OFF-[jaar]-', start: 1, digits: 4 }),
      );

      const result = await service.preview(ORG, 'QUOTE');

      expect(typeof result.example).toBe('string');
      expect(result.example.length).toBeGreaterThan(0);
      expect(result.example).toContain('OFF-');
      expect(result.example).toContain('0001');
    });
  });
});
