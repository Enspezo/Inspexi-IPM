import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient, setAccessToken, getAccessToken } from './api-client';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('api-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAccessToken(null);
  });

  describe('setAccessToken / getAccessToken', () => {
    it('should store and retrieve access token', () => {
      setAccessToken('test-token');
      expect(getAccessToken()).toBe('test-token');
    });

    it('should clear access token with null', () => {
      setAccessToken('test-token');
      setAccessToken(null);
      expect(getAccessToken()).toBeNull();
    });
  });

  describe('apiClient.get', () => {
    it('should make GET request with auth header', async () => {
      setAccessToken('my-token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: '1' } }),
      });

      const result = await apiClient.get('/contacts');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/contacts',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-token',
          }),
        }),
      );
      expect(result).toEqual({ id: '1' });
    });

    it('should unwrap { success: true, data } response', async () => {
      setAccessToken('token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { contacts: [{ id: 'c-1' }] },
        }),
      });

      const result = await apiClient.get('/contacts');

      expect(result).toEqual({ contacts: [{ id: 'c-1' }] });
    });

    it('should throw error for non-ok response', async () => {
      setAccessToken('token');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          message: 'Validation failed',
          statusCode: 400,
        }),
      });

      await expect(apiClient.get('/contacts')).rejects.toThrow();
    });
  });

  describe('apiClient.post', () => {
    it('should make POST request with JSON body', async () => {
      setAccessToken('token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: 'new-1' } }),
      });

      const result = await apiClient.post('/contacts', {
        companyName: 'ACME',
        type: 'COMPANY',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/contacts',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
      expect(result).toEqual({ id: 'new-1' });
    });
  });

  describe('apiClient.patch', () => {
    it('should make PATCH request', async () => {
      setAccessToken('token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: '1', name: 'updated' } }),
      });

      const result = await apiClient.patch('/contacts/1', { name: 'updated' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/contacts/1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('apiClient.delete', () => {
    it('should make DELETE request', async () => {
      setAccessToken('token');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: null }),
      });

      await apiClient.delete('/contacts/1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/contacts/1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
});
