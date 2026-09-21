import { BadRequestException } from '@nestjs/common';
import { User } from '@prisma/client';
import { CreateTaskDto } from '@/modules/tasks/dto';
import { AiToolRegistry } from './tool-registry';

const user = { id: 'u1', orgId: 'orgA' } as User;
const CONTACT_ID = '5f1c2a3e-1111-4222-8333-444455556666';

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
      .run({ user }, { title: 'Bellen', deadline: '2026-08-01', entityType: 'CONTACT', entityId: CONTACT_ID });
    expect(tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Bellen',
        deadline: '2026-08-01',
        entityType: 'CONTACT',
        entityId: CONTACT_ID,
      }),
      user,
    );
    // Gevalideerde DTO-instantie (geen rauw object) gaat naar de service.
    expect(tasks.create.mock.calls[0][0]).toBeInstanceOf(CreateTaskDto);
  });

  it('write tools run the DTO validation: invalid input → 400 and the service is not called', async () => {
    await expect(
      registry.get('create_task')!.run({ user }, { title: 'Bellen', entityType: 'CONTACT', entityId: 'geen-uuid' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      registry.get('update_task')!.run({ user }, { id: 't1', status: 'ONBEKEND' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      registry.get('create_note')!.run({ user }, { entityType: 'CONTACT', entityId: CONTACT_ID, content: '' }),
    ).rejects.toThrow(BadRequestException);
    expect(tasks.create).not.toHaveBeenCalled();
    expect(tasks.update).not.toHaveBeenCalled();
    expect(notes.create).not.toHaveBeenCalled();
  });

  it('update_task passes only the allowlisted, validated fields (undefined stripped)', async () => {
    await registry.get('update_task')!.run({ user }, { id: 't1', status: 'VOLTOOID', extra: 'x' });
    const dto = tasks.update.mock.calls[0][1];
    expect(dto).toEqual({ status: 'VOLTOOID' });
    expect(tasks.update).toHaveBeenCalledWith('t1', dto, user);
  });

  it('create_task requires an entity link in its schema (F4-live: Prisma vereist entityType/entityId)', () => {
    const schema = registry.get('create_task')!.inputSchema as any;
    expect(schema.required).toEqual(
      expect.arrayContaining(['title', 'entityType', 'entityId']),
    );
    // Exact alle TaskEntityType-waarden — vangt drift met het Prisma-enum.
    expect(schema.properties.entityType.enum).toEqual([
      'CONTACT',
      'REQUEST',
      'QUOTE',
      'PLANNING',
      'PROJECT',
      'PROJECT_PHASE',
      'USER',
    ]);
  });

  it('create_task summarize toont de entiteit-koppeling op de bevestigingskaart', () => {
    const summary = registry.get('create_task')!.summarize!({
      title: 'Bellen',
      entityType: 'CONTACT',
      entityId: 'c1',
      deadline: '2026-08-01',
    });
    expect(summary).toContain('bij contact c1');
    expect(summary).toContain('deadline 2026-08-01');
  });

  it('create_note delegates to NotesService.create with entity + content', async () => {
    await registry.get('create_note')!.run({ user }, { entityType: 'CONTACT', entityId: CONTACT_ID, content: 'hoi' });
    expect(notes.create).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'CONTACT', entityId: CONTACT_ID, content: 'hoi' }),
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
