import { EnumerationGuardService } from './enumeration-guard.service';

describe('EnumerationGuardService', () => {
  let service: EnumerationGuardService;
  const IP = '203.0.113.7';

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-01T12:00:00Z'));
    service = new EnumerationGuardService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is niet geblokkeerd zonder mislukkingen', () => {
    expect(service.isBlocked(IP)).toBe(0);
  });

  it('blokkeert pas na 3 mislukte lookups', () => {
    service.recordFailure(IP);
    expect(service.isBlocked(IP)).toBe(0);
    service.recordFailure(IP);
    expect(service.isBlocked(IP)).toBe(0);
    service.recordFailure(IP);
    // 3e mislukking → geblokkeerd; resterende tijd = 5 min in seconden.
    expect(service.isBlocked(IP)).toBe(300);
  });

  it('telt per IP afzonderlijk', () => {
    service.recordFailure(IP);
    service.recordFailure(IP);
    service.recordFailure(IP);
    expect(service.isBlocked(IP)).toBeGreaterThan(0);
    expect(service.isBlocked('198.51.100.2')).toBe(0);
  });

  it('verlengt de blokkade niet bij verdere mislukkingen', () => {
    service.recordFailure(IP);
    service.recordFailure(IP);
    service.recordFailure(IP);
    expect(service.isBlocked(IP)).toBe(300);

    jest.advanceTimersByTime(60 * 1000); // 1 min later
    service.recordFailure(IP); // genegeerd want al geblokkeerd
    expect(service.isBlocked(IP)).toBe(240); // gewoon verder afgeteld
  });

  it('geeft de resterende seconden terug (voor Retry-After)', () => {
    service.recordFailure(IP);
    service.recordFailure(IP);
    service.recordFailure(IP);

    jest.advanceTimersByTime(120 * 1000); // 2 min verstreken
    expect(service.isBlocked(IP)).toBe(180);
  });

  it('deblokkeert na afloop van het blokkade-venster', () => {
    service.recordFailure(IP);
    service.recordFailure(IP);
    service.recordFailure(IP);
    expect(service.isBlocked(IP)).toBe(300);

    jest.advanceTimersByTime(5 * 60 * 1000 + 1000); // 5 min + 1 s
    expect(service.isBlocked(IP)).toBe(0);
  });

  it('start opnieuw te tellen nadat het telvenster verlopen is', () => {
    service.recordFailure(IP);
    service.recordFailure(IP);
    expect(service.isBlocked(IP)).toBe(0);

    // Venster (5 min) verloopt zonder de 3e mislukking → teller reset.
    jest.advanceTimersByTime(5 * 60 * 1000 + 1000);
    service.recordFailure(IP); // telt als 1, niet als 3
    expect(service.isBlocked(IP)).toBe(0);
  });

  it('clear() reset alle tellers en blokkades', () => {
    service.recordFailure(IP);
    service.recordFailure(IP);
    service.recordFailure(IP);
    expect(service.isBlocked(IP)).toBeGreaterThan(0);

    service.clear();
    expect(service.isBlocked(IP)).toBe(0);
  });
});
