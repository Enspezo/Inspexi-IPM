/**
 * Testprogramma-seed — deel H (inspectiedomein), I (client-portal) en I2 (online herstel).
 * Zie docs/testprogramma/01-seed-datasets.md §H/§I/§J.
 *
 * Draait NA `beheer.ts` (orgs/users/contacten/locaties staan dan in `refs`), maar is
 * bewust zelfstandig: ontbreekt een refs-sleutel, dan wordt de entiteit alsnog
 * opgezocht (org op slug, user op e-mail, contact/locatie via findFirst op de org).
 *
 * Idempotentie: elk record krijgt een **deterministisch UUID** (`tpId(key)`) zodat een
 * herhaalde run upsert i.p.v. dupliceert. Modellen mét natuurlijke sleutel (ClientUser.email,
 * ClientMagicLink.token, RepairSession.token, LocationImage.nodeId, …) upserten daarop.
 * Er wordt NOOIT een ongefilterde deleteMany gedaan — de hoofdseed-data blijft intact.
 */

import {
  AssetNodeType,
  ChecklistStatus,
  ClientAccessRole,
  ClientUserStatus,
  ContactType,
  DocumentType,
  FindingInspectionType,
  GeneratedDocumentStatus,
  InspectionExecStatus,
  MarkerType,
  MeasurementSheetRecordStatus,
  PrismaClient,
  RepairAccessType,
  RepairSessionStatus,
  SignatureStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

import { DIRTY, SLUGS, TP_PASSWORD, TpRefs, daysFromToday, step } from './shared';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deterministisch UUID uit een logische sleutel. Maakt elke create idempotent
 * (upsert op id) zonder dat het schema een natuurlijke unieke sleutel hoeft te hebben.
 */
function tpId(key: string): string {
  const h = createHash('sha1').update(`inspexi-testprogramma:${key}`).digest('hex');
  const variant = ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return [h.slice(0, 8), h.slice(8, 12), `4${h.slice(13, 16)}`, `${variant}${h.slice(17, 20)}`, h.slice(20, 32)].join(
    '-',
  );
}

/** TTL-gevoelige datums hangen aan de échte klok (anders verlopen ze bij een late run). */
function fromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/** Absoluut pad binnen de lokale storage (UPLOAD_DIR). */
function uploadPath(key: string): string {
  return path.join(process.env.UPLOAD_DIR || './uploads', key);
}

/** Schrijft een bestand naar de lokale storage (maakt tussenmappen aan). */
function writeUpload(key: string, bytes: Buffer): void {
  const full = uploadPath(key);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, bytes);
}

// ── Minimale PNG-generator (overgenomen uit prisma/seed.ts) ──────────────────

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/** Geldige 800x600 blauwdruk-PNG als plattegrond. */
function makeFloorPlanPng(width = 800, height = 600): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1)); // filter-byte 0 + RGB per rij
  const bg: [number, number, number] = [0xe9, 0xee, 0xf4];
  const wall: [number, number, number] = [0x33, 0x49, 0x66];

  const row = Buffer.alloc(stride + 1);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = bg[0];
    row[1 + x * 3 + 1] = bg[1];
    row[1 + x * 3 + 2] = bg[2];
  }
  for (let y = 0; y < height; y++) row.copy(raw, y * (stride + 1));

  const px = (x: number, y: number, c: [number, number, number]) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const off = y * (stride + 1) + 1 + x * 3;
    raw[off] = c[0];
    raw[off + 1] = c[1];
    raw[off + 2] = c[2];
  };
  const hLine = (y: number, x0: number, x1: number, t = 4) => {
    for (let dy = 0; dy < t; dy++) for (let x = x0; x <= x1; x++) px(x, y + dy, wall);
  };
  const vLine = (x: number, y0: number, y1: number, t = 4) => {
    for (let dx = 0; dx < t; dx++) for (let y = y0; y <= y1; y++) px(x + dx, y, wall);
  };

  hLine(0, 0, width - 1);
  hLine(height - 4, 0, width - 1);
  vLine(0, 0, height - 1);
  vLine(width - 4, 0, height - 1);
  vLine(Math.floor(width * 0.5), 0, height - 1);
  hLine(Math.floor(height * 0.5), Math.floor(width * 0.5), width - 1);
  hLine(Math.floor(height * 0.5), 0, Math.floor(width * 0.25));

  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor (RGB)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 1x1 JPEG (base64) — bewijsfoto voor de herstelmelding. */
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';

/** Minimale, geldige één-pagina PDF met een titelregel (herstelverklaring-PDF). */
function makeSimplePdf(title: string): Buffer {
  const stream = `BT /F1 20 Tf 72 760 Td (${title.replace(/[()\\]/g, ' ')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => {
    pdf += `${off.toString().padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

/**
 * Bevriest een meetstaat-template (+secties+velden) tot een snapshot, identiek aan
 * MeasurementSheetRecordsService.createTemplateSnapshot (Decimals → string).
 * Overgenomen uit prisma/seed.ts.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function buildMeasurementSnapshot(t: any): Record<string, unknown> {
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    version: t.version,
    normTypeCode: t.normTypeCode,
    assetTypes: t.assetTypes,
    locationTypes: t.locationTypes,
    finalCheckRules: t.finalCheckRules,
    sections: t.sections.map((section: any) => ({
      code: section.code,
      name: section.name,
      description: section.description,
      isRepeating: section.isRepeating,
      minRows: section.minRows,
      sortOrder: section.sortOrder,
      collapsible: section.collapsible,
      defaultCollapsed: section.defaultCollapsed,
      rowValidationRules: section.rowValidationRules,
      fields: section.fields.map((field: any) => ({
        code: field.code,
        name: field.name,
        description: field.description,
        fieldType: field.fieldType,
        sortOrder: field.sortOrder,
        placeholder: field.placeholder,
        width: field.width,
        unit: field.unit,
        decimals: field.decimals,
        minValue: field.minValue?.toString() ?? null,
        maxValue: field.maxValue?.toString() ?? null,
        dropdownOptions: field.dropdownOptions,
        formula: field.formula,
        formulaDependencies: field.formulaDependencies,
        isRequired: field.isRequired,
        passFailEnabled: field.passFailEnabled,
        passFailOperator: field.passFailOperator,
        passFailValue: field.passFailValue?.toString() ?? null,
        passFailMinValue: field.passFailMinValue?.toString() ?? null,
        passFailMaxValue: field.passFailMaxValue?.toString() ?? null,
        passFailValues: field.passFailValues,
        passFailFailMessage: field.passFailFailMessage,
        autoFindingEnabled: field.autoFindingEnabled,
        autoFindingTemplateId: field.autoFindingTemplateId,
        copyValueOnNewRow: field.copyValueOnNewRow,
        allowBulkEdit: field.allowBulkEdit,
      })),
    })),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─────────────────────────────────────────────────────────────────────────────
// Resolvers — refs eerst, anders zelf opzoeken (functie moet los kunnen draaien)
// ─────────────────────────────────────────────────────────────────────────────

async function resolveOrgId(prisma: PrismaClient, refs: TpRefs, key: string, slug: string): Promise<string> {
  const fromRefs = refs.orgs[key];
  if (fromRefs) {
    const ok = await prisma.organization.findUnique({ where: { id: fromRefs }, select: { id: true } });
    if (ok) return ok.id;
  }
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true } });
  if (!org) throw new Error(`Organisatie met slug "${slug}" niet gevonden — draai eerst pnpm db:seed.`);
  refs.orgs[key] = org.id;
  step(`org "${slug}" zelf opgezocht (refs.orgs.${key} ontbrak of was ongeldig)`);
  return org.id;
}

/**
 * Staf-gebruiker binnen een specifieke org. De org-check is essentieel: een refs-sleutel
 * als "inspecteur" kan bij een ándere tenant horen — die zou hier cross-tenant data maken.
 */
async function resolveUserId(
  prisma: PrismaClient,
  refs: TpRefs,
  candidateKeys: string[],
  email: string,
  expectedOrgId: string,
): Promise<string> {
  for (const key of candidateKeys) {
    const id = refs.users[key];
    if (!id) continue;
    const ok = await prisma.user.findFirst({
      where: { id, orgId: expectedOrgId, isDeleted: false },
      select: { id: true },
    });
    if (ok) return ok.id;
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, orgId: true } });
  if (!user) throw new Error(`Gebruiker "${email}" niet gevonden — draai eerst pnpm db:seed.`);
  if (user.orgId !== expectedOrgId) {
    throw new Error(`Gebruiker "${email}" hoort niet bij de verwachte organisatie (orgId ${user.orgId}).`);
  }
  refs.users[candidateKeys[0]] = user.id;
  step(`user "${email}" zelf opgezocht (refs.users.${candidateKeys.join('/')} ontbrak of wees naar een andere org)`);
  return user.id;
}

/** Contact binnen de org; valt terug op het oudste contact, en maakt er anders zelf één. */
async function resolveContactId(
  prisma: PrismaClient,
  refs: TpRefs,
  candidateKeys: string[],
  orgId: string,
  fallbackName: string,
): Promise<string> {
  for (const key of candidateKeys) {
    const id = refs.contacts[key];
    if (!id) continue;
    const ok = await prisma.contact.findFirst({ where: { id, orgId, isDeleted: false }, select: { id: true } });
    if (ok) return ok.id;
  }
  const existing = await prisma.contact.findFirst({
    where: { orgId, isDeleted: false },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) {
    refs.contacts[candidateKeys[0]] = existing.id;
    step(`contact zelf opgezocht in org (refs.contacts.${candidateKeys.join('/')} ontbrak)`);
    return existing.id;
  }
  const created = await prisma.contact.create({
    data: { id: tpId(`contact:${orgId}`), orgId, type: ContactType.COMPANY, companyName: fallbackName },
  });
  refs.contacts[candidateKeys[0]] = created.id;
  step(`geen contact in org gevonden → TP-contact "${fallbackName}" aangemaakt`);
  return created.id;
}

/**
 * Kiest een CRM-locatie die nog géén AssetNode-wortel heeft (rootLocationId is uniek).
 * Volgorde: eerst wat beheer.ts in refs.locations zette, dan de rest van de org;
 * is alles bezet, dan maakt deze helper zelf een TP-locatie aan.
 */
async function pickFreeLocationId(
  prisma: PrismaClient,
  orgId: string,
  contactId: string,
  refs: TpRefs,
  used: Set<string>,
  fallback: { name: string; key: string },
): Promise<string> {
  const orgLocations = await prisma.location.findMany({
    where: { orgId },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  const inOrg = new Set(orgLocations.map((l) => l.id));
  const ordered = [...Object.values(refs.locations).filter((id) => inOrg.has(id)), ...orgLocations.map((l) => l.id)];

  const seen = new Set<string>();
  for (const id of ordered) {
    if (seen.has(id) || used.has(id)) continue;
    seen.add(id);
    const root = await prisma.assetNode.findUnique({ where: { rootLocationId: id }, select: { id: true } });
    if (root) continue; // al bezet door een andere boom (o.a. de demo-boom uit seed.ts)
    used.add(id);
    return id;
  }

  const created = await prisma.location.upsert({
    where: { id: tpId(fallback.key) },
    update: { name: fallback.name },
    create: {
      id: tpId(fallback.key),
      orgId,
      contactId,
      name: fallback.name,
      street: 'Testweg',
      houseNumber: '1',
      postalCode: '1012AB',
      city: 'Amsterdam',
    },
  });
  used.add(created.id);
  step(`geen vrije CRM-locatie → TP-locatie "${fallback.name}" aangemaakt`);
  return created.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// AssetNode-helpers (ltree: ouder vóór kind, nooit nodeNumber/path/depth zetten)
// ─────────────────────────────────────────────────────────────────────────────

interface NodeSpec {
  key: string;
  orgId: string;
  nodeType: AssetNodeType;
  typeCode: string;
  name: string;
  identifier: string;
  parentId?: string;
  rootLocationId?: string;
  description?: string;
  statusCode?: string;
  sortOrder?: number;
  createdBy: string;
}

/**
 * Maakt/actualiseert één node. `parentId` staat bewust NIET in de update-tak: een
 * UPDATE OF parent_id zou de ltree-trigger het hele subtree-pad laten herschrijven.
 * `nodeNumber`, `path` en `depth` blijven onaangeroerd (server/DB-owned).
 */
async function ensureNode(prisma: PrismaClient, spec: NodeSpec): Promise<string> {
  const id = tpId(spec.key);
  await prisma.assetNode.upsert({
    where: { id },
    create: {
      id,
      orgId: spec.orgId,
      nodeType: spec.nodeType,
      parentId: spec.parentId ?? null,
      rootLocationId: spec.rootLocationId ?? null,
      typeCode: spec.typeCode,
      name: spec.name,
      identifier: spec.identifier,
      description: spec.description ?? null,
      statusCode: spec.statusCode ?? 'new',
      sortOrder: spec.sortOrder ?? 0,
      createdBy: spec.createdBy,
    },
    update: {
      typeCode: spec.typeCode,
      name: spec.name,
      identifier: spec.identifier,
      description: spec.description ?? null,
      statusCode: spec.statusCode ?? 'new',
      sortOrder: spec.sortOrder ?? 0,
    },
  });
  return id;
}

/** Wortel-node: hergebruikt de al gekoppelde CRM-locatie, of claimt een vrije. */
async function ensureRootNode(
  prisma: PrismaClient,
  refs: TpRefs,
  used: Set<string>,
  spec: Omit<NodeSpec, 'parentId' | 'rootLocationId'> & { contactId: string; fallbackLocationName: string },
): Promise<{ nodeId: string; locationId: string }> {
  const existing = await prisma.assetNode.findUnique({
    where: { id: tpId(spec.key) },
    select: { rootLocationId: true },
  });
  let locationId = existing?.rootLocationId ?? null;
  if (locationId) {
    used.add(locationId);
  } else {
    locationId = await pickFreeLocationId(prisma, spec.orgId, spec.contactId, refs, used, {
      name: spec.fallbackLocationName,
      key: `location:${spec.key}`,
    });
  }
  const nodeId = await ensureNode(prisma, { ...spec, rootLocationId: locationId });
  return { nodeId, locationId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hoofdfunctie
// ─────────────────────────────────────────────────────────────────────────────

export async function seedInspectie(prisma: PrismaClient, refs: TpRefs): Promise<void> {
  console.log('\n🔍 Testprogramma H/I — inspectiedomein, client-portal & online herstel');

  // ── 0. Referenties ─────────────────────────────────────────────────────────
  const demoOrgId = await resolveOrgId(prisma, refs, 'demo', SLUGS.demo);
  const testOrgId = await resolveOrgId(prisma, refs, 'test', SLUGS.test);

  const adminId = await resolveUserId(
    prisma,
    refs,
    ['demoAdmin', 'admin', 'orgAdmin'],
    'admin@inspexi-demo.nl',
    demoOrgId,
  );
  const managerId = await resolveUserId(
    prisma,
    refs,
    ['demoManager', 'manager'],
    'manager@inspexi-demo.nl',
    demoOrgId,
  );
  const inspecteurId = await resolveUserId(
    prisma,
    refs,
    ['demoInspecteur', 'inspecteur'],
    'inspecteur@inspexi-demo.nl',
    demoOrgId,
  );
  const testAdminId = await resolveUserId(
    prisma,
    refs,
    ['testAdmin', 'testbedrijfAdmin'],
    'admin@testbedrijf.nl',
    testOrgId,
  );

  const demoContactId = await resolveContactId(
    prisma,
    refs,
    ['net', 'demo', 'demoNet', 'contact1'],
    demoOrgId,
    'TP Testklant BV',
  );
  const testContactId = await resolveContactId(prisma, refs, ['test', 'testbedrijf'], testOrgId, 'TP Testklant TB BV');

  step(
    `refs: org demo=${demoOrgId.slice(0, 8)}…, org test=${testOrgId.slice(0, 8)}…, contact demo=${demoContactId.slice(0, 8)}…`,
  );

  // ── H1. AssetNode-bomen ────────────────────────────────────────────────────
  // Strikt sequentieel (ouder vóór kind) — de ltree-trigger heeft het ouderpad nodig.
  const usedLocations = new Set<string>();

  // Boom A (ondiep): wortel-LOCATION → 3 assets.
  const treeA = await ensureRootNode(prisma, refs, usedLocations, {
    key: 'node:A:root',
    orgId: demoOrgId,
    nodeType: AssetNodeType.LOCATION,
    typeCode: 'distribution_room',
    name: 'TP Boom A — hoofdlocatie (ondiep)',
    identifier: 'TP-A-ROOT',
    createdBy: inspecteurId,
    contactId: demoContactId,
    fallbackLocationName: 'TP Locatie Boom A',
  });
  refs.assetNodes.treeARoot = treeA.nodeId;

  const treeAAssets: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const nodeId = await ensureNode(prisma, {
      key: `node:A:asset:${i}`,
      orgId: demoOrgId,
      nodeType: AssetNodeType.ASSET,
      parentId: treeA.nodeId,
      typeCode: 'electrical_installation',
      name: `TP Verdeelinrichting A${i}`,
      identifier: `TP-A-0${i}`,
      statusCode: 'new',
      sortOrder: i - 1,
      createdBy: inspecteurId,
    });
    treeAAssets.push(nodeId);
    refs.assetNodes[`treeAAsset${i}`] = nodeId;
  }

  // Boom B (diep, ~5 niveaus): wortel → deellocatie → deellocatie → asset → sub-asset.
  const treeB = await ensureRootNode(prisma, refs, usedLocations, {
    key: 'node:B:root',
    orgId: demoOrgId,
    nodeType: AssetNodeType.LOCATION,
    typeCode: 'distribution_room',
    name: 'TP Boom B — hoofdlocatie (diep)',
    identifier: 'TP-B-ROOT',
    createdBy: inspecteurId,
    contactId: demoContactId,
    fallbackLocationName: 'TP Locatie Boom B',
  });
  refs.assetNodes.treeBRoot = treeB.nodeId;

  const treeBSub1 = await ensureNode(prisma, {
    key: 'node:B:sub1',
    orgId: demoOrgId,
    nodeType: AssetNodeType.LOCATION,
    parentId: treeB.nodeId,
    typeCode: 'distribution_room',
    name: 'TP Verdieping 1',
    identifier: 'TP-B-SUB1',
    createdBy: inspecteurId,
  });
  refs.assetNodes.treeBSub1 = treeBSub1;

  const treeBSub2 = await ensureNode(prisma, {
    key: 'node:B:sub2',
    orgId: demoOrgId,
    nodeType: AssetNodeType.LOCATION,
    parentId: treeBSub1,
    typeCode: 'distribution_room',
    name: 'TP Technische ruimte 1.4',
    identifier: 'TP-B-SUB2',
    createdBy: inspecteurId,
  });
  refs.assetNodes.treeBSub2 = treeBSub2;

  const treeBAsset = await ensureNode(prisma, {
    key: 'node:B:asset',
    orgId: demoOrgId,
    nodeType: AssetNodeType.ASSET,
    parentId: treeBSub2,
    typeCode: 'electrical_installation',
    name: 'TP Hoofdverdeler B',
    identifier: 'TP-B-01',
    createdBy: inspecteurId,
  });
  refs.assetNodes.treeBAsset = treeBAsset;

  const treeBSubAsset = await ensureNode(prisma, {
    key: 'node:B:subasset',
    orgId: demoOrgId,
    nodeType: AssetNodeType.ASSET,
    parentId: treeBAsset,
    typeCode: 'electrical_installation',
    name: `TP Onderverdeler B1 ${DIRTY.emoji}`,
    identifier: 'TP-B-01-01',
    createdBy: inspecteurId,
  });
  refs.assetNodes.treeBSubAsset = treeBSubAsset;

  // Boom C (breed): wortel → 25 assets (lijst-performance, INS-08).
  const treeC = await ensureRootNode(prisma, refs, usedLocations, {
    key: 'node:C:root',
    orgId: demoOrgId,
    nodeType: AssetNodeType.LOCATION,
    typeCode: 'distribution_room',
    name: 'TP Boom C — hoofdlocatie (breed)',
    identifier: 'TP-C-ROOT',
    createdBy: inspecteurId,
    contactId: demoContactId,
    fallbackLocationName: 'TP Locatie Boom C',
  });
  refs.assetNodes.treeCRoot = treeC.nodeId;

  let treeCFirst = '';
  let treeCLast = '';
  for (let i = 1; i <= 25; i++) {
    const nr = String(i).padStart(2, '0');
    const nodeId = await ensureNode(prisma, {
      key: `node:C:asset:${nr}`,
      orgId: demoOrgId,
      nodeType: AssetNodeType.ASSET,
      parentId: treeC.nodeId,
      typeCode: 'electrical_installation',
      name: `TP Groepenkast C${nr}`,
      identifier: `TP-C-${nr}`,
      sortOrder: i - 1,
      createdBy: inspecteurId,
    });
    if (i === 1) treeCFirst = nodeId;
    if (i === 25) treeCLast = nodeId;
  }
  refs.assetNodes.treeCAsset01 = treeCFirst;
  refs.assetNodes.treeCAsset25 = treeCLast;

  // Kleine boom in testbedrijf — doelwit voor de cross-tenant-tests (SEC-12/INS-43/44).
  const treeTb = await ensureRootNode(prisma, refs, usedLocations, {
    key: 'node:TB:root',
    orgId: testOrgId,
    nodeType: AssetNodeType.LOCATION,
    typeCode: 'distribution_room',
    name: 'TP Testbedrijf — hoofdlocatie',
    identifier: 'TP-TB-ROOT',
    createdBy: testAdminId,
    contactId: testContactId,
    fallbackLocationName: 'TP Locatie Testbedrijf',
  });
  refs.assetNodes.tbRoot = treeTb.nodeId;

  const tbAsset = await ensureNode(prisma, {
    key: 'node:TB:asset',
    orgId: testOrgId,
    nodeType: AssetNodeType.ASSET,
    parentId: treeTb.nodeId,
    typeCode: 'electrical_installation',
    name: 'TP Verdeler TB-01',
    identifier: 'TP-TB-01',
    createdBy: testAdminId,
  });
  refs.assetNodes.tbAsset = tbAsset;

  step('H1: 3 bomen in inspexidemo (A ondiep 3 assets, B diep ~5 niveaus, C breed 25 assets) + 1 boom in testbedrijf');

  // ── H2. Inspectieplannen ───────────────────────────────────────────────────
  // RAP-TEST-100 is NIET uniek in de DB → eerst opruimen wat er onbedoeld op staat.
  const repairPlanId = tpId('plan:repair');
  const strays = await prisma.inspectionPlan.findMany({
    where: { orgId: demoOrgId, referenceNumber: 'RAP-TEST-100', id: { not: repairPlanId } },
    select: { id: true },
  });
  for (const [i, stray] of strays.entries()) {
    await prisma.inspectionPlan.update({
      where: { id: stray.id },
      data: { referenceNumber: `RAP-TEST-100-DUP-${i + 1}`, onlineRepairEnabled: false },
    });
  }
  if (strays.length > 0) {
    step(`⚠️  ${strays.length} ander(e) plan(nen) droeg(en) RAP-TEST-100 → hernoemd naar RAP-TEST-100-DUP-n`);
  }
  const globalDupes = await prisma.inspectionPlan.count({
    where: { referenceNumber: 'RAP-TEST-100', orgId: { not: demoOrgId } },
  });
  if (globalDupes > 0) {
    step(`ℹ️  RAP-TEST-100 komt ook ${globalDupes}× voor in andere orgs (lookup is org-scoped, dus onschadelijk)`);
  }

  interface PlanSpec {
    refKey: string;
    key: string;
    referenceNumber: string;
    projectName: string;
    description?: string;
    normTypeCode: string;
    statusCode: string;
    rootNodeId: string;
    locationId: string;
    plannedDate?: Date;
    submittedAt?: Date;
    reviewedAt?: Date;
    approvedAt?: Date;
    completedAt?: Date;
    assign?: boolean;
    postalCode?: string;
    onlineRepairEnabled?: boolean;
  }

  const planSpecs: PlanSpec[] = [
    {
      refKey: 'draft',
      key: 'plan:draft',
      referenceNumber: 'TP-RAP-001',
      projectName: 'TP Concept-inspectie (draft)',
      description: DIRTY.hugeText.slice(0, 4000),
      normTypeCode: 'NEN1010',
      statusCode: 'draft',
      rootNodeId: treeA.nodeId,
      locationId: treeA.locationId,
    },
    {
      refKey: 'planned',
      key: 'plan:planned',
      referenceNumber: 'TP-RAP-002',
      projectName: 'TP Plan A — ingepland (boom A)',
      normTypeCode: 'NEN3140',
      statusCode: 'planned',
      rootNodeId: treeA.nodeId,
      locationId: treeA.locationId,
      plannedDate: daysFromToday(3),
      assign: true,
    },
    {
      refKey: 'inProgress',
      key: 'plan:in-progress',
      referenceNumber: 'TP-RAP-003',
      projectName: 'TP Plan B — in uitvoering (boom B, diep)',
      normTypeCode: 'SCOPE_8',
      statusCode: 'in_progress',
      rootNodeId: treeB.nodeId,
      locationId: treeB.locationId,
      plannedDate: daysFromToday(-1),
      assign: true,
    },
    {
      refKey: 'pendingReview',
      key: 'plan:pending-review',
      referenceNumber: 'TP-RAP-004',
      projectName: 'TP Plan C — ter review (boom C, 25 assets)',
      normTypeCode: 'SCOPE_10',
      statusCode: 'pending_review',
      rootNodeId: treeC.nodeId,
      locationId: treeC.locationId,
      plannedDate: daysFromToday(-5),
      submittedAt: daysFromToday(-4),
      assign: true,
    },
    {
      refKey: 'approved',
      key: 'plan:approved',
      referenceNumber: 'TP-RAP-005',
      projectName: 'TP Goedgekeurde inspectie (met ondertekenbaar rapport)',
      normTypeCode: 'SCOPE_12',
      statusCode: 'approved',
      rootNodeId: treeA.nodeId,
      locationId: treeA.locationId,
      plannedDate: daysFromToday(-14),
      submittedAt: daysFromToday(-12),
      reviewedAt: daysFromToday(-11),
      approvedAt: daysFromToday(-10),
      assign: true,
    },
    {
      refKey: 'repair',
      key: 'plan:repair',
      referenceNumber: 'RAP-TEST-100',
      projectName: 'TP Online herstel — afgeronde inspectie',
      normTypeCode: 'NEN1010',
      statusCode: 'completed',
      rootNodeId: treeA.nodeId,
      locationId: treeA.locationId,
      plannedDate: daysFromToday(-21),
      submittedAt: daysFromToday(-20),
      reviewedAt: daysFromToday(-19),
      approvedAt: daysFromToday(-19),
      completedAt: daysFromToday(-18),
      assign: true,
      postalCode: '1012AB',
      onlineRepairEnabled: true,
    },
    {
      refKey: 'cancelled',
      key: 'plan:cancelled',
      referenceNumber: 'TP-RAP-007',
      projectName: 'TP Geannuleerde inspectie',
      normTypeCode: 'IEC62446_1',
      statusCode: 'cancelled',
      rootNodeId: treeB.nodeId,
      locationId: treeB.locationId,
      plannedDate: daysFromToday(-30),
    },
  ];

  for (const spec of planSpecs) {
    const id = tpId(spec.key);
    const common = {
      projectName: spec.projectName,
      description: spec.description ?? null,
      referenceNumber: spec.referenceNumber,
      normTypeCode: spec.normTypeCode,
      statusCode: spec.statusCode,
      locationId: spec.locationId,
      addressStreet: 'Testweg',
      addressHouseNumber: '1',
      addressPostalCode: spec.postalCode ?? '1012AB',
      addressCity: 'Amsterdam',
      plannedDate: spec.plannedDate ?? null,
      submittedAt: spec.submittedAt ?? null,
      reviewedAt: spec.reviewedAt ?? null,
      approvedAt: spec.approvedAt ?? null,
      completedAt: spec.completedAt ?? null,
      assignedTo: spec.assign ? inspecteurId : null,
      reviewerId: spec.assign ? managerId : null,
      onlineRepairEnabled: spec.onlineRepairEnabled ?? false,
    };
    await prisma.inspectionPlan.upsert({
      where: { id },
      create: { id, orgId: demoOrgId, contactId: demoContactId, createdBy: adminId, ...common },
      update: common,
    });
    await prisma.inspectionPlanLocation.upsert({
      where: { inspectionPlanId_assetNodeId: { inspectionPlanId: id, assetNodeId: spec.rootNodeId } },
      update: { isPrimary: true },
      create: { orgId: demoOrgId, inspectionPlanId: id, assetNodeId: spec.rootNodeId, isPrimary: true },
    });
    refs.plans[spec.refKey] = id;
  }

  // Testbedrijf-plan op de kleine boom (cross-tenant-doelwit).
  const tbPlanId = tpId('plan:tb');
  const tbPlanData = {
    projectName: 'TP Testbedrijf-inspectie',
    referenceNumber: 'TB-RAP-001',
    normTypeCode: 'NEN1010',
    statusCode: 'planned',
    locationId: treeTb.locationId,
    addressPostalCode: '5611AA',
    addressCity: 'Eindhoven',
    plannedDate: daysFromToday(7),
  };
  await prisma.inspectionPlan.upsert({
    where: { id: tbPlanId },
    create: { id: tbPlanId, orgId: testOrgId, contactId: testContactId, createdBy: testAdminId, ...tbPlanData },
    update: tbPlanData,
  });
  await prisma.inspectionPlanLocation.upsert({
    where: { inspectionPlanId_assetNodeId: { inspectionPlanId: tbPlanId, assetNodeId: treeTb.nodeId } },
    update: { isPrimary: true },
    create: { orgId: testOrgId, inspectionPlanId: tbPlanId, assetNodeId: treeTb.nodeId, isPrimary: true },
  });
  refs.plans.tbPlan = tbPlanId;

  step(
    `H2: 7 plannen in inspexidemo (draft/planned/in_progress/pending_review/approved/completed/cancelled) over 6 normtypes + 1 plan in testbedrijf`,
  );

  // ── H3. Classificatie C1 kritiek + findings ────────────────────────────────
  // C1 in het bestaande NEN1010_DEFAULT-model kritiek maken (niet opnieuw aanmaken).
  const criticalUpdate = await prisma.classificationOption.updateMany({
    where: {
      code: 'C1',
      characteristic: { code: 'SEVERITY', classificationModel: { code: 'NEN1010_DEFAULT' } },
    },
    data: { isCritical: true },
  });
  step(`H3: ClassificationOption C1 (NEN1010_DEFAULT/SEVERITY) op isCritical=true (${criticalUpdate.count} rij)`);

  interface FindingSpec {
    refKey: string;
    key: string;
    planId: string;
    assetNodeId: string;
    inspectionType: FindingInspectionType;
    shortDescription: string;
    longDescription?: string;
    recommendation?: string;
    normReference?: string;
    statusCode?: string;
    isCritical?: boolean;
    classificationValues?: Record<string, string>;
    resolvedAt?: Date;
  }

  const findingSpecs: FindingSpec[] = [
    {
      refKey: 'critical',
      key: 'finding:repair:critical',
      planId: refs.plans.repair,
      assetNodeId: treeAAssets[0],
      inspectionType: FindingInspectionType.visual,
      shortDescription: 'Aanraakgevaar: ontbrekende afdekking op hoofdverdeler',
      longDescription: 'Spanningvoerende delen zijn direct aanraakbaar. Directe afscherming vereist.',
      recommendation: 'Afdekking direct terugplaatsen en installatie spanningsloos maken tijdens herstel.',
      normReference: 'NEN 1010 art. 412',
      statusCode: 'open',
      isCritical: true,
      classificationValues: { SEVERITY: 'C1' },
    },
    {
      refKey: 'openNonCritical',
      key: 'finding:repair:open',
      planId: refs.plans.repair,
      assetNodeId: treeAAssets[1],
      inspectionType: FindingInspectionType.measurement,
      shortDescription: 'Isolatieweerstand net onder de norm op groep 3',
      longDescription: 'Gemeten 0,30 MΩ tegenover de minimumwaarde van 1 MΩ.',
      normReference: 'NEN 1010 art. 612',
      statusCode: 'open',
      isCritical: false,
      classificationValues: { SEVERITY: 'C2' },
    },
    {
      refKey: 'resolved',
      key: 'finding:repair:resolved',
      planId: refs.plans.repair,
      assetNodeId: treeAAssets[2],
      inspectionType: FindingInspectionType.visual,
      shortDescription: 'Ontbrekend groepenoverzicht in verdeelkast',
      longDescription: 'Het groepenoverzicht ontbrak; inmiddels aangebracht en gecontroleerd.',
      normReference: 'NEN 1010 art. 514',
      statusCode: 'resolved',
      isCritical: false,
      classificationValues: { SEVERITY: 'C3' },
      resolvedAt: daysFromToday(-2),
    },
    {
      // §J: HTML/JS + emoji + CJK in één tekstveld → moet overal veilig escapen.
      refKey: 'dirty',
      key: 'finding:draft:dirty',
      planId: refs.plans.draft,
      assetNodeId: treeAAssets[0],
      inspectionType: FindingInspectionType.visual,
      shortDescription: `${DIRTY.script} ${DIRTY.emoji} ${DIRTY.cjk}`,
      longDescription: `${DIRTY.imgOnerror} — ${DIRTY.sqlDrop} — ${DIRTY.rtl} — ${DIRTY.mixed}`,
      recommendation: DIRTY.longName,
      statusCode: 'open',
      classificationValues: { SEVERITY: 'C2' },
    },
    {
      refKey: 'treeB1',
      key: 'finding:in-progress:1',
      planId: refs.plans.inProgress,
      assetNodeId: treeBAsset,
      inspectionType: FindingInspectionType.visual,
      shortDescription: 'Kabelinvoer niet trekontlast',
      normReference: 'NEN 1010 art. 526',
      statusCode: 'open',
      classificationValues: { SEVERITY: 'C2' },
    },
    {
      refKey: 'treeB2',
      key: 'finding:in-progress:2',
      planId: refs.plans.inProgress,
      assetNodeId: treeBSubAsset,
      inspectionType: FindingInspectionType.measurement,
      shortDescription: 'Te hoge overgangsweerstand aardverbinding',
      normReference: 'NEN 3140 §5.4',
      statusCode: 'acknowledged',
      classificationValues: { SEVERITY: 'C2' },
    },
    {
      refKey: 'treeC1',
      key: 'finding:pending-review:1',
      planId: refs.plans.pendingReview,
      assetNodeId: treeCFirst,
      inspectionType: FindingInspectionType.visual,
      shortDescription: 'Ontbrekende labeling op eindgroepen',
      statusCode: 'open',
      classificationValues: { SEVERITY: 'C3' },
    },
    {
      refKey: 'approved1',
      key: 'finding:approved:1',
      planId: refs.plans.approved,
      assetNodeId: treeAAssets[1],
      inspectionType: FindingInspectionType.visual,
      shortDescription: 'Beschadigde mantel op hoofdvoedingskabel',
      normReference: 'NEN 1010 art. 526',
      statusCode: 'open',
      classificationValues: { SEVERITY: 'C2' },
    },
  ];

  for (const spec of findingSpecs) {
    const id = tpId(spec.key);
    const data = {
      inspectionType: spec.inspectionType,
      shortDescription: spec.shortDescription,
      longDescription: spec.longDescription ?? null,
      recommendation: spec.recommendation ?? null,
      normReference: spec.normReference ?? null,
      statusCode: spec.statusCode ?? 'open',
      // isCritical is server-owned; in een seed komt er geen service langs → zelf
      // consistent zetten met classificationValues × ClassificationOption.isCritical.
      isCritical: spec.isCritical ?? false,
      classificationValues: (spec.classificationValues ?? {}) as Record<string, string>,
      resolvedAt: spec.resolvedAt ?? null,
    };
    await prisma.finding.upsert({
      where: { id },
      create: {
        id,
        orgId: demoOrgId,
        assetNodeId: spec.assetNodeId,
        inspectionPlanId: spec.planId,
        createdBy: inspecteurId,
        ...data,
      },
      update: data,
    });
    refs.findings[spec.refKey] = id;
  }
  step(`H3: ${findingSpecs.length} constateringen (1 open-kritiek C1, 1 open C2, 1 resolved, 1 met DIRTY-strings)`);

  // ── H4a. Checklist-versie 2.0 (voedt de "nieuwere versie"-banner, INS-04) ──
  const checklistV1 = await prisma.checklist.findFirst({
    where: { code: 'CL-NEN1010', version: '1.0' },
    include: { itemLinks: true },
  });
  if (!checklistV1) {
    step('⚠️  Checklist CL-NEN1010 v1.0 niet gevonden — versie 2.0 overgeslagen');
  } else {
    const v2Id = tpId('checklist:CL-NEN1010:2.0');
    const v2Data = {
      name: 'NEN 1010 basis-inspectiechecklist',
      description: 'Versie 2.0 — herziene NEN 1010-checklist (testprogramma)',
      normTypeCode: checklistV1.normTypeCode,
      assetTypes: checklistV1.assetTypes,
      locationTypes: checklistV1.locationTypes,
      status: ChecklistStatus.ACTIEF,
      previousVersionId: checklistV1.id,
      publishedAt: daysFromToday(-1),
    };
    await prisma.checklist.upsert({
      where: { id: v2Id },
      create: {
        id: v2Id,
        isSystem: checklistV1.isSystem,
        orgId: checklistV1.orgId,
        code: 'CL-NEN1010',
        version: '2.0',
        createdBy: checklistV1.createdBy,
        ...v2Data,
      },
      update: v2Data,
    });
    // Bestaande ChecklistItems hergebruiken (geen nieuwe systeem-items maken).
    for (const link of checklistV1.itemLinks) {
      await prisma.checklistItemLink.upsert({
        where: { checklistId_checklistItemId: { checklistId: v2Id, checklistItemId: link.checklistItemId } },
        update: { sortOrder: link.sortOrder, isRequired: link.isRequired },
        create: {
          checklistId: v2Id,
          checklistItemId: link.checklistItemId,
          sortOrder: link.sortOrder,
          isRequired: link.isRequired,
        },
      });
    }
    if (checklistV1.status !== ChecklistStatus.VERVALLEN) {
      await prisma.checklist.update({
        where: { id: checklistV1.id },
        data: { status: ChecklistStatus.VERVALLEN, retiredAt: daysFromToday(-1) },
      });
    }
    step(`H4: checklist CL-NEN1010 v2.0 (ACTIEF, ${checklistV1.itemLinks.length} items) — v1.0 op VERVALLEN`);
  }

  // ── H4b. Meetstaat-record + visuele inspecties + meetrecords ───────────────
  const measTemplate = await prisma.measurementSheetTemplate.findFirst({
    where: { code: 'MS-NEN1010-ISO' },
    include: { sections: { include: { fields: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } } },
    orderBy: { version: 'desc' },
  });
  if (!measTemplate) {
    step('⚠️  Meetstaat-template MS-NEN1010-ISO niet gevonden — meetstaat-record overgeslagen');
  } else {
    const snapshot = buildMeasurementSnapshot(measTemplate);
    const msrId = tpId('measurement-sheet-record:A1');
    const msrData = {
      templateVersion: measTemplate.version,
      templateSnapshot: snapshot as object,
      status: MeasurementSheetRecordStatus.COMPLETED,
      // Rij 0 haalt de pass/fail-regel (r_iso ≥ 1), rij 1 faalt met 0,3 MΩ.
      data: {
        isolation: {
          '0': { group: { value: 'Groep 1', passFail: null }, r_iso: { value: 210.5, passFail: 'pass' } },
          '1': { group: { value: 'Groep 3', passFail: null }, r_iso: { value: 0.3, passFail: 'fail' } },
        },
      } as object,
      finalCheckExecuted: true,
      finalCheckPassed: false,
      finalCheckResults: {
        passed: false,
        results: [
          {
            ruleType: 'passFail',
            passed: false,
            message: 'Isolatieweerstand 0,30 MΩ ligt onder de norm (≥ 1 MΩ) op groep 3',
            details: { sectionCode: 'isolation', rowIndex: '1', fieldCode: 'r_iso' },
          },
        ],
      } as object,
      completedAt: daysFromToday(-2),
    };
    await prisma.measurementSheetRecord.upsert({
      where: { id: msrId },
      create: {
        id: msrId,
        orgId: demoOrgId,
        templateId: measTemplate.id,
        assetNodeId: treeAAssets[0],
        inspectionPlanId: refs.plans.planned,
        createdBy: inspecteurId,
        ...msrData,
      },
      update: msrData,
    });
    step('H4: meetstaat-record op boom A/asset 1 (rij 0 pass 210,5 MΩ · rij 1 fail 0,3 MΩ, finalCheckPassed=false)');
  }

  // VisualInspection + MeasurementRecord per plan A (planned) en plan B (in_progress).
  const execTargets: Array<{ key: string; planId: string; assetNodeId: string }> = [
    { key: 'A', planId: refs.plans.planned, assetNodeId: treeAAssets[0] },
    { key: 'B', planId: refs.plans.inProgress, assetNodeId: treeBAsset },
  ];
  for (const target of execTargets) {
    const viId = tpId(`visual-inspection:${target.key}`);
    const viData = {
      status: InspectionExecStatus.in_progress,
      checklistResults: [
        { itemCode: 'NEN1010-001', label: 'Is de hoofdschakelaar correct geïnstalleerd?', result: 'pass' },
        { itemCode: 'NEN1010-002', label: 'Zijn alle aardverbindingen deugdelijk?', result: 'fail' },
      ] as object,
      inspectorId: inspecteurId,
      startedAt: daysFromToday(-1),
      deviceId: 'tp-device-001',
    };
    await prisma.visualInspection.upsert({
      where: { id: viId },
      create: {
        id: viId,
        orgId: demoOrgId,
        assetNodeId: target.assetNodeId,
        inspectionPlanId: target.planId,
        ...viData,
      },
      update: viData,
    });

    const mrId = tpId(`measurement-record:${target.key}`);
    const mrData = {
      status: InspectionExecStatus.completed,
      measurements: [
        { code: 'r_iso', label: 'Isolatieweerstand', value: 210.5, unit: 'MΩ', passFail: 'pass' },
        { code: 'z_lus', label: 'Lusimpedantie', value: 0.42, unit: 'Ω', passFail: 'pass' },
      ] as object,
      instrumentType: 'Isolatietester',
      instrumentSerial: 'TP-INSTR-0001',
      inspectorId: inspecteurId,
      startedAt: daysFromToday(-1),
      completedAt: daysFromToday(-1),
      deviceId: 'tp-device-001',
    };
    await prisma.measurementRecord.upsert({
      where: { id: mrId },
      create: {
        id: mrId,
        orgId: demoOrgId,
        assetNodeId: target.assetNodeId,
        inspectionPlanId: target.planId,
        ...mrData,
      },
      update: mrData,
    });
  }
  step('H4: 2 visuele inspecties (in_progress, 1 OK + 1 NOK) + 2 meetrecords op plan A/B');

  // ── H5. Plattegrond op de wortel van boom A ────────────────────────────────
  const floorPlanKey = `${demoOrgId}/${tpId('floorplan:A')}-tp-plattegrond-boom-a.png`;
  const floorPlanBytes = makeFloorPlanPng(800, 600);
  writeUpload(floorPlanKey, floorPlanBytes);
  const floorPlanImage = await prisma.locationImage.upsert({
    where: { nodeId: treeA.nodeId },
    update: {
      storagePath: floorPlanKey,
      originalFilename: 'tp-plattegrond-boom-a.png',
      fileSize: floorPlanBytes.length,
      mimeType: 'image/png',
      width: 800,
      height: 600,
    },
    create: {
      id: tpId('location-image:A'),
      orgId: demoOrgId,
      nodeId: treeA.nodeId,
      storagePath: floorPlanKey,
      originalFilename: 'tp-plattegrond-boom-a.png',
      fileSize: floorPlanBytes.length,
      mimeType: 'image/png',
      width: 800,
      height: 600,
      createdBy: inspecteurId,
    },
  });

  const markerSpecs: Array<{
    key: string;
    positionX: number;
    positionY: number;
    markerType: MarkerType;
    assetNodeId?: string;
    findingId?: string;
    label: string;
  }> = [
    {
      key: 'marker:A:1',
      positionX: 22.5,
      positionY: 31,
      markerType: MarkerType.ASSET,
      assetNodeId: treeAAssets[0],
      label: 'TP Verdeelinrichting A1',
    },
    {
      key: 'marker:A:2',
      positionX: 76,
      positionY: 62.5,
      markerType: MarkerType.ASSET,
      assetNodeId: treeAAssets[1],
      label: 'TP Verdeelinrichting A2',
    },
    {
      key: 'marker:A:3',
      positionX: 48,
      positionY: 44,
      markerType: MarkerType.FINDING,
      findingId: refs.findings.critical,
      label: 'Kritieke constatering (C1)',
    },
  ];
  for (const m of markerSpecs) {
    const id = tpId(m.key);
    const data = {
      positionX: m.positionX,
      positionY: m.positionY,
      markerType: m.markerType,
      assetNodeId: m.assetNodeId ?? null,
      findingId: m.findingId ?? null,
      label: m.label,
    };
    await prisma.locationImageMarker.upsert({
      where: { id },
      create: {
        id,
        orgId: demoOrgId,
        locationImageId: floorPlanImage.id,
        createdBy: inspecteurId,
        ...data,
      },
      update: data,
    });
  }
  step('H5: plattegrond (800x600 PNG in UPLOAD_DIR) op wortel boom A + 3 markers (2 ASSET, 1 FINDING)');

  // ── H6. Gegenereerd rapport + handtekeningen (PUB-05) ──────────────────────
  const reportDocId = tpId('generated-document:report');
  const reportHtml = [
    '<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8" /><title>TP Inspectierapport</title></head><body>',
    '<h1>Inspectierapport TP-RAP-005</h1>',
    `<p>Opdrachtgever: ${DIRTY.script}</p>`,
    `<p>Locatieomschrijving: ${DIRTY.imgOnerror}</p>`,
    `<p>Opmerking inspecteur: ${DIRTY.mixed} — ${DIRTY.rtl} — ${DIRTY.cjk} ${DIRTY.emoji}</p>`,
    `<p>Referentie klantsysteem: ${DIRTY.sqlDrop}</p>`,
    '<h2>Bevindingen</h2>',
    '<ul><li>Beschadigde mantel op hoofdvoedingskabel — <strong>C2</strong></li></ul>',
    '<h2>Ondertekening</h2>',
    '<p>Inspecteur: getekend · Opdrachtgever: verzoek verstuurd</p>',
    '</body></html>',
  ].join('\n');
  const reportData = {
    documentType: DocumentType.REPORT,
    htmlContent: reportHtml,
    status: GeneratedDocumentStatus.PENDING_SIGNATURES,
  };
  await prisma.generatedDocument.upsert({
    where: { id: reportDocId },
    // documentTemplateId en generatedBy mogen null zijn (PRD-14).
    create: {
      id: reportDocId,
      orgId: demoOrgId,
      inspectionPlanId: refs.plans.approved,
      generatedBy: adminId,
      ...reportData,
    },
    update: reportData,
  });
  refs.documents.reportPendingSignatures = reportDocId;

  const inspectorSigId = tpId('signature:report:inspector');
  const inspectorSigData = {
    signerRoleCode: 'INSPECTOR',
    signerName: 'Tom Visser',
    signerFunction: 'Inspecteur',
    status: SignatureStatus.SIGNED,
    signedAt: daysFromToday(-10),
    signedIpAddress: '203.0.113.20',
    signatureImage: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
  };
  await prisma.documentSignature.upsert({
    where: { id: inspectorSigId },
    create: { id: inspectorSigId, generatedDocumentId: reportDocId, ...inspectorSigData },
    update: inspectorSigData,
  });

  // Openstaand ondertekenverzoek → doelwit van de publieke /sign/:requestId-test (PUB-05).
  const clientSigId = tpId('signature:report:client');
  const clientSigData = {
    signerRoleCode: 'CLIENT',
    signerName: 'TP Signer Klant',
    signerEmail: 'tp-signer@klant.nl',
    signerFunction: 'Facilitair manager',
    status: SignatureStatus.REQUESTED,
    signatureRequestId: 'tp-sign-request-001',
    signatureRequestSentAt: daysFromToday(-9),
    signatureRequestUrl: 'http://inspexidemo.localhost:5173/sign/tp-sign-request-001',
  };
  await prisma.documentSignature.upsert({
    where: { id: clientSigId },
    create: { id: clientSigId, generatedDocumentId: reportDocId, ...clientSigData },
    update: clientSigData,
  });
  step('H6: REPORT (PENDING_SIGNATURES, DIRTY-html) + INSPECTOR SIGNED + CLIENT REQUESTED (tp-sign-request-001)');

  // ── I. Client-portal ───────────────────────────────────────────────────────
  // ClientUser is org-agnostisch: de org-scope komt uit ClientAccess.contactId.
  const clientPasswordHash = await bcrypt.hash(TP_PASSWORD, 10);
  const clientSpecs: Array<{ refKey: string; email: string; firstName: string; role: ClientAccessRole; canSign: boolean }> =
    [
      { refKey: 'viewer', email: 'tp-viewer@klant.nl', firstName: 'Vera', role: ClientAccessRole.VIEWER, canSign: false },
      { refKey: 'signer', email: 'tp-signer@klant.nl', firstName: 'Sander', role: ClientAccessRole.SIGNER, canSign: true },
      { refKey: 'admin', email: 'tp-admin@klant.nl', firstName: 'Ada', role: ClientAccessRole.ADMIN, canSign: true },
    ];

  for (const spec of clientSpecs) {
    const clientUser = await prisma.clientUser.upsert({
      where: { email: spec.email },
      update: {
        firstName: spec.firstName,
        lastName: 'Klant',
        status: ClientUserStatus.ACTIVE,
        emailVerified: true,
        passwordHash: clientPasswordHash,
      },
      create: {
        id: tpId(`client-user:${spec.refKey}`),
        email: spec.email,
        firstName: spec.firstName,
        lastName: 'Klant',
        function: `TP ${spec.role}`,
        status: ClientUserStatus.ACTIVE,
        emailVerified: true,
        passwordHash: clientPasswordHash,
      },
    });
    refs.clientUsers[spec.refKey] = clientUser.id;

    await prisma.clientAccess.upsert({
      where: { clientUserId_contactId: { clientUserId: clientUser.id, contactId: demoContactId } },
      update: { role: spec.role },
      create: { clientUserId: clientUser.id, contactId: demoContactId, role: spec.role, grantedBy: adminId },
    });

    await prisma.inspectionClientAccess.upsert({
      where: {
        inspectionPlanId_clientUserId: { inspectionPlanId: refs.plans.repair, clientUserId: clientUser.id },
      },
      update: { canView: true, canSign: spec.canSign },
      create: {
        inspectionPlanId: refs.plans.repair,
        clientUserId: clientUser.id,
        canView: true,
        canSign: spec.canSign,
        invitedBy: adminId,
      },
    });
  }

  // Magic-links: geldig / verlopen / al gebruikt (KL-02, KL-03). TTL-velden hangen
  // aan de échte klok zodat de geldige link ook bij een latere run nog werkt.
  const signerClientId = refs.clientUsers.signer;
  const magicLinks: Array<{ token: string; expiresAt: Date; usedAt: Date | null }> = [
    { token: 'tp-magic-geldig', expiresAt: fromNow(30), usedAt: null },
    { token: 'tp-magic-verlopen', expiresAt: fromNow(-5), usedAt: null },
    { token: 'tp-magic-gebruikt', expiresAt: fromNow(30), usedAt: fromNow(-1) },
  ];
  for (const link of magicLinks) {
    await prisma.clientMagicLink.upsert({
      where: { token: link.token },
      update: {
        clientUserId: signerClientId,
        email: 'tp-signer@klant.nl',
        inspectionPlanId: refs.plans.repair,
        expiresAt: link.expiresAt,
        usedAt: link.usedAt,
      },
      create: {
        id: tpId(`magic-link:${link.token}`),
        clientUserId: signerClientId,
        email: 'tp-signer@klant.nl',
        token: link.token,
        inspectionPlanId: refs.plans.repair,
        expiresAt: link.expiresAt,
        usedAt: link.usedAt,
        createdBy: adminId,
      },
    });
  }

  const clientRequestId = tpId('client-request:reinspection');
  const clientRequestData = {
    requestTypeCode: 'REINSPECTION',
    relatedInspectionPlanId: refs.plans.repair,
    subject: 'Verzoek om herinspectie na herstel',
    description: `De constateringen zijn hersteld; graag een herinspectie inplannen. ${DIRTY.emoji}`,
    preferredDate: daysFromToday(14),
    statusCode: 'PENDING_REQUEST',
  };
  await prisma.clientRequest.upsert({
    where: { id: clientRequestId },
    create: {
      id: clientRequestId,
      orgId: demoOrgId,
      contactId: demoContactId,
      clientUserId: refs.clientUsers.admin,
      ...clientRequestData,
    },
    update: clientRequestData,
  });
  step(
    'I: 3 ClientUsers (VIEWER/SIGNER/ADMIN) + plan-toegang op RAP-TEST-100, 3 magic-links (geldig/verlopen/gebruikt), 1 ClientRequest (REINSPECTION)',
  );

  // ── I2. Online herstel ─────────────────────────────────────────────────────
  const demoOrg = await prisma.organization.findUnique({
    where: { id: demoOrgId },
    select: { onlineRepairDefault: true },
  });
  if (demoOrg && !demoOrg.onlineRepairDefault) {
    await prisma.organization.update({ where: { id: demoOrgId }, data: { onlineRepairDefault: true } });
    step('I2: Organization.onlineRepairDefault stond op false → aangezet');
  } else {
    step('I2: Organization.onlineRepairDefault stond al aan (SEED_DEMO) — ongewijzigd gelaten');
  }
  // Belt-and-braces: zonder het ONLINE_HERSTEL-entitlement geven de /client/repair-routes 403.
  await prisma.organizationFeature.upsert({
    where: { orgId_featureKey: { orgId: demoOrgId, featureKey: 'ONLINE_HERSTEL' } },
    update: { enabled: true },
    create: { orgId: demoOrgId, featureKey: 'ONLINE_HERSTEL', enabled: true, updatedById: adminId },
  });

  // Herstelverklaring (code-based template → documentTemplateId/generatedBy blijven null).
  const declarationId = tpId('generated-document:herstelverklaring');
  const declarationHtml = [
    '<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8" /><title>Herstelverklaring RAP-TEST-100</title></head><body>',
    '<h1>Herstelverklaring</h1>',
    '<p>Rapportnummer: RAP-TEST-100 — TP Online herstel</p>',
    '<p>Ingevuld door: Pieter Hersteller (TP Installatietechniek)</p>',
    '<h2>Herstelde constateringen</h2>',
    '<ol><li>Ontbrekend groepenoverzicht in verdeelkast — overzicht aangebracht en gecontroleerd.</li></ol>',
    '<p>Ondergetekende verklaart dat de bovengenoemde constateringen zijn hersteld zoals omschreven.</p>',
    '</body></html>',
  ].join('\n');
  const declarationData = {
    documentType: DocumentType.HERSTELVERKLARING,
    htmlContent: declarationHtml,
    status: GeneratedDocumentStatus.SIGNED,
  };
  await prisma.generatedDocument.upsert({
    where: { id: declarationId },
    create: { id: declarationId, orgId: demoOrgId, inspectionPlanId: refs.plans.repair, ...declarationData },
    update: declarationData,
  });
  refs.documents.herstelverklaring = declarationId;

  const declarationPdfKey = `${demoOrgId}/documents/${declarationId}.pdf`;
  writeUpload(declarationPdfKey, makeSimplePdf('Herstelverklaring RAP-TEST-100 - InspeXi Demo'));
  await prisma.generatedDocument.update({ where: { id: declarationId }, data: { pdfUrl: declarationPdfKey } });

  const herstellerSigId = tpId('signature:declaration:hersteller');
  const herstellerSigData = {
    signerRoleCode: 'HERSTELLER',
    signerName: 'Pieter Hersteller',
    signerEmail: 'hersteller@tp-installatie.nl',
    status: SignatureStatus.SIGNED,
    signedAt: daysFromToday(-2),
    signedIpAddress: '203.0.113.30',
    signatureImage: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
  };
  await prisma.documentSignature.upsert({
    where: { id: herstellerSigId },
    create: { id: herstellerSigId, generatedDocumentId: declarationId, ...herstellerSigData },
    update: herstellerSigData,
  });

  // Afgeronde anonieme herstelsessie (COMPLETED blijft leesbaar voor bevestiging/PDF).
  const repairSession = await prisma.repairSession.upsert({
    where: { token: 'tp-herstel-afgerond' },
    update: {
      status: RepairSessionStatus.COMPLETED,
      generatedDocumentId: declarationId,
      expiresAt: fromNow(30),
      completedAt: daysFromToday(-2),
    },
    create: {
      id: tpId('repair-session:afgerond'),
      orgId: demoOrgId,
      inspectionPlanId: refs.plans.repair,
      accessType: RepairAccessType.ANONYMOUS,
      status: RepairSessionStatus.COMPLETED,
      token: 'tp-herstel-afgerond',
      contactName: 'Pieter Hersteller',
      companyName: 'TP Installatietechniek',
      email: 'hersteller@tp-installatie.nl',
      generatedDocumentId: declarationId,
      expiresAt: fromNow(30),
      completedAt: daysFromToday(-2),
      createdIpAddress: '203.0.113.30',
      lastActivityAt: daysFromToday(-2),
    },
  });

  const resolutionData = {
    description: 'Groepenoverzicht aangebracht en gecontroleerd; kastdeur voorzien van nieuw schema.',
    statusCode: 'REPORTED',
    resolvedAt: daysFromToday(-2),
  };
  const resolution = await prisma.findingResolution.upsert({
    where: {
      findingId_repairSessionId: { findingId: refs.findings.resolved, repairSessionId: repairSession.id },
    },
    update: resolutionData,
    create: {
      id: tpId('finding-resolution:afgerond'),
      findingId: refs.findings.resolved,
      repairSessionId: repairSession.id,
      // resolvedByClientUserId blijft null: anonieme sessie (PRD-14).
      ...resolutionData,
    },
  });

  const repairPhotoKey = `${demoOrgId}/finding-photos/tp-herstel-bewijs.jpg`;
  writeUpload(repairPhotoKey, Buffer.from(TINY_JPEG_BASE64, 'base64'));
  const photoId = tpId('finding-resolution-photo:afgerond');
  await prisma.findingResolutionPhoto.upsert({
    where: { id: photoId },
    update: { photoUrl: repairPhotoKey, caption: 'Bewijsfoto herstel' },
    create: { id: photoId, resolutionId: resolution.id, photoUrl: repairPhotoKey, caption: 'Bewijsfoto herstel' },
  });

  step(
    'I2: anonieme COMPLETED-sessie "tp-herstel-afgerond" + REPORTED-resolutie met bewijsfoto + ondertekende herstelverklaring (PDF in UPLOAD_DIR)',
  );

  console.log('  ✓ H/I klaar — RAP-TEST-100 / postcode 1012AB is het online-herstel-doelwit');
}
