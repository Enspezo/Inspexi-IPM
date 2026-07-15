import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { ContactsService } from '@/modules/contacts/contacts.service';
import { RequestsService } from '@/modules/requests/requests.service';
import { TasksService } from '@/modules/tasks/tasks.service';
import { NotesService } from '@/modules/notes/notes.service';
import { KvkService } from '@/modules/kvk/kvk.service';
import { GeocodingService } from '@/modules/geocoding/geocoding.service';

/** Uitvoeringscontext van een tool: de agent handelt als deze gebruiker. */
export interface AiToolContext {
  user: User;
}

/**
 * Een client-uitgevoerde tool (PRD-12). `mutates=false` → direct uitvoeren;
 * `mutates=true` → achter een bevestigingskaart (`AiPendingAction`) en pas ná
 * bevestiging uitgevoerd via `run` (binnen een `source='AI'`-auditcontext).
 */
export interface AiToolDef {
  name: string;
  description: string;
  /** JSON-schema voor de tool-input (Anthropic `input_schema`). */
  inputSchema: Record<string, unknown>;
  mutates: boolean;
  run(ctx: AiToolContext, input: Record<string, any>): Promise<unknown>;
  /** NL-samenvatting voor de bevestigingskaart (alleen zinvol bij write-tools). */
  summarize?(input: Record<string, any>): string;
}

/**
 * Registry van client-tools. Lees- én write-tools delegeren naar de bestaande
 * feature-services met de ingelogde `user`, zodat org- en rol-scoping
 * (`orgScope`, `assertSameOrg`, 404 bij cross-tenant) automatisch gelden — de
 * agent kan nooit meer dan de gebruiker zelf (PRD-12 §5.2). Write-tools worden
 * tijdens de agent-loop NIET uitgevoerd; hun `run` draait pas bij bevestiging.
 */
@Injectable()
export class AiToolRegistry {
  private readonly tools: AiToolDef[];

  constructor(
    private readonly contacts: ContactsService,
    private readonly requests: RequestsService,
    private readonly tasks: TasksService,
    private readonly notes: NotesService,
    private readonly kvk: KvkService,
    private readonly geocoding: GeocodingService,
  ) {
    this.tools = [...this.readTools(), ...this.writeTools()];
  }

  list(): AiToolDef[] {
    return this.tools;
  }

  get(name: string): AiToolDef | undefined {
    return this.tools.find((t) => t.name === name);
  }

  // ─── Lees-tools (direct uitgevoerd) ────────────────────
  private readTools(): AiToolDef[] {
    return [
      {
        name: 'search_contacts',
        description:
          'Zoek relaties (klanten/leveranciers) op naam, e-mail of telefoon binnen de organisatie van de gebruiker.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Zoekterm (naam, e-mail, telefoon)' },
            supplierOnly: { type: 'boolean', description: 'Alleen leveranciers' },
          },
          required: ['query'],
        },
        mutates: false,
        run: (ctx, input) =>
          this.contacts.findAll(ctx.user, {
            search: input.query,
            supplierOnly: input.supplierOnly ? 'true' : undefined,
            limit: 10,
          } as any),
      },
      {
        name: 'get_contact',
        description: 'Haal de details van één relatie op via haar id.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Relatie-id (uuid)' } },
          required: ['id'],
        },
        mutates: false,
        run: (ctx, input) => this.contacts.findOne(input.id, ctx.user),
      },
      {
        name: 'list_requests',
        description:
          'Lijst aanvragen (leads) van de organisatie, optioneel gefilterd op zoekterm, status of prioriteit.',
        inputSchema: {
          type: 'object',
          properties: {
            search: { type: 'string' },
            status: { type: 'string', description: 'Bijv. NIEUW, IN_BEHANDELING, GEWONNEN' },
            priority: { type: 'string' },
          },
        },
        mutates: false,
        run: (ctx, input) =>
          this.requests.findAll(ctx.user, {
            search: input.search,
            status: input.status,
            priority: input.priority,
            limit: 10,
          } as any),
      },
      {
        name: 'get_request',
        description: 'Haal de details van één aanvraag op via haar id.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Aanvraag-id (uuid)' } },
          required: ['id'],
        },
        mutates: false,
        run: (ctx, input) => this.requests.findOne(input.id, ctx.user),
      },
      {
        name: 'list_tasks',
        description:
          'Lijst taken van de organisatie, optioneel gefilterd op zoekterm, status of alleen die van de gebruiker.',
        inputSchema: {
          type: 'object',
          properties: {
            search: { type: 'string' },
            status: { type: 'string', description: 'TE_DOEN, MEE_BEZIG of VOLTOOID' },
            onlyMine: { type: 'boolean', description: 'Alleen taken toegewezen aan mij' },
          },
        },
        mutates: false,
        run: (ctx, input) =>
          this.tasks.findAll(ctx.user, {
            search: input.search,
            status: input.status,
            onlyMine: input.onlyMine ? 'true' : undefined,
            limit: 10,
          } as any),
      },
      {
        name: 'get_task',
        description: 'Haal de details van één taak op via haar id.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Taak-id (uuid)' } },
          required: ['id'],
        },
        mutates: false,
        run: (ctx, input) => this.tasks.findOne(input.id, ctx.user),
      },
      {
        name: 'kvk_search',
        description:
          'Zoek een bedrijf in het KvK-handelsregister op naam of KvK-nummer. Retourneert kandidaten met KvK-nummer en adres.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Bedrijfsnaam of KvK-nummer' } },
          required: ['query'],
        },
        mutates: false,
        run: (_ctx, input) => this.kvk.search(input.query),
      },
      {
        name: 'kvk_get_profile',
        description: 'Haal het basisprofiel (naam, website, adressen) van een bedrijf op via KvK-nummer.',
        inputSchema: {
          type: 'object',
          properties: { kvkNummer: { type: 'string', description: '8-cijferig KvK-nummer' } },
          required: ['kvkNummer'],
        },
        mutates: false,
        run: (_ctx, input) => this.kvk.getProfile(input.kvkNummer),
      },
      {
        name: 'pdok_suggest_address',
        description:
          'Zoek Nederlandse adressen via de PDOK Locatieserver. Retourneert suggesties met een id voor pdok_lookup.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Vrij adres, bijv. "Dam 1 Amsterdam"' } },
          required: ['query'],
        },
        mutates: false,
        run: (_ctx, input) => this.geocoding.suggest(input.query),
      },
      {
        name: 'pdok_lookup',
        description:
          'Haal gestructureerde adresdetails (straat, huisnummer, postcode, plaats, coördinaten) op via een PDOK-adres-id uit pdok_suggest_address.',
        inputSchema: {
          type: 'object',
          properties: { id: { type: 'string', description: 'PDOK-adres-id' } },
          required: ['id'],
        },
        mutates: false,
        run: (ctx, input) =>
          this.geocoding.lookup(input.id, {
            orgId: ctx.user.orgId ?? null,
            userId: ctx.user.id,
          }),
      },
    ];
  }

  // ─── Write-tools (bevestiging vereist) ─────────────────
  private writeTools(): AiToolDef[] {
    return [
      {
        name: 'create_task',
        description:
          'Maak een nieuwe taak aan. Vereist bevestiging door de gebruiker vóór uitvoeren.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Titel van de taak' },
            description: { type: 'string' },
            taskType: {
              type: 'string',
              description: 'TO_DO, EMAIL, TELEFOONGESPREK, DOCUMENT of GOEDKEURING',
            },
            assigneeId: { type: 'string', description: 'Gebruiker-id om aan toe te wijzen (optioneel)' },
            deadline: { type: 'string', description: 'ISO-datum (optioneel)' },
            entityType: { type: 'string', description: 'Gekoppelde entiteit-type (optioneel)' },
            entityId: { type: 'string', description: 'Gekoppelde entiteit-id (optioneel)' },
          },
          required: ['title'],
        },
        mutates: true,
        summarize: (i) =>
          `Taak aanmaken: "${i.title}"` +
          (i.assigneeId ? `, toegewezen aan ${i.assigneeId}` : '') +
          (i.deadline ? `, deadline ${i.deadline}` : ''),
        run: (ctx, input) =>
          this.tasks.create(
            {
              title: input.title,
              description: input.description,
              taskType: input.taskType,
              assigneeId: input.assigneeId,
              deadline: input.deadline,
              entityType: input.entityType,
              entityId: input.entityId,
            } as any,
            ctx.user,
          ),
      },
      {
        name: 'update_task',
        description:
          'Werk een bestaande taak bij (bijv. status of toewijzing). Vereist bevestiging.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Taak-id (uuid)' },
            title: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', description: 'TE_DOEN, MEE_BEZIG of VOLTOOID' },
            taskType: { type: 'string' },
            assigneeId: { type: 'string' },
            deadline: { type: 'string' },
          },
          required: ['id'],
        },
        mutates: true,
        summarize: (i) =>
          `Taak bijwerken (${i.id})` +
          (i.status ? ` → status ${i.status}` : '') +
          (i.assigneeId ? `, toewijzen aan ${i.assigneeId}` : ''),
        run: (ctx, input) =>
          // Expliciete allowlist: nooit rauwe input doorgeven (mass-assignment).
          this.tasks.update(
            input.id,
            {
              title: input.title,
              description: input.description,
              status: input.status,
              taskType: input.taskType,
              assigneeId: input.assigneeId,
              deadline: input.deadline,
            } as any,
            ctx.user,
          ),
      },
      {
        name: 'create_note',
        description:
          'Voeg een notitie toe aan een record (relatie, aanvraag, offerte, project, planning, gebruiker of werkbon). Vereist bevestiging.',
        inputSchema: {
          type: 'object',
          properties: {
            entityType: {
              type: 'string',
              description: 'CONTACT, REQUEST, QUOTE, PLANNING, PROJECT, USER of WORK_ORDER',
            },
            entityId: { type: 'string', description: 'Id van het record (uuid)' },
            content: { type: 'string', description: 'Inhoud van de notitie' },
          },
          required: ['entityType', 'entityId', 'content'],
        },
        mutates: true,
        summarize: (i) =>
          `Notitie toevoegen aan ${i.entityType} ${i.entityId}: "${String(i.content).slice(0, 80)}"`,
        run: (ctx, input) =>
          this.notes.create(
            {
              entityType: input.entityType,
              entityId: input.entityId,
              content: input.content,
            } as any,
            ctx.user,
          ),
      },
    ];
  }
}
