// WP-C3 (B-212): de per-record foutmapper mag NOOIT implementatiedetails
// (serverpad, broncoderegels, payload, constraintnamen) naar de client laten
// reizen — die tekst belandt in syncRetryMeta.lastError op het toestel.
import { BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toClientSyncError } from './sync-errors';
import { requestContext } from '@/common/services/request-context';

describe('toClientSyncError (B-212)', () => {
  const ref = { entityType: 'finding', entityId: 'f-1' };
  let logger: Logger;

  beforeEach(() => {
    logger = { error: jest.fn() } as unknown as Logger;
  });

  const rawPrismaMessage =
    '\nInvalid `model.create()` invocation in\n' +
    '/Users/mathijs/VIBE/InspeXi-Beheer-test/apps/api/src/modules/sync/sync.service.ts:546:19\n' +
    '  543   return { ...ref, status: \'success\' };\n' +
    'data: { orgId: "org-1", createdBy: "user-1" }\n' +
    'Foreign key constraint violated: `imp_findings_visual_inspection_id_fkey (index)`';

  it('passes own HttpExceptions through unchanged (functional NL messages)', () => {
    expect(toClientSyncError(new BadRequestException('Record niet gevonden'), logger, ref)).toBe(
      'Record niet gevonden',
    );
    expect(
      toClientSyncError(new ForbiddenException('Gebruiker hoort niet bij uw organisatie'), logger, ref),
    ).toBe('Gebruiker hoort niet bij uw organisatie');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('maps P2003 to Dutch and never leaks path/payload/constraint', () => {
    const err = new Prisma.PrismaClientKnownRequestError(rawPrismaMessage, {
      code: 'P2003',
      clientVersion: '5.22.0',
    });

    const msg = toClientSyncError(err, logger, ref);

    expect(msg).toMatch(/^Verwijzing naar niet-bestaande gegevens \(referentie [0-9a-f-]+\)$/);
    expect(msg).not.toContain('/Users/');
    expect(msg).not.toContain('sync.service.ts');
    expect(msg).not.toContain('orgId');
    expect(msg).not.toContain('imp_findings');
    // Volledige exceptie wél server-side gelogd, mét dezelfde referentie.
    expect(logger.error).toHaveBeenCalledTimes(1);
    const logged = (logger.error as jest.Mock).mock.calls[0][0] as string;
    expect(logged).toContain('finding/f-1');
    expect(logged).toMatch(/\[ref=[0-9a-f-]+\]/);
  });

  it('maps P2002 to "Deze waarde bestaat al"', () => {
    const err = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: '5.22.0',
    });
    expect(toClientSyncError(err, logger, ref)).toMatch(
      /^Deze waarde bestaat al \(referentie [0-9a-f-]+\)$/,
    );
  });

  it('maps an unknown Prisma code to a generic database message', () => {
    const err = new Prisma.PrismaClientKnownRequestError('weird', {
      code: 'P9999',
      clientVersion: '5.22.0',
    });
    expect(toClientSyncError(err, logger, ref)).toMatch(
      /^Databasefout bij het verwerken van dit record \(referentie [0-9a-f-]+\)$/,
    );
  });

  it('maps PrismaClientValidationError to "Ongeldige gegevens voor dit record"', () => {
    const err = new Prisma.PrismaClientValidationError(rawPrismaMessage, {
      clientVersion: '5.22.0',
    });
    const msg = toClientSyncError(err, logger, ref);
    expect(msg).toMatch(/^Ongeldige gegevens voor dit record \(referentie [0-9a-f-]+\)$/);
    expect(msg).not.toContain('/Users/');
  });

  it('maps any other error to a generic Dutch message', () => {
    const msg = toClientSyncError(new Error('ECONNREFUSED 127.0.0.1:5433'), logger, ref);
    expect(msg).toMatch(/^Onverwachte fout bij het verwerken van dit record \(referentie [0-9a-f-]+\)$/);
    expect(msg).not.toContain('ECONNREFUSED');
  });

  it('uses the requestId from the request context as correlation id when available', () => {
    requestContext.run(
      { userId: 'u1', orgId: 'org-1', requestId: 'req-abc-123' },
      () => {
        const msg = toClientSyncError(new Error('boom'), logger, ref);
        expect(msg).toBe(
          'Onverwachte fout bij het verwerken van dit record (referentie req-abc-123)',
        );
        expect((logger.error as jest.Mock).mock.calls[0][0]).toContain('[ref=req-abc-123]');
      },
    );
  });
});
