import {
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './http-exception.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
  const mockGetResponse = jest.fn().mockReturnValue({ status: mockStatus });
  const mockGetRequest = jest
    .fn()
    .mockReturnValue({ method: 'GET', url: '/api/v1/test', requestId: 'req-test-123' });

  const mockHost = {
    switchToHttp: jest.fn().mockReturnValue({
      getResponse: mockGetResponse,
      getRequest: mockGetRequest,
    }),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    filter = new AllExceptionsFilter();
  });

  it('should handle HttpException with string response', () => {
    const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      message: 'Not found',
      statusCode: HttpStatus.NOT_FOUND,
    });
  });

  it('should handle NotFoundException', () => {
    const exception = new NotFoundException('Document niet gevonden');

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      message: 'Document niet gevonden',
      statusCode: HttpStatus.NOT_FOUND,
    });
  });

  it('should handle BadRequestException with validation errors (array message)', () => {
    const exception = new BadRequestException({
      message: ['email must be an email', 'name should not be empty'],
      error: 'Bad Request',
    });

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    // First message as primary, full array in errors
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      message: 'email must be an email',
      errors: ['email must be an email', 'name should not be empty'],
      statusCode: HttpStatus.BAD_REQUEST,
    });
  });

  it('should omit errors field for single-message validation errors', () => {
    const exception = new BadRequestException({
      message: ['email must be an email'],
      error: 'Bad Request',
    });

    filter.catch(exception, mockHost);

    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      message: 'email must be an email',
      statusCode: HttpStatus.BAD_REQUEST,
    });
  });

  it.each([
    ['P2002', HttpStatus.CONFLICT, 'Deze waarde bestaat al'],
    ['P2025', HttpStatus.NOT_FOUND, 'Gegevens niet gevonden'],
    ['P2003', HttpStatus.BAD_REQUEST, 'Verwijzing naar niet-bestaande gegevens'],
  ])('should map Prisma %s to %s', (code, status, message) => {
    const exception = new Prisma.PrismaClientKnownRequestError('db error', {
      code,
      clientVersion: 'test',
    });

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(status);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      message,
      statusCode: status,
    });
  });

  it('should map unknown Prisma codes to 500', () => {
    const exception = new Prisma.PrismaClientKnownRequestError('db error', {
      code: 'P1001',
      clientVersion: 'test',
    });

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('should handle ForbiddenException', () => {
    const exception = new ForbiddenException('Geen toegang');

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      message: 'Geen toegang',
      statusCode: HttpStatus.FORBIDDEN,
    });
  });

  it('should handle non-HttpException as 500 Internal Server Error', () => {
    const exception = new Error('Unexpected error');

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      message: 'Internal server error',
      requestId: 'req-test-123',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  });

  it('should handle non-Error objects as 500', () => {
    filter.catch('string error', mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      message: 'Internal server error',
      requestId: 'req-test-123',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  });

  it('should include requestId only for 500 responses', () => {
    filter.catch(new NotFoundException('Niet gevonden'), mockHost);
    expect(mockJson.mock.calls[0][0]).not.toHaveProperty('requestId');

    jest.clearAllMocks();
    filter.catch(new Error('boom'), mockHost);
    expect(mockJson.mock.calls[0][0]).toHaveProperty('requestId', 'req-test-123');
  });

  it('should always return { success: false } format', () => {
    const exception = new NotFoundException();

    filter.catch(exception, mockHost);

    const jsonCall = mockJson.mock.calls[0][0];
    expect(jsonCall.success).toBe(false);
    expect(jsonCall.statusCode).toBeDefined();
    expect(jsonCall.message).toBeDefined();
  });
});
