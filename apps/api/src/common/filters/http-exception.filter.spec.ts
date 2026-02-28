import {
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
  const mockGetResponse = jest.fn().mockReturnValue({ status: mockStatus });
  const mockGetRequest = jest.fn().mockReturnValue({ method: 'GET', url: '/api/v1/test' });

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
    // Should take first message from array
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      message: 'email must be an email',
      statusCode: HttpStatus.BAD_REQUEST,
    });
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
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  });

  it('should handle non-Error objects as 500', () => {
    filter.catch('string error', mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      message: 'Internal server error',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    });
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
