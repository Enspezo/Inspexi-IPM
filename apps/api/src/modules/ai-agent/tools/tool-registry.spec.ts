import { User } from '@prisma/client';
import { AiToolRegistry } from './tool-registry';

const user = { id: 'u1', orgId: 'orgA' } as User;

describe('AiToolRegistry', () => {
  let contacts: any;
  let requests: any;
  let tasks: any;
  let notes: any;
  let kvk: any;
  let geocoding: any;
  let registry: AiToolRegistry;

  beforeEach(() => {
    contacts = { findAll: jest.fn().mockResolvedValue({ data: [] }), findOne: jest.fn().mockResolvedValue({ id: 'x' }) };
    requests = { findAll: jest.fn().mockResolvedValue({ data: [] }), findOne: jest.fn() };
    tasks = { findAll: jest.fn().mockResolvedValue({ data: [] }), findOne: jest.fn(), create: jest.fn().mockResolvedValue({ id: 't1' }), update: jest.fn().mockResolvedValue({ id: 't1' }) };
    notes = { create: jest.fn().mockResolvedValue({ id: 'n1' }) };
    kvk = { search: jest.fn().mockResolvedValue([]), getProfile: jest.fn() };
    geocoding = { suggest: jest.fn().mockResolvedValue([]), lookup: jest.fn() };
    registry = new AiToolRegistry(contacts, requests, tasks, notes, kvk, geocoding);
  });

  it('has both read and write tools; every tool has a JSON-schema object', () => {
    const tools = registry.list();
    expect(tools.some((t) => t.mutates === false)).toBe(true);
    expect(tools.some((t) => t.mutates === true)).toBe(true);
    expect(tools.every((t) => (t.inputSchema as any).type === 'object')).toBe(true);
  });

  it('write tools carry a summarize() for the confirmation card and are not run at registry level', () => {
    const createTask = registry.get('create_task')!;
    expect(createTask.mutates).toBe(true);
    expect(typeof createTask.summarize).toBe('function');
    expect(createTask.summarize!({ title: 'Bellen Jansen' })).toContain('Bellen Jansen');
  });

  it('create_task delegates to TasksService.create with the acting user', async () => {
    await registry
      .get('create_task')!
      .run({ user }, { title: 'Bellen', deadline: '2026-08-01', entityType: 'CONTACT', entityId: 'c1' });
    expect(tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Bellen',
        deadline: '2026-08-01',
        entityType: 'CONTACT',
        entityId: 'c1',
      }),
      user,
    );
  });

  it('create_task requires an entity link in its schema (F4-live: Prisma vereist entityType/entityId)', () => {
    const schema = registry.get('create_task')!.inputSchema as any;
    expect(schema.required).toEqual(
      expect.arrayContaining(['title', 'entityType', 'entityId']),
    );
    expect(schema.properties.entityType.enum).toEqual(
      expect.arrayContaining(['CONTACT', 'USER']),
    );
  });

  it('create_note delegates to NotesService.create with entity + content', async () => {
    await registry.get('create_note')!.run({ user }, { entityType: 'CONTACT', entityId: 'c1', content: 'hoi' });
    expect(notes.create).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'CONTACT', entityId: 'c1', content: 'hoi' }),
      user,
    );
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
