import { User } from '@prisma/client';
import { AiToolRegistry } from './tool-registry';

const user = { id: 'u1', orgId: 'orgA' } as User;

describe('AiToolRegistry', () => {
  let contacts: any;
  let requests: any;
  let tasks: any;
  let kvk: any;
  let geocoding: any;
  let registry: AiToolRegistry;

  beforeEach(() => {
    contacts = { findAll: jest.fn().mockResolvedValue({ data: [] }), findOne: jest.fn().mockResolvedValue({ id: 'x' }) };
    requests = { findAll: jest.fn().mockResolvedValue({ data: [] }), findOne: jest.fn() };
    tasks = { findAll: jest.fn().mockResolvedValue({ data: [] }), findOne: jest.fn() };
    kvk = { search: jest.fn().mockResolvedValue([]), getProfile: jest.fn() };
    geocoding = { suggest: jest.fn().mockResolvedValue([]), lookup: jest.fn() };
    registry = new AiToolRegistry(contacts, requests, tasks, kvk, geocoding);
  });

  it('exposes only read tools in fase 2 (mutates === false)', () => {
    const tools = registry.list();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every((t) => t.mutates === false)).toBe(true);
    // Every tool has a JSON-schema object
    expect(tools.every((t) => (t.inputSchema as any).type === 'object')).toBe(true);
  });

  it('registers the expected read tools', () => {
    const names = registry.list().map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'search_contacts',
        'get_contact',
        'list_requests',
        'get_task',
        'kvk_search',
        'pdok_lookup',
      ]),
    );
  });

  it('delegates get_contact to ContactsService with the acting user', async () => {
    await registry.get('get_contact')!.run({ user }, { id: 'c9' });
    expect(contacts.findOne).toHaveBeenCalledWith('c9', user);
  });

  it('maps search_contacts query + supplierOnly onto the service DTO', async () => {
    await registry.get('search_contacts')!.run({ user }, { query: 'jansen', supplierOnly: true });
    expect(contacts.findAll).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ search: 'jansen', supplierOnly: 'true' }),
    );
  });

  it('delegates kvk_search to KvkService (external, no user scoping needed)', async () => {
    await registry.get('kvk_search')!.run({ user }, { query: '12345678' });
    expect(kvk.search).toHaveBeenCalledWith('12345678');
  });

  it('passes org/user context to pdok_lookup for logging', async () => {
    await registry.get('pdok_lookup')!.run({ user }, { id: 'adr-1' });
    expect(geocoding.lookup).toHaveBeenCalledWith('adr-1', { orgId: 'orgA', userId: 'u1' });
  });
});
