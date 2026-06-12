import { RequestIdMiddleware, RequestWithId } from './request-id.middleware';
import { Response } from 'express';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;
  let setHeader: jest.Mock;
  let next: jest.Mock;
  let res: Response;
  const originalBaseDomain = process.env.BASE_DOMAIN;

  const makeReq = (headers: Record<string, any> = {}): RequestWithId =>
    ({ headers } as unknown as RequestWithId);

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
    setHeader = jest.fn();
    next = jest.fn();
    res = { setHeader } as unknown as Response;
  });

  afterEach(() => {
    if (originalBaseDomain === undefined) {
      delete process.env.BASE_DOMAIN;
    } else {
      process.env.BASE_DOMAIN = originalBaseDomain;
    }
  });

  it('generates a UUID, sets it on req and the response header, and calls next', () => {
    delete process.env.BASE_DOMAIN;
    const req = makeReq();

    middleware.use(req, res, next);

    expect(req.requestId).toMatch(UUID_PATTERN);
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('ignores incoming X-Request-Id on localhost (untrusted)', () => {
    process.env.BASE_DOMAIN = 'localhost';
    const req = makeReq({ 'x-request-id': 'incoming-id' });

    middleware.use(req, res, next);

    expect(req.requestId).not.toBe('incoming-id');
    expect(req.requestId).toMatch(UUID_PATTERN);
  });

  it('reuses a valid incoming X-Request-Id behind a trusted proxy', () => {
    process.env.BASE_DOMAIN = 'inspexi.nl';
    const req = makeReq({ 'x-request-id': 'abc-123-DEF' });

    middleware.use(req, res, next);

    expect(req.requestId).toBe('abc-123-DEF');
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'abc-123-DEF');
  });

  it('rejects a malformed incoming X-Request-Id and generates a fresh one', () => {
    process.env.BASE_DOMAIN = 'inspexi.nl';
    const req = makeReq({ 'x-request-id': 'bad id!@#' });

    middleware.use(req, res, next);

    expect(req.requestId).not.toBe('bad id!@#');
    expect(req.requestId).toMatch(UUID_PATTERN);
  });

  it('handles array-valued X-Request-Id header by using the first value', () => {
    process.env.BASE_DOMAIN = 'inspexi.nl';
    const req = makeReq({ 'x-request-id': ['first-valid', 'second'] });

    middleware.use(req, res, next);

    expect(req.requestId).toBe('first-valid');
  });
});
