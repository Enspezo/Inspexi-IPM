import { Logger } from '@nestjs/common';
import { Response } from 'express';
import { AccessLogMiddleware } from './access-log.middleware';
import { RequestWithId } from './request-id.middleware';

describe('AccessLogMiddleware', () => {
  let middleware: AccessLogMiddleware;
  let next: jest.Mock;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let finishHandler: () => void;

  const makeReq = (overrides: Partial<RequestWithId> = {}): RequestWithId =>
    ({
      method: 'GET',
      originalUrl: '/api/v1/contacts',
      requestId: 'req-123',
      ...overrides,
    } as unknown as RequestWithId);

  const makeRes = (statusCode: number): Response =>
    ({
      statusCode,
      on: jest.fn((event: string, handler: () => void) => {
        if (event === 'finish') finishHandler = handler;
      }),
    } as unknown as Response);

  beforeEach(() => {
    middleware = new AccessLogMiddleware();
    next = jest.fn();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls next() and registers a finish handler', () => {
    middleware.use(makeReq(), makeRes(200), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(typeof finishHandler).toBe('function');
  });

  it('does not log for status < 400', () => {
    middleware.use(makeReq(), makeRes(200), next);
    finishHandler();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('strips query strings from the logged path', () => {
    const req = makeReq({ originalUrl: '/api/v1/contacts?search=geheim&page=2' });
    middleware.use(req, makeRes(403), next);
    finishHandler();
    const message = warnSpy.mock.calls[0][0] as string;
    expect(message).toContain('GET /api/v1/contacts');
    expect(message).not.toContain('search=');
  });

  it('logs a warn for 4xx including userId/orgId/requestId', () => {
    const req = makeReq({
      requestId: 'req-403',
      user: { id: 'user-1', orgId: 'org-1' },
    } as Partial<RequestWithId>);
    middleware.use(req, makeRes(403), next);
    finishHandler();

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0][0] as string;
    expect(message).toContain('403');
    expect(message).toContain('requestId=req-403');
    expect(message).toContain('userId=user-1');
    expect(message).toContain('orgId=org-1');
  });

  it('logs an error for 5xx', () => {
    middleware.use(makeReq(), makeRes(500), next);
    finishHandler();

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const message = errorSpy.mock.calls[0][0] as string;
    expect(message).toContain('500');
    expect(message).toContain('requestId=req-123');
  });

  it('omits user fields when unauthenticated', () => {
    middleware.use(makeReq({ user: undefined }), makeRes(429), next);
    finishHandler();

    const message = warnSpy.mock.calls[0][0] as string;
    expect(message).toContain('429');
    expect(message).not.toContain('userId=');
    expect(message).not.toContain('orgId=');
  });
});
