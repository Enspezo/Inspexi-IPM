import { PrismaClient, Role, ContactType, LogType, PriceType, RequestSource, RequestStatus, Priority, QuoteStatus, NotificationType, PlanningStatus, AcceptanceStatus, ProjectStatus, AssetFieldType, ChecklistStatus, TemplateStatus, MeasurementSheetTemplateStatus, MeasurementSheetFieldType, FindingInspectionType, DocumentType, DocumentEntityType, TemplateMode, SectionType, ClientUserStatus, ClientAccessRole, GeneratedDocumentStatus, SignatureStatus, MarkerType, MeasurementSheetRecordStatus, InspectionExecStatus, PassFailOperator, LocationTypeScope, Availability, ChatThreadType, ChatThreadStatus, ContactDisplayMode, PhaseStatus, EmploymentType, AvailabilityExceptionType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { seedLookups } from './seed-lookups';
import { backfillNumbering } from './backfill-numbering';
import { DEFAULT_VOICE_BASE_PROMPT } from '../src/modules/voice/default-base-prompt';
import { FEATURE_KEYS } from '@inspexi/entitlements';
import { addMonths } from '@inspexi/calibration';

const prisma = new PrismaClient();

// ─── Demo-helpers (plattegrond-PNG + meetstaat-snapshot) ────────────────────

/** CRC-32 (IEEE) voor PNG-chunks. */
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Bouwt één PNG-chunk (length + type + data + crc). */
function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/** Genereert een geldige 800x600 plattegrond-PNG (blueprint-stijl) als Buffer. */
function makeFloorPlanPng(width = 800, height = 600): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1)); // filter-byte 0 + RGB per rij
  const bg: [number, number, number] = [0xe9, 0xee, 0xf4];
  const wall: [number, number, number] = [0x33, 0x49, 0x66];

  // Achtergrond: één rij vullen en naar alle rijen kopiëren.
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

  // Buitenmuur + een paar binnenmuren voor een eenvoudige ruimte-indeling.
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

/**
 * Bouwt een minimale, geldige één-pagina PDF (A4) met een titelregel — gebruikt om
 * een demo-inspecteurcertificaat met een écht downloadbaar document te seeden.
 */
function makeCertificatePdf(title: string): Buffer {
  const stream = `BT /F1 22 Tf 72 760 Td (${title.replace(/[()\\]/g, ' ')}) Tj ET`;
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
 * Bevriest een meetstaat-template (+secties+velden) tot een snapshot, identiek
 * aan MeasurementSheetRecordsService.createTemplateSnapshot (Decimals → string).
 */
function buildMeasurementSnapshot(t: any) {
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

// ─── SaaS-varianten (PRD-09 §7.1) — herbruikbare org-keten ──────────────────

/** Gedeelde (globale) referenties die elke variant-org hergebruikt. */
interface VariantOrgRefs {
  passwordHash: string;
  /** Globale inspectie-template (NEN 1010) — orgId-loos, gedeeld. */
  inspTemplateId: string;
  /** Globale document-template (PLAN) — gekoppeld aan de inspectie-template. */
  planDocTemplateId: string;
  /** Globaal CRM-locatietype (orgId null) voor de relatie-locatie. */
  crmLocationTypeId: string;
}

/** Per-variant configuratie. */
interface VariantOrgConfig {
  name: string;
  slug: string;
  planId: string;
  /** E-maildomein voor de users + klant (zonder @). */
  emailDomain: string;
  /** Vaste, voorspelbare magic-link-token voor de klantportaal-smoketest. */
  magicToken: string;
}

/**
 * Seedt één SaaS-variant-org met een volledige, afrondbare basis-keten
 * (PRD-09 §7.1): ORG_ADMIN + INSPECTEUR, één relatie + locatie, één project,
 * één inspectieplan met asset + findings, plus de klantportaal-keten
 * (ClientUser → toegang → magic-link → ondertekenbaar PLAN-document).
 *
 * Alle inspectie-config (template, checklist, classificatie, asset-/locatietypes)
 * is globaal en wordt hergebruikt; per-org afwijkingen lopen via OrganizationFeature.
 * De FeatureGuard zit op de HTTP-laag, dus seeden via Prisma negeert het plan —
 * de gating wordt pas via de API/portal afgedwongen.
 */
async function seedVariantOrg(
  prisma: PrismaClient,
  cfg: VariantOrgConfig,
  refs: VariantOrgRefs,
) {
  const org = await prisma.organization.create({
    data: {
      name: cfg.name,
      slug: cfg.slug,
      planId: cfg.planId,
      primaryColor: '#1E40AF',
      defaultVat: 21,
      defaultValidityDays: 30,
      // Klantportaal inspecteur-contact: telefoon = inspecteur zelf, e-mail = statische terugval.
      inspectorPhoneDisplay: ContactDisplayMode.INSPECTOR,
      inspectorEmailDisplay: ContactDisplayMode.STATIC,
      inspectorStaticEmail: `klantcontact@${cfg.emailDomain}`,
    },
  });

  // Twee gebruikers: ORG_ADMIN + INSPECTEUR (wachtwoord Password123!).
  const admin = await prisma.user.create({
    data: {
      email: `admin@${cfg.emailDomain}`,
      passwordHash: refs.passwordHash,
      firstName: 'Admin',
      lastName: cfg.name,
      roles: [Role.ORG_ADMIN],
      orgId: org.id,
      emailVerifiedAt: new Date(),
    },
  });
  const inspecteur = await prisma.user.create({
    data: {
      email: `inspecteur@${cfg.emailDomain}`,
      passwordHash: refs.passwordHash,
      firstName: 'Inspecteur',
      lastName: cfg.name,
      roles: [Role.INSPECTEUR],
      orgId: org.id,
      emailVerifiedAt: new Date(),
      contactPhone: '+31 6 00 11 22 33',
      sharePhoneWithClients: true,
      shareEmailWithClients: false,
    },
  });

  // Relatie + adres + locatie (Basis CRM).
  const contact = await prisma.contact.create({
    data: {
      orgId: org.id,
      type: ContactType.COMPANY,
      companyName: `Klant ${cfg.name} BV`,
      email: `info@${cfg.emailDomain}`,
      phone: '+31 20 111 2222',
      notes: 'Demo-relatie voor de SaaS-variant-keten.',
    },
  });
  await prisma.contactAddress.create({
    data: {
      contactId: contact.id,
      label: 'Hoofdkantoor',
      street: 'Voorbeeldstraat',
      houseNumber: '1',
      postalCode: '1000 AA',
      city: 'Amsterdam',
      country: 'NL',
      isPrimary: true,
    },
  });
  const location = await prisma.location.create({
    data: {
      contactId: contact.id,
      orgId: org.id,
      name: 'Hoofdvestiging',
      street: 'Voorbeeldstraat',
      houseNumber: '1',
      postalCode: '1000 AA',
      city: 'Amsterdam',
      locationTypeId: refs.crmLocationTypeId,
    },
  });

  // Project (Basis Uitvoering).
  const project = await prisma.project.create({
    data: {
      orgId: org.id,
      projectNumber: 'P-2026-0001', // per-org uniek → mag herhalen tussen orgs
      title: `Inspectieproject ${cfg.name}`,
      description: 'Demo-project voor de afrondbare basis-keten.',
      status: ProjectStatus.ACTIEF,
      contactId: contact.id,
      locationId: location.id,
      projectManagerId: admin.id,
      startDate: new Date('2026-06-01'),
      createdBy: admin.id,
    },
  });

  // Inspectieplan met hoofdlocatie (= CRM-Locatie / boom-wortel) (Basis Inspecties).
  const plan = await prisma.inspectionPlan.create({
    data: {
      orgId: org.id,
      contactId: contact.id,
      projectId: project.id,
      locationId: location.id,
      projectName: `NEN 1010 inspectie ${cfg.name}`,
      description: 'Periodieke veiligheidsinspectie van de elektrische installatie.',
      referenceNumber: 'INSP-2026-0001',
      normTypeCode: 'NEN1010',
      inspectionTypeCode: 'initial',
      statusCode: 'draft',
      inspectionTemplateId: refs.inspTemplateId,
      assignedTo: inspecteur.id,
      addressStreet: 'Voorbeeldstraat',
      addressHouseNumber: '1',
      addressPostalCode: '1000 AA',
      addressCity: 'Amsterdam',
      plannedDate: new Date('2026-07-01'),
      createdBy: admin.id,
    },
  });

  // AssetNode-boom: wortel-LOCATION (1:1 aan de CRM-Locatie) → deellocatie → asset.
  // path/depth worden door de DB-trigger gevuld → parent vóór kind inserten.
  const rootNode = await prisma.assetNode.create({
    data: {
      orgId: org.id,
      nodeType: 'LOCATION',
      rootLocationId: location.id,
      typeCode: 'distribution_room',
      name: location.name,
      createdBy: inspecteur.id,
    },
  });
  const roomNode = await prisma.assetNode.create({
    data: {
      orgId: org.id,
      nodeType: 'LOCATION',
      parentId: rootNode.id,
      typeCode: 'distribution_room',
      name: 'Verdeelruimte',
      identifier: 'VR-01',
      createdBy: inspecteur.id,
    },
  });
  const asset = await prisma.assetNode.create({
    data: {
      orgId: org.id,
      nodeType: 'ASSET',
      parentId: roomNode.id,
      typeCode: 'electrical_installation',
      name: 'Hoofdverdeler HVK',
      identifier: 'HVK-01',
      statusCode: 'new',
      createdBy: inspecteur.id,
    },
  });

  // Scope-deellocatie: de verdeelruimte als (primaire) scope van het plan.
  await prisma.inspectionPlanLocation.create({
    data: {
      orgId: org.id,
      inspectionPlanId: plan.id,
      assetNodeId: roomNode.id,
      isPrimary: true,
    },
  });

  // Eén open bevinding (om op te lossen via klantportaal) + één geclassificeerde (C2)
  // bevinding zodat het ondertekenbare document een classificatie toont.
  await prisma.finding.create({
    data: {
      orgId: org.id,
      assetNodeId: asset.id,
      inspectionPlanId: plan.id,
      inspectionType: FindingInspectionType.visual,
      shortDescription: 'Ontbrekende afdekking op verdeelinrichting',
      longDescription: 'De afdekking ontbreekt; aanraakgevaar voor spanningvoerende delen.',
      normReference: 'NEN 1010 art. 412',
      statusCode: 'open',
      createdBy: inspecteur.id,
    },
  });
  await prisma.finding.create({
    data: {
      orgId: org.id,
      assetNodeId: asset.id,
      inspectionPlanId: plan.id,
      inspectionType: FindingInspectionType.visual,
      shortDescription: 'Beschadigde mantel op hoofdvoedingskabel',
      longDescription: 'De mantel is plaatselijk beschadigd; de isolatie is zichtbaar aangetast.',
      classificationValues: { SEVERITY: 'C2' },
      normReference: 'NEN 1010 art. 526',
      statusCode: 'open',
      createdBy: inspecteur.id,
    },
  });

  // Klantportaal-keten: klant + relatie-toegang + plan-toegang (inzien + ondertekenen)
  // + vaste magic-link (directe login). Het klantportaal draait volledig op
  // BASIS_INSPECTIES — ook een Basis-org doorloopt deze keten dus volledig.
  const client = await prisma.clientUser.create({
    data: {
      email: `klant@${cfg.emailDomain}`,
      firstName: 'Demo',
      lastName: 'Klant',
      function: 'Facilitair manager',
      emailVerified: true,
      status: ClientUserStatus.ACTIVE,
      passwordHash: refs.passwordHash,
    },
  });
  await prisma.clientAccess.create({
    data: {
      clientUserId: client.id,
      contactId: contact.id,
      role: ClientAccessRole.VIEWER,
      grantedBy: admin.id,
    },
  });
  await prisma.inspectionClientAccess.create({
    data: {
      inspectionPlanId: plan.id,
      clientUserId: client.id,
      canView: true,
      canSign: true,
      invitedBy: admin.id,
    },
  });
  // Vaste wachtwoordloze magic-link: alleen achter SEED_DEMO=1 en met korte
  // expiry (30 dagen), net als de demo-org (zie K3-hardening).
  if (process.env.SEED_DEMO === '1') {
    await prisma.clientMagicLink.create({
      data: {
        clientUserId: client.id,
        email: client.email,
        token: cfg.magicToken,
        inspectionPlanId: plan.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        usedAt: null,
        createdBy: admin.id,
      },
    });
  }

  // Ondertekenbaar PLAN-document: inspecteur al getekend, klant PENDING.
  const docHtml = [
    `<h1>Inspectieplan — NEN 1010 (${cfg.name})</h1>`,
    '<table>',
    `<tr><th>Referentie</th><td>${plan.referenceNumber}</td></tr>`,
    `<tr><th>Project</th><td>${plan.projectName}</td></tr>`,
    `<tr><th>Opdrachtgever</th><td>${contact.companyName}</td></tr>`,
    '</table>',
    '<h2>Bevindingen</h2>',
    '<ul>',
    '<li>Ontbrekende afdekking op verdeelinrichting — <em>open</em></li>',
    '<li>Beschadigde mantel op hoofdvoedingskabel — <strong>C2</strong></li>',
    '</ul>',
    '<h2>Ondertekening</h2>',
    '<p>Inspecteur: getekend</p>',
    '<p>Opdrachtgever: in afwachting</p>',
  ].join('\n');
  await prisma.generatedDocument.create({
    data: {
      orgId: org.id,
      documentTemplateId: refs.planDocTemplateId,
      inspectionPlanId: plan.id,
      documentType: DocumentType.PLAN,
      htmlContent: docHtml,
      status: GeneratedDocumentStatus.PENDING_SIGNATURES,
      generatedBy: admin.id,
      signatures: {
        create: [
          {
            signerRoleCode: 'INSPECTOR',
            signerName: 'Inspecteur',
            signerFunction: 'Inspecteur',
            status: SignatureStatus.SIGNED,
            signedAt: new Date('2026-06-15T10:00:00Z'),
            signatureImage: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
          },
          {
            signerRoleCode: 'CLIENT',
            signerName: 'Demo Klant',
            signerFunction: 'Facilitair manager',
            status: SignatureStatus.PENDING,
          },
        ],
      },
    },
  });

  console.log(
    `  ✓ Variant-org: ${cfg.name} (${cfg.slug}) → plan + keten (relatie/project/inspectieplan/asset/2 findings + klantportaal)`,
  );
  return { org, admin, inspecteur, contact, project, plan, client };
}

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing imp_ data (safe for shared DB — only deletes our tables)
  // ─── Inspectiedomein (Fase 1) — fully downstream, clean children-first ───
  // client-portal
  await prisma.findingResolutionPhoto.deleteMany();
  await prisma.findingResolution.deleteMany();
  await prisma.messageAttachment.deleteMany();
  await prisma.inspectionMessage.deleteMany();
  await prisma.clientMagicLink.deleteMany();
  await prisma.inspectionClientAccess.deleteMany();
  await prisma.clientAccess.deleteMany();
  await prisma.clientRequest.deleteMany();
  await prisma.clientRefreshToken.deleteMany();
  await prisma.clientUser.deleteMany();
  // sync & devices
  await prisma.syncQueue.deleteMany();
  await prisma.deviceRegistration.deleteMany();
  // voice
  await prisma.voiceUserPrompt.deleteMany();
  await prisma.voiceTemplatePrompt.deleteMany();
  await prisma.voiceBasePrompt.deleteMany();
  // AI-review (PRD-13) — items cascaden op run; run cascadeert op inspectionPlan,
  // dus vóór de inspectionPlan/assetNode/finding-cleanup (kinderen eerst)
  await prisma.aiReviewItem.deleteMany();
  await prisma.aiReviewRun.deleteMany();
  // document generation
  await prisma.documentSignature.deleteMany();
  await prisma.generatedDocument.deleteMany();
  await prisma.documentSection.deleteMany();
  await prisma.documentTemplateDocxRevision.deleteMany();
  await prisma.documentTemplate.deleteMany();
  // location images & standalone measurements. StandaloneMeasurement RESTRICTs on
  // its location-node FK → it must go before the AssetNode tree (below).
  await prisma.locationImageMarker.deleteMany();
  await prisma.standaloneMeasurementValue.deleteMany();
  await prisma.standaloneMeasurement.deleteMany();
  await prisma.locationImage.deleteMany();
  // meetmiddelen (children first; before user/org/inspectionPlan deletes)
  await prisma.inspectionPlanDefaultInstrument.deleteMany();
  await prisma.userDefaultInstrument.deleteMany();
  await prisma.calibration.deleteMany();
  await prisma.measurementInstrument.deleteMany();
  // measurement sheets
  await prisma.measurementSheetRecord.deleteMany();
  await prisma.measurementSheetVersionHistory.deleteMany();
  await prisma.measurementSheetField.deleteMany();
  await prisma.measurementSheetSection.deleteMany();
  // inspection templates (links before the measurement-sheet templates they reference)
  await prisma.inspectionTemplateVersionHistory.deleteMany();
  await prisma.inspectionTemplateMeasurementSheetLink.deleteMany();
  await prisma.inspectionTemplateChecklistLink.deleteMany();
  await prisma.measurementSheetTemplate.deleteMany();
  // execution
  await prisma.finding.deleteMany();
  await prisma.measurementRecord.deleteMany();
  await prisma.visualInspection.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.signature.deleteMany();
  await prisma.report.deleteMany();
  // Unified AssetNode tree (Fase 1-3). The execution records above cascade on
  // assetNodeId, but the two RESTRICT referrers must be cleared first:
  // InspectionPlanLocation (scope rows) and StandaloneMeasurement (deleted above).
  // AssetNode.parentId is SET NULL, so a single deleteMany handles the whole tree.
  await prisma.inspectionPlanLocation.deleteMany();
  await prisma.assetNode.deleteMany();
  await prisma.inspectionPlan.deleteMany();
  // checklists
  await prisma.checklistVersionHistory.deleteMany();
  await prisma.checklistItemLink.deleteMany();
  await prisma.checklist.deleteMany();
  await prisma.checklistItem.deleteMany();
  // templates & types (finding-templates before category + classification model;
  // measurement-field-templates before norm-configurations they belong to)
  await prisma.findingTemplate.deleteMany();
  await prisma.category.deleteMany();
  await prisma.reportTemplate.deleteMany();
  await prisma.assetTypeMeasurementConfig.deleteMany();
  await prisma.assetTypeConstraint.deleteMany();
  await prisma.assetTypeField.deleteMany();
  await prisma.assetTypeDefinition.deleteMany();
  await prisma.measurementFieldTemplate.deleteMany();
  await prisma.locationTypeConstraint.deleteMany();
  await prisma.locationTypeField.deleteMany();
  await prisma.locationTypeDefinition.deleteMany();
  await prisma.inspectionTemplate.deleteMany();
  // norm & classification (norm-type-definitions before classification models)
  await prisma.normConfiguration.deleteMany();
  await prisma.classificationOption.deleteMany();
  await prisma.classificationCharacteristic.deleteMany();
  await prisma.normTypeDefinition.deleteMany();
  await prisma.classificationModel.deleteMany();
  // per-org lookups (relate only to Organization → before organization delete)
  await prisma.inspectionTypeOption.deleteMany();
  await prisma.planStatusType.deleteMany();
  await prisma.assetStatusType.deleteMany();
  await prisma.findingStatusType.deleteMany();
  await prisma.reportStatusType.deleteMany();
  await prisma.signatoryTypeOption.deleteMany();
  await prisma.signerRoleOption.deleteMany();
  await prisma.passFailStatusType.deleteMany();
  await prisma.resolutionStatusType.deleteMany();
  await prisma.clientRequestTypeOption.deleteMany();
  await prisma.clientRequestStatusType.deleteMany();
  // ─── Beheer-domein ───────────────────────────────────────
  // PRD-06 tables (no dependents)
  await prisma.notificationGroupPref.deleteMany();
  await prisma.notificationPref.deleteMany();
  await prisma.notification.deleteMany();
  // PRD-05 tables first (dependent on quotes → products/contacts)
  await prisma.quoteApprovalRequest.deleteMany();
  await prisma.quoteLine.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.quoteTemplateFollowUp.deleteMany();
  await prisma.quoteTemplateDocxRevision.deleteMany();
  await prisma.quoteTemplateAttachment.deleteMany();
  await prisma.quoteTemplate.deleteMany();
  // PRD-04 tables (dependent on products/price-tables)
  await prisma.priceTier.deleteMany();
  await prisma.priceTableItem.deleteMany();
  await prisma.contactPriceTable.deleteMany();
  await prisma.priceTable.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productGroup.deleteMany();
  // PRD-03 tables (dependent on requests → contacts/locations)
  await prisma.requestStatusHistory.deleteMany();
  await prisma.request.deleteMany();
  // Work orders (dependent on planning items)
  await prisma.workOrderLine.deleteMany();
  await prisma.workOrder.deleteMany();
  // PRD-07 tables (dependent on contacts/locations)
  await prisma.planningSessionInspector.deleteMany();
  await prisma.planningSession.deleteMany();
  await prisma.planningFollower.deleteMany();
  await prisma.rescheduleRequest.deleteMany();
  await prisma.planningHistory.deleteMany();
  await prisma.planningInspector.deleteMany();
  await prisma.planningItem.deleteMany();
  // Projectfasen (PRD-12) — kinderen eerst; entiteiten met project_phase_id (quotes/
  // planning/werkbonnen/inspectieplannen) zijn hierboven al opgeruimd, FK's zijn nullable.
  await prisma.phaseMilestone.deleteMany();
  await prisma.projectPhaseFollower.deleteMany();
  await prisma.projectPhase.deleteMany();
  // Projects (dependent on contacts/locations/users; referenced by nullable FK from requests/quotes/planning)
  await prisma.projectFollower.deleteMany();
  await prisma.project.deleteMany();
  // CRM tables (dependent on contacts)
  await prisma.contactCustomerGroup.deleteMany();
  await prisma.customerGroup.deleteMany();
  await prisma.locationContactPerson.deleteMany();
  await prisma.contactPerson.deleteMany();
  await prisma.contactEmail.deleteMany();
  await prisma.contactLog.deleteMany();
  await prisma.pdokApiLog.deleteMany();
  await prisma.location.deleteMany();
  await prisma.contactAddress.deleteMany();
  await prisma.contact.deleteMany();
  // Lookup tables (requests & contact persons that referenced them are already deleted above)
  await prisma.lostReason.deleteMany();
  await prisma.contactPersonRoleOption.deleteMany();
  // Interne chat (children first: message → participant → thread)
  await prisma.chatMessage.deleteMany();
  await prisma.chatParticipant.deleteMany();
  await prisma.chatThread.deleteMany();
  // Favorites (leaf — FK to users/organizations only)
  await prisma.favorite.deleteMany();
  // Helpsysteem (PRD-10) — kinderen eerst; help* hebben FK's naar user én organization
  await prisma.supportTicketMessage.deleteMany();
  await prisma.supportTicket.deleteMany();
  await prisma.supportAccessLog.deleteMany();
  await prisma.helpArticle.deleteMany();
  await prisma.helpCategory.deleteMany();
  // Tasks, Documents & Notes (dependent on users)
  await prisma.documentTagAssignment.deleteMany();
  await prisma.note.deleteMany();
  await prisma.document.deleteMany();
  await prisma.documentTag.deleteMany();
  await prisma.task.deleteMany();
  // Beschikbaarheid inspecteurs (PRD-12) — kinderen eerst (FK → user + organization + template)
  await prisma.availabilityException.deleteMany();
  await prisma.userScheduleAssignment.deleteMany();
  await prisma.availabilityTemplateSlot.deleteMany();
  await prisma.availabilityTemplate.deleteMany();
  // Inspecteur-certificaten (PRD-11, FK → user + organization)
  await prisma.inspectorCertificate.deleteMany();
  // Custom fields & email templates
  await prisma.numberingCounter.deleteMany();
  await prisma.numberingScheme.deleteMany();
  await prisma.customFieldDefinition.deleteMany();
  await prisma.emailTemplateAttachment.deleteMany();
  await prisma.emailTemplate.deleteMany();
  // Error reports (dependent on users/organizations)
  await prisma.errorReport.deleteMany();
  // SaaS-abonnementen (entitlements, PRD-09): org-overrides + plan-features vóór
  // de org/plan zelf; het plan ná de organization (Organization.planId → Plan).
  await prisma.organizationFeature.deleteMany();
  await prisma.planFeature.deleteMany();
  // Auth/org tables
  await prisma.auditLog.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.plan.deleteMany();

  // ─── SaaS-abonnementen: plannen (templates, PRD-09 §7.2) ──
  // "Basis" = 4 basisfeatures (géén add-ons); "Compleet" = alle catalogus-keys
  // incl. add-ons (PROJECT_FASEN, WEBHOOKS, CUSTOM_FIELDS, AI_REVIEW). De catalogus
  // (FEATURE_KEYS) is bron-van-waarheid; de DB verwijst alleen naar de keys. De
  // demo-org draait op Compleet en heeft dus PROJECT_FASEN (fasen-tab + demo-fasen
  // werken); een Basis-org (bv. Test Bedrijf) heeft de feature bewust NIET, zodat het
  // uit-scenario testbaar is (PRD-12 §Fase E). Per-org afwijkingen gaan via
  // OrganizationFeature.
  const basisPlan = await prisma.plan.create({
    data: {
      name: 'Basis',
      slug: 'basis',
      description: 'Basis-pakket: CRM, uitvoering, inspecties en workflow.',
      sortOrder: 1,
      features: {
        create: [
          { featureKey: 'BASIS_CRM' },
          { featureKey: 'BASIS_UITVOERING' },
          { featureKey: 'BASIS_INSPECTIES' },
          { featureKey: 'BASIS_WORKFLOW' },
        ],
      },
    },
  });
  const compleetPlan = await prisma.plan.create({
    data: {
      name: 'Compleet',
      slug: 'compleet',
      description:
        'Compleet-pakket: alle functies incl. add-ons (webhooks, aangepaste velden).',
      sortOrder: 2,
      features: { create: FEATURE_KEYS.map((featureKey) => ({ featureKey })) },
    },
  });
  console.log(
    `  ✓ Plannen: ${basisPlan.name} (4 features) + ${compleetPlan.name} (${FEATURE_KEYS.length} features)`,
  );

  // ─── Organizations ─────────────────────────────────────
  const org1 = await prisma.organization.create({
    data: {
      name: 'InspeXi Demo',
      slug: 'inspexidemo',
      planId: compleetPlan.id, // SaaS-abonnement: Compleet (alle features)
      primaryColor: '#1E40AF',
      defaultVat: 21,
      defaultValidityDays: 30,
      // Klantportaal inspecteur-contact: telefoon toont de inspecteur zelf (mét toestemming),
      // e-mail valt terug op de statische waarde omdat de inspecteur géén e-mail-toestemming geeft.
      inspectorPhoneDisplay: 'INSPECTOR',
      inspectorEmailDisplay: 'INSPECTOR',
      inspectorStaticPhone: '+31 20 123 4567',
      inspectorStaticEmail: 'klantcontact@inspexi-demo.nl',
      // Offerte-goedkeuring (REQ5): offertes boven € 10.000 vereisen goedkeuring door een MANAGER.
      quoteApprovalThreshold: 10000,
      quoteApprovalRequiredRole: Role.MANAGER,
    },
  });
  console.log(`  ✓ Organization: ${org1.name} (${org1.slug})`);

  const org2 = await prisma.organization.create({
    data: {
      name: 'Test Bedrijf',
      slug: 'testbedrijf',
      planId: basisPlan.id, // SaaS-abonnement: Basis (4 basisfeatures + core)
      primaryColor: '#059669',
      defaultVat: 21,
      defaultValidityDays: 14,
    },
  });
  console.log(`  ✓ Organization: ${org2.name} (${org2.slug})`);

  // ─── Lookup defaults (globaal, orgId = null) ─────────────
  await prisma.lostReason.createMany({
    data: [
      { code: 'TE_DUUR', label: 'Te duur', sortOrder: 10, isSystem: true },
      { code: 'GEEN_BESCHIKBAARHEID', label: 'Geen beschikbaarheid', sortOrder: 20, isSystem: true },
      { code: 'NIET_LANGER_NODIG', label: 'Niet langer nodig', sortOrder: 30, isSystem: true },
      { code: 'ANDERS', label: 'Anders', sortOrder: 40, isSystem: true },
    ],
  });
  await prisma.contactPersonRoleOption.createMany({
    data: [
      { code: 'ALGEMEEN', label: 'Algemeen', sortOrder: 10, isSystem: true },
      { code: 'TECHNISCH', label: 'Technisch', sortOrder: 20, isSystem: true },
      { code: 'ADMINISTRATIEF', label: 'Administratief', sortOrder: 30, isSystem: true },
      { code: 'ANDERS', label: 'Anders', sortOrder: 40, isSystem: true },
    ],
  });
  console.log('  ✓ Lookup defaults (4 redenen verloren, 4 contactpersoon-rollen)');

  // ─── Custom Field Definitions ────────────────────────────
  await prisma.customFieldDefinition.createMany({
    data: [
      {
        orgId: org1.id,
        entityType: 'CONTACT',
        fieldName: 'klantnummer',
        label: 'Klantnummer',
        fieldType: 'TEXT',
        sortOrder: 0,
      },
      {
        orgId: org1.id,
        entityType: 'CONTACT',
        fieldName: 'branche',
        label: 'Branche',
        fieldType: 'SELECT',
        options: ['Bouw', 'Industrie', 'Overheid', 'Zorg', 'Onderwijs'],
        sortOrder: 1,
      },
      {
        orgId: org1.id,
        entityType: 'LOCATION',
        fieldName: 'bouwjaar',
        label: 'Bouwjaar',
        fieldType: 'NUMBER',
        sortOrder: 0,
      },
      {
        orgId: org1.id,
        entityType: 'REQUEST',
        fieldName: 'extern_referentienummer',
        label: 'Extern referentienummer',
        fieldType: 'TEXT',
        sortOrder: 0,
      },
    ],
  });
  console.log('  ✓ Custom field definitions (4 voor InspeXi Demo)');

  // ─── Users ─────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Password123!', 10);

  // Superuser (no org)
  const superuser = await prisma.user.create({
    data: {
      email: 'superuser@inspexi.nl',
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      roles: [Role.SUPERUSER],
      emailVerifiedAt: new Date(),
    },
  });
  console.log('  ✓ User: superuser@inspexi.nl (SUPERUSER)');

  // Org 1 users
  const org1Users = [
    { email: 'admin@inspexi-demo.nl', firstName: 'Jan', lastName: 'de Vries', roles: [Role.ORG_ADMIN], availability: Availability.BESCHIKBAAR },
    { email: 'manager@inspexi-demo.nl', firstName: 'Pieter', lastName: 'Bakker', roles: [Role.MANAGER], availability: Availability.BEZIG, availabilityNote: 'In bespreking tot 15:00' },
    { email: 'backoffice@inspexi-demo.nl', firstName: 'Maria', lastName: 'Jansen', roles: [Role.BACKOFFICE], availability: Availability.BESCHIKBAAR },
    { email: 'werkvoorbereider@inspexi-demo.nl', firstName: 'Kees', lastName: 'Smit', roles: [Role.WERKVOORBEREIDER], availability: Availability.AFWEZIG },
    {
      email: 'inspecteur@inspexi-demo.nl',
      firstName: 'Tom',
      lastName: 'Visser',
      roles: [Role.INSPECTEUR],
      availability: Availability.BESCHIKBAAR,
      // Eigen contactgegevens + per-kanaal toestemming voor het klantportaal.
      // Telefoon gedeeld (→ getoond), e-mail niet gedeeld (→ statische terugval).
      contactPhone: '+31 6 12 34 56 78',
      contactEmail: 'tom.visser@inspexi-demo.nl',
      sharePhoneWithClients: true,
      shareEmailWithClients: false,
    },
  ];

  const createdOrg1Users: Record<string, string> = {};
  for (const u of org1Users) {
    const created = await prisma.user.create({
      data: { ...u, passwordHash, orgId: org1.id, emailVerifiedAt: new Date() },
    });
    createdOrg1Users[u.roles[0]] = created.id;
    console.log(`  ✓ User: ${u.email} (${u.roles[0]})`);
  }

  // Demo: backoffice heeft de manager als standaard vrijwillige goedkeurder (REQ5).
  if (createdOrg1Users[Role.BACKOFFICE] && createdOrg1Users[Role.MANAGER]) {
    await prisma.user.update({
      where: { id: createdOrg1Users[Role.BACKOFFICE] },
      data: { defaultApprovalPersonId: createdOrg1Users[Role.MANAGER] },
    });
  }

  // ─── Inspecteur-certificaten / diploma's (PRD-11) ───
  // Twee demo-certificaten voor de inspecteur: één geldig (mét echt downloadbaar
  // document) en één dat binnen 30 dagen verloopt (zonder document).
  const certInspecteurId = createdOrg1Users[Role.INSPECTEUR];
  const DAY_MS = 1000 * 60 * 60 * 24;
  const certFilename = 'vca-vol-diploma-demo.pdf';
  const certKey = `${org1.id}/inspector-certificates/${certInspecteurId}/${randomUUID()}-${certFilename}`;
  const certBytes = makeCertificatePdf('VCA-VOL diploma - InspeXi Demo');
  const certFullPath = path.join(process.env.UPLOAD_DIR || './uploads', certKey);
  fs.mkdirSync(path.dirname(certFullPath), { recursive: true });
  fs.writeFileSync(certFullPath, certBytes);

  await prisma.inspectorCertificate.create({
    data: {
      orgId: org1.id,
      userId: certInspecteurId,
      type: 'VCA-VOL',
      number: 'NL-VCA-2024-00123',
      issueDate: new Date('2024-02-01'),
      validUntil: new Date(Date.now() + DAY_MS * 365 * 3), // ~3 jaar geldig
      issuer: 'VCA Examenbureau',
      storageKey: certKey,
      fileName: certFilename,
      originalName: certFilename,
      mimeType: 'application/pdf',
      size: certBytes.length,
    },
  });

  await prisma.inspectorCertificate.create({
    data: {
      orgId: org1.id,
      userId: certInspecteurId,
      type: 'NEN 3140 Vakbekwaam Persoon',
      issueDate: new Date('2021-09-15'),
      validUntil: new Date(Date.now() + DAY_MS * 20), // verloopt over ~20 dagen
      issuer: 'Hoogspanning Opleidingen B.V.',
    },
  });
  console.log('  ✓ 2 inspecteur-certificaten (1 geldig mét document, 1 verloopt binnen 30 dagen)');

  // Org 2 users
  const org2Users = [
    { email: 'admin@testbedrijf.nl', firstName: 'Lisa', lastName: 'Mulder', roles: [Role.ORG_ADMIN] },
    { email: 'inspecteur@testbedrijf.nl', firstName: 'Henk', lastName: 'Groot', roles: [Role.INSPECTEUR] },
  ];

  const createdOrg2Users: Record<string, string> = {};
  for (const u of org2Users) {
    const created = await prisma.user.create({
      data: { ...u, passwordHash, orgId: org2.id, emailVerifiedAt: new Date() },
    });
    createdOrg2Users[u.roles[0]] = created.id;
    console.log(`  ✓ User: ${u.email} (${u.roles[0]})`);
  }

  // ─── Beschikbaarheid inspecteurs (PRD-12) ───
  // Org 1 (InspeXi Demo): twee templates. "Standaard" (ma–vr 08:00–17:30 = 40u,
  // pauze-aftrek buiten scope) en "Parttime ma/wo/do" (07:00–15:00).
  const org1AvailAdminId = createdOrg1Users[Role.ORG_ADMIN];
  const org1InspecteurId = createdOrg1Users[Role.INSPECTEUR];
  const org2InspecteurId = createdOrg2Users[Role.INSPECTEUR];

  const standaardTemplate = await prisma.availabilityTemplate.create({
    data: {
      orgId: org1.id,
      name: 'Standaard',
      description: 'Fulltime ma–vr 08:00–17:30',
      slots: {
        create: [1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          startMinute: 8 * 60, // 08:00
          endMinute: 17 * 60 + 30, // 17:30
        })),
      },
    },
  });

  await prisma.availabilityTemplate.create({
    data: {
      orgId: org1.id,
      name: 'Parttime ma/wo/do',
      description: 'Parttime maandag, woensdag, donderdag 07:00–15:00',
      slots: {
        create: [1, 3, 4].map((weekday) => ({
          weekday,
          startMinute: 7 * 60, // 07:00
          endMinute: 15 * 60, // 15:00
        })),
      },
    },
  });

  // Tom Visser (inspecteur@inspexi-demo.nl) → DIENSTVERBAND + "Standaard" +
  // één eenmalige en één wekelijkse GEBLOKKEERD-uitzondering.
  await prisma.user.update({
    where: { id: org1InspecteurId },
    data: { employmentType: EmploymentType.DIENSTVERBAND },
  });
  await prisma.userScheduleAssignment.create({
    data: {
      orgId: org1.id,
      userId: org1InspecteurId,
      templateId: standaardTemplate.id,
      validFrom: new Date('2026-01-01'),
      createdById: org1AvailAdminId,
    },
  });
  await prisma.availabilityException.create({
    data: {
      orgId: org1.id,
      userId: org1InspecteurId,
      type: AvailabilityExceptionType.GEBLOKKEERD,
      // Expliciete Z: de resolutie-kern rekent in UTC; zonder Z parseert dit als
      // lokale tijd en raakt de all-day-blokkade op een UTC+x-machine ook 2 aug.
      startsAt: new Date('2026-08-03T00:00:00Z'),
      endsAt: new Date('2026-08-15T00:00:00Z'),
      allDay: true,
      reason: 'Vakantie',
      createdById: org1AvailAdminId,
    },
  });
  await prisma.availabilityException.create({
    data: {
      orgId: org1.id,
      userId: org1InspecteurId,
      type: AvailabilityExceptionType.GEBLOKKEERD,
      isRecurring: true,
      weekdays: [5], // elke vrijdagmiddag geblokkeerd
      startMinute: 13 * 60, // 13:00
      endMinute: 17 * 60 + 30, // 17:30
      intervalWeeks: 1,
      recurStartDate: new Date('2026-01-01'),
      reason: 'Vaste studiemiddag',
      createdById: org1AvailAdminId,
    },
  });

  // Henk Groot (inspecteur@testbedrijf.nl) → FREELANCE + wekelijkse BESCHIKBAAR
  // op dinsdag + donderdag.
  await prisma.user.update({
    where: { id: org2InspecteurId },
    data: { employmentType: EmploymentType.FREELANCE },
  });
  await prisma.availabilityException.create({
    data: {
      orgId: org2.id,
      userId: org2InspecteurId,
      type: AvailabilityExceptionType.BESCHIKBAAR,
      isRecurring: true,
      weekdays: [2, 4], // dinsdag + donderdag
      startMinute: 9 * 60, // 09:00
      endMinute: 16 * 60, // 16:00
      intervalWeeks: 1,
      recurStartDate: new Date('2026-01-01'),
      reason: 'Vaste beschikbare dagen',
      createdById: createdOrg2Users[Role.ORG_ADMIN],
    },
  });
  console.log('  ✓ Beschikbaarheid: 2 templates + dienstvorm/toewijzing/uitzonderingen (PRD-12)');

  // ─── Sample Invitations ────────────────────────────────
  await prisma.invitation.create({
    data: {
      orgId: org1.id,
      email: 'nieuw@inspexi-demo.nl',
      role: Role.BACKOFFICE,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  console.log('  ✓ Invitation: nieuw@inspexi-demo.nl (BACKOFFICE)');

  // ─── PRD-02: CRM Contacts ─────────────────────────────
  console.log('\n📇 Seeding CRM data...');

  // --- Org 1: Contact 1 — Bouwbedrijf De Vries BV (COMPANY) ---
  const contact1 = await prisma.contact.create({
    data: {
      orgId: org1.id,
      type: ContactType.COMPANY,
      companyName: 'Bouwbedrijf De Vries BV',
      email: 'info@devries-bouw.nl',
      phone: '+31 20 123 4567',
      website: 'https://devries-bouw.nl',
      vatNumber: 'NL123456789B01',
      cocNumber: '12345678',
      isSupplier: true,
      supplierCustomerNumber: 'KL-2024-IX',
      purchaseConditions: 'Betaling binnen 30 dagen. Levering franco huis. Retour binnen 14 dagen.',
      supplierRating: true,
      notes: 'Vaste klant sinds 2020. Hoofdzakelijk kantoorpanden.',
    },
  });
  console.log(`  ✓ Contact: ${contact1.companyName}`);

  // Adressen
  await prisma.contactAddress.createMany({
    data: [
      {
        contactId: contact1.id,
        label: 'Hoofdkantoor',
        street: 'Industrieweg',
        houseNumber: '42',
        postalCode: '1013 AA',
        city: 'Amsterdam',
        country: 'NL',
        isPrimary: true,
      },
      {
        contactId: contact1.id,
        label: 'Factuuradres',
        street: 'Postbus',
        houseNumber: '1234',
        postalCode: '1000 BA',
        city: 'Amsterdam',
        country: 'NL',
        isPrimary: false,
      },
    ],
  });

  // Systeem CRM-locatie-types (objecttype van relatie-locaties): globaal (orgId null),
  // gedeeld door alle organisaties. Kleuren = voormalige Tailwind-pills uit de portal.
  const crmLocationTypeData = [
    { code: 'woning', name: 'Woning', color: '#3B82F6' },
    { code: 'kantoor', name: 'Kantoor', color: '#A855F7' },
    { code: 'industrieel', name: 'Industrieel', color: '#F97316' },
    { code: 'winkel', name: 'Winkel', color: '#22C55E' },
    { code: 'overig', name: 'Overig', color: '#6B7280' },
  ];
  const crmLocationTypes: Record<string, string> = {};
  for (const [i, t] of crmLocationTypeData.entries()) {
    const created = await prisma.locationTypeDefinition.create({
      data: {
        code: t.code,
        name: t.name,
        color: t.color,
        scope: LocationTypeScope.CRM,
        isSystem: true,
        sortOrder: i,
      },
    });
    crmLocationTypes[t.code] = created.id;
  }

  // Locaties
  const loc1Kantoor = await prisma.location.create({
    data: {
      contactId: contact1.id,
      orgId: org1.id,
      name: 'Kantoorpand Zuidas',
      street: 'Gustav Mahlerlaan',
      houseNumber: '10',
      postalCode: '1082 PP',
      city: 'Amsterdam',
      locationTypeId: crmLocationTypes.kantoor,
      notes: 'Grote kantoorvloer, 3 verdiepingen',
      // Voorbeeld van PDOK/BAG-verrijking (zoals de refresh-knop oplevert)
      lat: 52.3376,
      lng: 4.8728,
      gebruiksfunctie: 'kantoorfunctie',
      bouwjaar: 2004,
      oppervlakte: 12500,
      bagId: '0363100012168433',
    },
  });
  await prisma.location.create({
    data: {
      contactId: contact1.id,
      orgId: org1.id,
      name: 'Woning Amstelveen',
      street: 'Populierenlaan',
      houseNumber: '88',
      postalCode: '1185 SE',
      city: 'Amstelveen',
      locationTypeId: crmLocationTypes.woning,
    },
  });
  const loc1Bedrijfshal = await prisma.location.create({
    data: {
      contactId: contact1.id,
      orgId: org1.id,
      name: 'Bedrijfshal Schiphol',
      street: 'Schipholweg',
      houseNumber: '200',
      postalCode: '1171 PK',
      city: 'Badhoevedorp',
      locationTypeId: crmLocationTypes.industrieel,
      notes: 'Toegang via poort B',
    },
  });

  // Contactlogs
  await prisma.contactLog.createMany({
    data: [
      {
        contactId: contact1.id,
        orgId: org1.id,
        userId: createdOrg1Users[Role.ORG_ADMIN],
        type: LogType.PHONE,
        subject: 'Offerte besproken',
        body: 'Klant wil graag korting op meerdere inspecties.',
        loggedAt: new Date('2026-02-15T10:30:00Z'),
      },
      {
        contactId: contact1.id,
        orgId: org1.id,
        userId: createdOrg1Users[Role.BACKOFFICE],
        type: LogType.MEETING,
        subject: 'Locatiebezoek Zuidas',
        body: 'Inspectie voorbereid voor kantoorpand.',
        loggedAt: new Date('2026-02-18T14:00:00Z'),
      },
      {
        contactId: contact1.id,
        orgId: org1.id,
        userId: createdOrg1Users[Role.MANAGER],
        type: LogType.NOTE,
        subject: 'Interne notitie',
        body: 'Klant is geïnteresseerd in jaarlijks onderhoudscontract.',
        loggedAt: new Date('2026-02-20T09:00:00Z'),
      },
    ],
  });

  // Email
  await prisma.contactEmail.create({
    data: {
      contactId: contact1.id,
      orgId: org1.id,
      userId: createdOrg1Users[Role.BACKOFFICE],
      subject: 'Offerte inspectie kantoorpand Zuidas',
      bodyHtml: '<p>Beste heer De Vries,</p><p>Hierbij ontvangt u de offerte voor de inspectie van het kantoorpand aan de Gustav Mahlerlaan 10.</p><p>Met vriendelijke groet,<br/>InspeXi Demo</p>',
      sentAt: new Date('2026-02-19T11:00:00Z'),
    },
  });

  console.log('    → 2 adressen, 3 locaties, 3 logs, 1 email');

  // --- Org 1: Contact 2 — Pieter Jansen (INDIVIDUAL) ---
  const contact2 = await prisma.contact.create({
    data: {
      orgId: org1.id,
      type: ContactType.INDIVIDUAL,
      firstName: 'Pieter',
      lastName: 'Jansen',
      email: 'pieter.jansen@gmail.com',
      phone: '+31 6 9876 5432',
      notes: 'Particuliere woning, eenmalige inspectie.',
    },
  });
  console.log(`  ✓ Contact: ${contact2.firstName} ${contact2.lastName}`);

  await prisma.contactAddress.create({
    data: {
      contactId: contact2.id,
      label: 'Woonadres',
      street: 'Kerkstraat',
      houseNumber: '15',
      postalCode: '3512 AB',
      city: 'Utrecht',
      country: 'NL',
      isPrimary: true,
    },
  });

  const loc2Woning = await prisma.location.create({
    data: {
      contactId: contact2.id,
      orgId: org1.id,
      name: 'Woning Utrecht',
      street: 'Kerkstraat',
      houseNumber: '15',
      postalCode: '3512 AB',
      city: 'Utrecht',
      locationTypeId: crmLocationTypes.woning,
    },
  });

  await prisma.contactLog.create({
    data: {
      contactId: contact2.id,
      orgId: org1.id,
      userId: createdOrg1Users[Role.BACKOFFICE],
      type: LogType.PHONE,
      subject: 'Afspraak ingepland',
      body: 'Inspectie gepland voor volgende week dinsdag.',
      loggedAt: new Date('2026-02-21T16:00:00Z'),
    },
  });

  console.log('    → 1 adres, 1 locatie, 1 log');

  // --- Org 1: Contact 3 — Vastgoed Partners BV (COMPANY) ---
  const contact3 = await prisma.contact.create({
    data: {
      orgId: org1.id,
      type: ContactType.COMPANY,
      companyName: 'Vastgoed Partners BV',
      email: 'beheer@vastgoedpartners.nl',
      phone: '+31 10 555 6677',
      website: 'https://vastgoedpartners.nl',
      vatNumber: 'NL987654321B01',
      cocNumber: '87654321',
    },
  });
  console.log(`  ✓ Contact: ${contact3.companyName}`);

  await prisma.contactAddress.create({
    data: {
      contactId: contact3.id,
      label: 'Hoofdkantoor',
      street: 'Coolsingel',
      houseNumber: '100',
      postalCode: '3011 AG',
      city: 'Rotterdam',
      country: 'NL',
      isPrimary: true,
    },
  });

  const loc3Zuidas = await prisma.location.create({
    data: {
      contactId: contact3.id,
      orgId: org1.id,
      name: 'Bouwplaats Zuidas',
      street: 'Kralingse Plaslaan',
      houseNumber: '50',
      postalCode: '3062 DB',
      city: 'Rotterdam',
      locationTypeId: crmLocationTypes.woning,
      notes: '24 appartementen',
    },
  });
  await prisma.location.create({
    data: {
      contactId: contact3.id,
      orgId: org1.id,
      name: 'Winkelcentrum Alexandrium',
      street: 'Alexandrium',
      houseNumber: '1',
      postalCode: '3068 NC',
      city: 'Rotterdam',
      locationTypeId: crmLocationTypes.winkel,
    },
  });

  console.log('    → 1 adres, 2 locaties');

  // --- Org 2: Contact 4 — Installatie Groep Nederland (COMPANY) ---
  const contact4 = await prisma.contact.create({
    data: {
      orgId: org2.id,
      type: ContactType.COMPANY,
      companyName: 'Installatie Groep Nederland',
      email: 'info@installatie-groep.nl',
      phone: '+31 30 111 2233',
      cocNumber: '55667788',
    },
  });
  console.log(`  ✓ Contact: ${contact4.companyName} (org2)`);

  await prisma.contactAddress.create({
    data: {
      contactId: contact4.id,
      label: 'Hoofdkantoor',
      street: 'Stationsplein',
      houseNumber: '5',
      postalCode: '3511 ED',
      city: 'Utrecht',
      country: 'NL',
      isPrimary: true,
    },
  });

  const loc4Magazijn = await prisma.location.create({
    data: {
      contactId: contact4.id,
      orgId: org2.id,
      name: 'Magazijn Nieuwegein',
      street: 'Industriepark',
      houseNumber: '30',
      postalCode: '3430 AA',
      city: 'Nieuwegein',
      locationTypeId: crmLocationTypes.industrieel,
    },
  });

  console.log('    → 1 adres, 1 locatie');

  // ─── Document tags (org1) ────────────────────────────
  console.log('\n🏷️  Seeding document tags...');
  const docTagContract = await prisma.documentTag.create({
    data: { orgId: org1.id, name: 'Contract', color: '#3B82F6', sortOrder: 0 },
  });
  const docTagKeuring = await prisma.documentTag.create({
    data: { orgId: org1.id, name: 'Keuringsrapport', color: '#10B981', sortOrder: 1 },
  });
  await prisma.documentTag.create({
    data: { orgId: org1.id, name: 'Archief', color: '#6B7280', sortOrder: 2 },
  });

  // Demo-document op contact1 met twee tags, zodat de gekleurde pills meteen
  // zichtbaar zijn in de documentenlijst (het bestand zelf is een placeholder).
  const demoDocument = await prisma.document.create({
    data: {
      orgId: org1.id,
      entityType: DocumentEntityType.CONTACT,
      entityId: contact1.id,
      fileName: 'samenwerkingsovereenkomst.pdf',
      originalName: 'Samenwerkingsovereenkomst De Vries.pdf',
      mimeType: 'application/pdf',
      size: 12_345,
      storageKey: `${org1.id}/seed-samenwerkingsovereenkomst.pdf`,
      description: 'Demo-document met tags',
      uploadedById: createdOrg1Users[Role.ORG_ADMIN],
    },
  });
  await prisma.documentTagAssignment.createMany({
    data: [
      { documentId: demoDocument.id, documentTagId: docTagContract.id, orgId: org1.id },
      { documentId: demoDocument.id, documentTagId: docTagKeuring.id, orgId: org1.id },
    ],
  });
  console.log('  ✓ Document tags (3) + 1 demo-document met 2 tags');

  // ─── PRD-04: Products & Price Tables ─────────────────
  console.log('\n📦 Seeding Products & Price Tables...');

  // --- Org 1: Product Groups ---
  const [grpInspectie1, grpAdministratie1, grpOverig1] = await Promise.all([
    prisma.productGroup.create({ data: { orgId: org1.id, name: 'Inspectie' } }),
    prisma.productGroup.create({ data: { orgId: org1.id, name: 'Administratie' } }),
    prisma.productGroup.create({ data: { orgId: org1.id, name: 'Overig' } }),
  ]);
  const grpMeerwerk1 = await prisma.productGroup.create({
    data: { orgId: org1.id, name: 'Meerwerk' },
  });
  console.log(`  ✓ 4 productgroepen voor ${org1.name}`);

  // --- Org 1: Products ---
  const products1 = await Promise.all([
    prisma.product.create({
      data: { orgId: org1.id, name: 'NEN1010 Inspectie', unit: 'uur', productGroupId: grpInspectie1.id, description: 'Elektrische inspectie conform NEN1010 norm' },
    }),
    prisma.product.create({
      data: { orgId: org1.id, name: 'NEN3140 Inspectie', unit: 'uur', productGroupId: grpInspectie1.id, description: 'Periodieke inspectie elektrische arbeidsmiddelen' },
    }),
    prisma.product.create({
      data: { orgId: org1.id, name: 'Thermografisch onderzoek', unit: 'traject', productGroupId: grpInspectie1.id, description: 'Warmtebeeldanalyse van elektrische installaties' },
    }),
    prisma.product.create({
      data: { orgId: org1.id, name: 'Rapportage opstellen', unit: 'uur', productGroupId: grpAdministratie1.id, description: 'Inspectie rapport en documentatie' },
    }),
    prisma.product.create({
      data: { orgId: org1.id, name: 'Reiskosten', unit: 'km', productGroupId: grpOverig1.id, defaultVat: 21, description: 'Kilometervergoeding' },
    }),
    prisma.product.create({
      data: { orgId: org1.id, name: 'Spoedtoeslag', unit: 'stuks', productGroupId: grpOverig1.id, description: 'Toeslag voor spoedopdrachten' },
    }),
  ]);
  console.log(`  ✓ ${products1.length} producten voor ${org1.name}`);

  // --- Org 1: Meerwerk Products ---
  const meerwerkProduct1 = await prisma.product.create({
    data: { orgId: org1.id, name: 'Extra inspectieuur', unit: 'uur', productGroupId: grpMeerwerk1.id, description: 'Aanvullend inspectiewerk buiten scope' },
  });
  const meerwerkProduct2 = await prisma.product.create({
    data: { orgId: org1.id, name: 'Herstelling ter plaatse', unit: 'stuks', productGroupId: grpMeerwerk1.id, description: 'Kleine herstellingen tijdens inspectie' },
  });
  const meerwerkProduct3 = await prisma.product.create({
    data: { orgId: org1.id, name: 'Extra meetpunt', unit: 'stuks', productGroupId: grpMeerwerk1.id, description: 'Aanvullend meetpunt voor inspectie' },
  });
  console.log(`  ✓ 3 meerwerkproducten voor ${org1.name}`);

  // Suppress unused var warnings for meerwerk products
  void meerwerkProduct1;
  void meerwerkProduct2;
  void meerwerkProduct3;

  // --- Org 1: Standaard prijstabel ---
  const stdTable = await prisma.priceTable.create({
    data: {
      orgId: org1.id,
      name: 'Standaard',
      description: 'Standaard tarieven voor alle klanten',
      isDefault: true,
    },
  });

  await Promise.all([
    prisma.priceTableItem.create({
      data: { priceTableId: stdTable.id, productId: products1[0].id, priceType: PriceType.FIXED, basePrice: 85.00 },
    }),
    prisma.priceTableItem.create({
      data: { priceTableId: stdTable.id, productId: products1[1].id, priceType: PriceType.FIXED, basePrice: 75.00 },
    }),
    prisma.priceTableItem.create({
      data: { priceTableId: stdTable.id, productId: products1[2].id, priceType: PriceType.FIXED, basePrice: 495.00 },
    }),
    prisma.priceTableItem.create({
      data: { priceTableId: stdTable.id, productId: products1[3].id, priceType: PriceType.FIXED, basePrice: 55.00 },
    }),
    prisma.priceTableItem.create({
      data: { priceTableId: stdTable.id, productId: products1[4].id, priceType: PriceType.FIXED, basePrice: 0.25 },
    }),
    prisma.priceTableItem.create({
      data: { priceTableId: stdTable.id, productId: products1[5].id, priceType: PriceType.FIXED, basePrice: 150.00 },
    }),
  ]);
  console.log(`  ✓ Prijstabel: ${stdTable.name} (standaard, 6 producten)`);

  // --- Org 1: VIP Klanten prijstabel ---
  const vipTable = await prisma.priceTable.create({
    data: {
      orgId: org1.id,
      name: 'VIP Klanten',
      description: 'Gereduceerde tarieven voor vaste klanten',
      isDefault: false,
    },
  });

  await Promise.all([
    prisma.priceTableItem.create({
      data: { priceTableId: vipTable.id, productId: products1[0].id, priceType: PriceType.FIXED, basePrice: 75.00 },
    }),
    prisma.priceTableItem.create({
      data: { priceTableId: vipTable.id, productId: products1[1].id, priceType: PriceType.FIXED, basePrice: 65.00 },
    }),
    // Thermografisch onderzoek: TIERED pricing
    prisma.priceTableItem.create({
      data: {
        priceTableId: vipTable.id,
        productId: products1[2].id,
        priceType: PriceType.TIERED,
        tiers: {
          create: [
            { fromQty: 1, toQty: 5, price: 450.00 },
            { fromQty: 6, toQty: 10, price: 400.00 },
            { fromQty: 11, price: 350.00 },
          ],
        },
      },
    }),
    prisma.priceTableItem.create({
      data: { priceTableId: vipTable.id, productId: products1[3].id, priceType: PriceType.FIXED, basePrice: 45.00 },
    }),
    prisma.priceTableItem.create({
      data: { priceTableId: vipTable.id, productId: products1[4].id, priceType: PriceType.FIXED, basePrice: 0.00 },
    }),
    prisma.priceTableItem.create({
      data: { priceTableId: vipTable.id, productId: products1[5].id, priceType: PriceType.FIXED, basePrice: 100.00 },
    }),
  ]);
  console.log(`  ✓ Prijstabel: ${vipTable.name} (6 producten, incl. staffel)`);

  // Koppel VIP tabel aan Bouwbedrijf De Vries BV
  await prisma.contactPriceTable.create({
    data: { contactId: contact1.id, priceTableId: vipTable.id },
  });
  console.log(`  ✓ Koppeling: ${contact1.companyName} → ${vipTable.name}`);

  // --- Org 2: Product Groups ---
  const grpInspectie2 = await prisma.productGroup.create({
    data: { orgId: org2.id, name: 'Inspectie' },
  });

  // --- Org 2: Products ---
  const products2 = await Promise.all([
    prisma.product.create({
      data: { orgId: org2.id, name: 'Basisinspectie', unit: 'uur', productGroupId: grpInspectie2.id },
    }),
    prisma.product.create({
      data: { orgId: org2.id, name: 'Uitgebreide inspectie', unit: 'dag', productGroupId: grpInspectie2.id },
    }),
  ]);

  const org2Table = await prisma.priceTable.create({
    data: {
      orgId: org2.id,
      name: 'Standaard',
      description: 'Standaard tarieven',
      isDefault: true,
    },
  });

  await Promise.all([
    prisma.priceTableItem.create({
      data: { priceTableId: org2Table.id, productId: products2[0].id, priceType: PriceType.FIXED, basePrice: 65.00 },
    }),
    prisma.priceTableItem.create({
      data: { priceTableId: org2Table.id, productId: products2[1].id, priceType: PriceType.FIXED, basePrice: 450.00 },
    }),
  ]);
  console.log(`  ✓ ${products2.length} producten + 1 prijstabel voor ${org2.name}`);

  // ─── PRD-03: Requests (Leads & Aanvragen) ───────────────
  console.log('\n📋 Seeding Requests...');

  // Request 1: NEN1010 keuring kantoorpand — Bouwbedrijf De Vries, locatie Kantoorpand Zuidas
  const req1 = await prisma.request.create({
    data: {
      orgId: org1.id,
      contactId: contact1.id,
      locationId: loc1Kantoor.id,
      assignedTo: createdOrg1Users[Role.MANAGER],
      source: RequestSource.PHONE,
      status: RequestStatus.IN_BEHANDELING,
      title: 'NEN1010 keuring kantoorpand',
      description: 'Klant belt met verzoek om NEN1010 keuring voor kantoorpand Zuidas. Dringend ivm verzekeringseisen.',
      priority: Priority.HIGH,
      createdBy: createdOrg1Users[Role.ORG_ADMIN],
    },
  });
  await prisma.requestStatusHistory.createMany({
    data: [
      {
        requestId: req1.id,
        fromStatus: null,
        toStatus: RequestStatus.NIEUW,
        changedBy: createdOrg1Users[Role.ORG_ADMIN],
        changedAt: new Date('2026-02-15T09:00:00Z'),
      },
      {
        requestId: req1.id,
        fromStatus: RequestStatus.NIEUW,
        toStatus: RequestStatus.IN_BEHANDELING,
        changedBy: createdOrg1Users[Role.MANAGER],
        changedAt: new Date('2026-02-15T11:30:00Z'),
        note: 'Inspecteur inplannen voor volgende week',
      },
    ],
  });
  console.log(`  ✓ Aanvraag: ${req1.title} (IN_BEHANDELING)`);

  // Request 2: Thermografisch onderzoek bedrijfshal — Bouwbedrijf De Vries, locatie Bedrijfshal
  const req2 = await prisma.request.create({
    data: {
      orgId: org1.id,
      contactId: contact1.id,
      locationId: loc1Bedrijfshal.id,
      source: RequestSource.EMAIL,
      status: RequestStatus.NIEUW,
      title: 'Thermografisch onderzoek bedrijfshal',
      description: 'Email ontvangen met verzoek om thermografisch onderzoek in bedrijfshal Schiphol.',
      priority: Priority.NORMAL,
      createdBy: createdOrg1Users[Role.BACKOFFICE],
    },
  });
  await prisma.requestStatusHistory.create({
    data: {
      requestId: req2.id,
      fromStatus: null,
      toStatus: RequestStatus.NIEUW,
      changedBy: createdOrg1Users[Role.BACKOFFICE],
      changedAt: new Date('2026-02-18T08:00:00Z'),
    },
  });
  console.log(`  ✓ Aanvraag: ${req2.title} (NIEUW)`);

  // Request 3: NEN3140 inspectie werkplaats — Pieter Jansen, locatie Woning Utrecht
  const req3 = await prisma.request.create({
    data: {
      orgId: org1.id,
      contactId: contact2.id,
      locationId: loc2Woning.id,
      assignedTo: createdOrg1Users[Role.BACKOFFICE],
      source: RequestSource.MANUAL,
      status: RequestStatus.OFFERTE_GEMAAKT,
      title: 'NEN3140 inspectie werkplaats',
      description: 'Particuliere klant wil NEN3140 inspectie voor werkplaats achter woning.',
      priority: Priority.NORMAL,
      createdBy: createdOrg1Users[Role.BACKOFFICE],
    },
  });
  await prisma.requestStatusHistory.createMany({
    data: [
      {
        requestId: req3.id,
        fromStatus: null,
        toStatus: RequestStatus.NIEUW,
        changedBy: createdOrg1Users[Role.BACKOFFICE],
        changedAt: new Date('2026-02-10T14:00:00Z'),
      },
      {
        requestId: req3.id,
        fromStatus: RequestStatus.NIEUW,
        toStatus: RequestStatus.IN_BEHANDELING,
        changedBy: createdOrg1Users[Role.BACKOFFICE],
        changedAt: new Date('2026-02-11T09:00:00Z'),
        note: 'Offerte in voorbereiding',
      },
      {
        requestId: req3.id,
        fromStatus: RequestStatus.IN_BEHANDELING,
        toStatus: RequestStatus.OFFERTE_GEMAAKT,
        changedBy: createdOrg1Users[Role.BACKOFFICE],
        changedAt: new Date('2026-02-13T16:00:00Z'),
        note: 'Offerte verstuurd per email',
      },
    ],
  });
  console.log(`  ✓ Aanvraag: ${req3.title} (OFFERTE_GEMAAKT)`);

  // Request 4: Elektrakeuring nieuwbouwproject — Vastgoed Partners, locatie Bouwplaats Zuidas
  const req4 = await prisma.request.create({
    data: {
      orgId: org1.id,
      contactId: contact3.id,
      locationId: loc3Zuidas.id,
      assignedTo: createdOrg1Users[Role.MANAGER],
      source: RequestSource.WEB_FORM,
      status: RequestStatus.GEWONNEN,
      title: 'Elektrakeuring nieuwbouwproject',
      description: 'Aanvraag via websiteformulier voor volledige elektrakeuring nieuwbouwproject Zuidas.',
      priority: Priority.LOW,
      createdBy: createdOrg1Users[Role.ORG_ADMIN],
    },
  });
  await prisma.requestStatusHistory.createMany({
    data: [
      {
        requestId: req4.id,
        fromStatus: null,
        toStatus: RequestStatus.NIEUW,
        changedBy: createdOrg1Users[Role.ORG_ADMIN],
        changedAt: new Date('2026-02-01T10:00:00Z'),
      },
      {
        requestId: req4.id,
        fromStatus: RequestStatus.NIEUW,
        toStatus: RequestStatus.IN_BEHANDELING,
        changedBy: createdOrg1Users[Role.MANAGER],
        changedAt: new Date('2026-02-02T08:30:00Z'),
        note: 'Planning opgesteld',
      },
      {
        requestId: req4.id,
        fromStatus: RequestStatus.IN_BEHANDELING,
        toStatus: RequestStatus.OFFERTE_GEMAAKT,
        changedBy: createdOrg1Users[Role.MANAGER],
        changedAt: new Date('2026-02-05T15:00:00Z'),
        note: 'Offerte voor meerdere fases opgestuurd',
      },
      {
        requestId: req4.id,
        fromStatus: RequestStatus.OFFERTE_GEMAAKT,
        toStatus: RequestStatus.GEWONNEN,
        changedBy: createdOrg1Users[Role.ORG_ADMIN],
        changedAt: new Date('2026-02-10T11:00:00Z'),
        note: 'Klant akkoord, opdracht bevestigd',
      },
    ],
  });
  console.log(`  ✓ Aanvraag: ${req4.title} (GEWONNEN)`);

  // Request 5: Basisinspectie fabriek — Installatie Groep (org2)
  const req5 = await prisma.request.create({
    data: {
      orgId: org2.id,
      contactId: contact4.id,
      locationId: loc4Magazijn.id,
      source: RequestSource.MANUAL,
      status: RequestStatus.NIEUW,
      title: 'Basisinspectie fabriek',
      description: 'Jaarlijkse basisinspectie voor het magazijn.',
      priority: Priority.NORMAL,
      createdBy: createdOrg2Users[Role.ORG_ADMIN],
    },
  });
  await prisma.requestStatusHistory.create({
    data: {
      requestId: req5.id,
      fromStatus: null,
      toStatus: RequestStatus.NIEUW,
      changedBy: createdOrg2Users[Role.ORG_ADMIN],
      changedAt: new Date('2026-02-20T09:00:00Z'),
    },
  });
  console.log(`  ✓ Aanvraag: ${req5.title} (NIEUW, org2)`);

  // ─── PRD-05: Quote Templates ─────────────────────────
  console.log('\n📄 Seeding Quote Templates...');

  const template1 = await prisma.quoteTemplate.create({
    data: {
      orgId: org1.id,
      name: 'Standaard Inspectie Offerte',
      description: 'Standaard template voor inspectieopdrachten. Bevat introductietekst, offerteregels en afsluiting.',
      contentBlocks: [
        {
          id: randomUUID(),
          type: 'rich_text',
          width: 'full',
          order: 0,
          content: {
            tiptapJson: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Offerte Inspectie' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Beste {{contact.voornaam}} {{contact.achternaam}},' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Hierbij ontvangt u onze offerte voor de gevraagde inspectie. De volgende werkzaamheden zijn opgenomen in deze offerte:' }] },
              ],
            },
          },
        },
        {
          id: randomUUID(),
          type: 'quote_lines',
          width: 'full',
          order: 1,
          content: { title: 'Offerteregels' },
        },
        {
          id: randomUUID(),
          type: 'rich_text',
          width: 'full',
          order: 2,
          content: {
            tiptapJson: {
              type: 'doc',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Wij vertrouwen erop u hiermee een passend aanbod te hebben gedaan.' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Met vriendelijke groet,' }] },
                { type: 'paragraph', content: [{ type: 'text', text: '{{organisatie.naam}}' }] },
              ],
            },
          },
        },
      ],
      defaultValidityDays: 30,
      requiresApproval: false,
    },
  });
  console.log(`  ✓ Template: ${template1.name}`);

  const template2 = await prisma.quoteTemplate.create({
    data: {
      orgId: org1.id,
      name: 'Groot Project Offerte (goedkeuring vereist)',
      description: 'Template voor grote projectoffertes die goedkeuring vereisen van een manager.',
      contentBlocks: [
        {
          id: randomUUID(),
          type: 'rich_text',
          width: 'full',
          order: 0,
          content: {
            tiptapJson: {
              type: 'doc',
              content: [
                { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Projectofferte' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Projectomschrijving en specificaties:' }] },
              ],
            },
          },
        },
        {
          id: randomUUID(),
          type: 'quote_lines',
          width: 'full',
          order: 1,
          content: { title: 'Uw investering' },
        },
        {
          id: randomUUID(),
          type: 'rich_text',
          width: 'full',
          order: 2,
          content: {
            tiptapJson: {
              type: 'doc',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Wij zien uw reactie met belangstelling tegemoet.' }] },
              ],
            },
          },
        },
      ],
      defaultValidityDays: 14,
      requiresApproval: true,
    },
  });
  console.log(`  ✓ Template: ${template2.name}`);

  // ─── PRD-05: Quotes ────────────────────────────────────
  console.log('\n📄 Seeding Quotes...');

  // Quote 1: Linked to req3 (NEN3140 inspectie werkplaats), GOEDGEKEURD
  const quote1 = await prisma.quote.create({
    data: {
      orgId: org1.id,
      quoteNumber: 'OFF-2026-0001',
      templateId: template1.id,
      requestId: req3.id,
      contactId: contact2.id,
      locationId: loc2Woning.id,
      status: QuoteStatus.GOEDGEKEURD,
      subject: 'NEN3140 inspectie werkplaats Pieter Jansen',
      coverBlocks: template1.coverBlocks ?? undefined,
      contentBlocks: template1.contentBlocks ?? undefined,
      closingBlocks: template1.closingBlocks ?? undefined,
      subtotal: 355.00,
      discountTotal: 0,
      vatTotal: 74.55,
      total: 429.55,
      validUntil: new Date('2026-03-15'),
      requiresApproval: false,
      createdBy: createdOrg1Users[Role.BACKOFFICE],
    },
  });

  await prisma.quoteLine.createMany({
    data: [
      {
        quoteId: quote1.id,
        productId: products1[1].id, // NEN3140 Inspectie
        description: 'NEN3140 Inspectie',
        quantity: 3,
        unit: 'uur',
        unitPrice: 75.00,
        vatRate: 21,
        discountPct: 0,
        lineTotal: 225.00,
        sortOrder: 0,
      },
      {
        quoteId: quote1.id,
        productId: products1[3].id, // Rapportage opstellen
        description: 'Rapportage opstellen',
        quantity: 2,
        unit: 'uur',
        unitPrice: 55.00,
        vatRate: 21,
        discountPct: 0,
        lineTotal: 110.00,
        sortOrder: 1,
      },
      {
        quoteId: quote1.id,
        productId: products1[4].id, // Reiskosten
        description: 'Reiskosten Utrecht',
        quantity: 80,
        unit: 'km',
        unitPrice: 0.25,
        vatRate: 21,
        discountPct: 0,
        lineTotal: 20.00,
        sortOrder: 2,
      },
    ],
  });
  console.log(`  ✓ Offerte: ${quote1.quoteNumber} — ${quote1.subject} (GOEDGEKEURD, 3 regels)`);

  // Quote 2: CONCEPT with approval required, with lines
  const quote2 = await prisma.quote.create({
    data: {
      orgId: org1.id,
      quoteNumber: 'OFF-2026-0002',
      templateId: template2.id,
      contactId: contact1.id,
      locationId: loc1Kantoor.id,
      status: QuoteStatus.CONCEPT,
      subject: 'Thermografisch onderzoek + NEN1010 Zuidas',
      coverBlocks: template2.coverBlocks ?? undefined,
      contentBlocks: template2.contentBlocks ?? undefined,
      closingBlocks: template2.closingBlocks ?? undefined,
      subtotal: 1165.00,
      discountTotal: 15.00,
      vatTotal: 244.65,
      total: 1409.65,
      validUntil: new Date('2026-03-25'),
      requiresApproval: true,
      createdBy: createdOrg1Users[Role.BACKOFFICE],
    },
  });

  await prisma.quoteLine.createMany({
    data: [
      {
        quoteId: quote2.id,
        productId: products1[2].id, // Thermografisch onderzoek
        description: 'Thermografisch onderzoek kantoorgebouw Zuidas',
        quantity: 1,
        unit: 'traject',
        unitPrice: 495.00,
        vatRate: 21,
        discountPct: 0,
        lineTotal: 495.00,
        sortOrder: 0,
      },
      {
        quoteId: quote2.id,
        productId: products1[0].id, // NEN1010 Inspectie
        description: 'NEN1010 Inspectie elektrische installatie',
        quantity: 4,
        unit: 'uur',
        unitPrice: 85.00,
        vatRate: 21,
        discountPct: 0,
        lineTotal: 340.00,
        sortOrder: 1,
      },
      {
        quoteId: quote2.id,
        productId: products1[3].id, // Rapportage opstellen
        description: 'Rapportage en certificering',
        quantity: 3,
        unit: 'uur',
        unitPrice: 55.00,
        vatRate: 21,
        discountPct: 0,
        lineTotal: 165.00,
        sortOrder: 2,
      },
      {
        quoteId: quote2.id,
        productId: products1[4].id, // Reiskosten
        description: 'Reiskosten Amsterdam',
        quantity: 120,
        unit: 'km',
        unitPrice: 0.25,
        vatRate: 21,
        discountPct: 0,
        lineTotal: 30.00,
        sortOrder: 3,
      },
      {
        quoteId: quote2.id,
        productId: products1[5].id, // Spoedtoeslag
        description: 'Spoedtoeslag (gewenste uitvoering < 5 werkdagen)',
        quantity: 1,
        unit: 'stuks',
        unitPrice: 150.00,
        vatRate: 21,
        discountPct: 10,
        lineTotal: 135.00,  // 150 * (1 - 10/100) = 135
        sortOrder: 4,
      },
    ],
  });
  console.log(`  ✓ Offerte: ${quote2.quoteNumber} — ${quote2.subject} (CONCEPT, 5 regels)`);

  // ─── PRD-06: Notifications ─────────────────────────────
  console.log('\n🔔 Seeding Notifications...');

  await prisma.notification.createMany({
    data: [
      {
        orgId: org1.id,
        userId: createdOrg1Users[Role.MANAGER],
        type: NotificationType.OFFERTE_TER_GOEDKEURING,
        title: 'Offerte ter goedkeuring',
        body: `Offerte ${quote2.quoteNumber} staat klaar voor uw goedkeuring.`,
        entityType: 'quote',
        entityId: quote2.id,
        isRead: false,
      },
      {
        orgId: org1.id,
        userId: createdOrg1Users[Role.BACKOFFICE],
        type: NotificationType.OFFERTE_GOEDGEKEURD,
        title: 'Offerte goedgekeurd',
        body: `Offerte ${quote1.quoteNumber} is goedgekeurd.`,
        entityType: 'quote',
        entityId: quote1.id,
        isRead: true,
        readAt: new Date('2026-02-20T12:00:00Z'),
      },
      {
        orgId: org1.id,
        userId: createdOrg1Users[Role.MANAGER],
        type: NotificationType.AANVRAAG_TOEGEWEZEN,
        title: 'Aanvraag toegewezen',
        body: `Aanvraag "${req1.title}" is aan u toegewezen.`,
        entityType: 'request',
        entityId: req1.id,
        isRead: false,
      },
    ],
  });
  console.log('  ✓ 3 sample notificaties');

  // ─── REQ1: Interne chat ────────────────────────────────
  console.log('\n💬 Seeding interne chat...');

  const chatBackofficeId = createdOrg1Users[Role.BACKOFFICE];
  const chatInspecteurId = createdOrg1Users[Role.INSPECTEUR];

  // 1-op-1 chat (backoffice ↔ inspecteur) gekoppeld aan een aanvraag, met @-mention.
  const directKey = [chatBackofficeId, chatInspecteurId].sort().join(':');
  await prisma.chatThread.create({
    data: {
      orgId: org1.id,
      type: ChatThreadType.DIRECT,
      directKey,
      status: ChatThreadStatus.OPEN,
      referenceEntityType: 'Request',
      referenceEntityId: req1.id,
      createdById: chatBackofficeId,
      participants: {
        create: [
          { userId: chatBackofficeId, lastReadAt: new Date('2026-06-22T09:10:00Z') },
          { userId: chatInspecteurId },
        ],
      },
      messages: {
        create: [
          {
            orgId: org1.id,
            senderId: chatBackofficeId,
            content: `Hoi Tom, kun je deze aanvraag "${req1.title}" oppakken?`,
            mentionedUserIds: [chatInspecteurId],
            createdAt: new Date('2026-06-22T09:00:00Z'),
          },
          {
            orgId: org1.id,
            senderId: chatInspecteurId,
            content: 'Ja, ik kijk er vanmiddag naar.',
            createdAt: new Date('2026-06-22T09:05:00Z'),
          },
        ],
      },
    },
  });

  // Team-chat voor backoffice.
  await prisma.chatThread.create({
    data: {
      orgId: org1.id,
      type: ChatThreadType.TEAM,
      teamRole: Role.BACKOFFICE,
      status: ChatThreadStatus.OPEN,
      createdById: chatBackofficeId,
      participants: {
        create: [{ userId: chatBackofficeId, lastReadAt: new Date('2026-06-22T08:35:00Z') }],
      },
      messages: {
        create: [
          {
            orgId: org1.id,
            senderId: chatBackofficeId,
            content: 'Team, let op de deadline van vrijdag.',
            createdAt: new Date('2026-06-22T08:30:00Z'),
          },
        ],
      },
    },
  });

  console.log('  ✓ 1 directe chat (met referentie + mention) + 1 team-chat');

  // ─── PRD-07: Planning ──────────────────────────────────
  console.log('\n📅 Seeding Planning items...');

  // Planning item 1: GEPLAND - NEN3140 inspectie bij Pieter Jansen
  const planning1 = await prisma.planningItem.create({
    data: {
      orgId: org1.id,
      quoteId: quote1.id,
      contactId: contact2.id,
      locationId: loc2Woning.id,
      productId: products1[1].id,
      productName: 'NEN3140 Inspectie',
      status: PlanningStatus.GEPLAND,
      scheduledDate: new Date('2026-03-10T09:00:00Z'),
      durationHours: 3,
      endTime: new Date('2026-03-10T12:00:00Z'),
      internalNotes: 'Toegang via achterdeur, bellen bij buurman',
      createdBy: createdOrg1Users[Role.BACKOFFICE],
    },
  });

  // Inspector: Tom Visser (INSPECTEUR), primary, accepted
  await prisma.planningInspector.create({
    data: {
      planningItemId: planning1.id,
      userId: createdOrg1Users[Role.INSPECTEUR],
      isPrimary: true,
      acceptanceStatus: AcceptanceStatus.ACCEPTED,
      acceptedAt: new Date('2026-02-27T10:00:00Z'),
    },
  });

  await prisma.planningHistory.create({
    data: {
      planningItemId: planning1.id,
      userId: createdOrg1Users[Role.BACKOFFICE],
      action: 'STATUS_CHANGED',
      description: 'Alle inspecteurs hebben geaccepteerd — status gewijzigd naar GEPLAND',
      oldValue: 'CONCEPT',
      newValue: 'GEPLAND',
    },
  });

  console.log(`  ✓ Planregel: NEN3140 inspectie Pieter Jansen (GEPLAND, 10 mrt)`);

  // Planning item 2: NOG_TE_PLANNEN - Thermografisch onderzoek Bouwbedrijf De Vries
  const planning2 = await prisma.planningItem.create({
    data: {
      orgId: org1.id,
      contactId: contact1.id,
      locationId: loc1Kantoor.id,
      productId: products1[2].id,
      productName: 'Thermografisch onderzoek',
      status: PlanningStatus.NOG_TE_PLANNEN,
      internalNotes: 'Afgesproken met klant om in week 12 in te plannen',
      createdBy: createdOrg1Users[Role.MANAGER],
    },
  });

  console.log(`  ✓ Planregel: Thermografisch onderzoek De Vries (NOG_TE_PLANNEN)`);

  // Suppress unused var warning
  void planning2;
  void req5;
  void loc4Magazijn;

  // ─── Projects ──────────────────────────────────────────────
  console.log('\n📁 Creating projects...');

  const project1 = await prisma.project.create({
    data: {
      orgId: org1.id,
      projectNumber: 'P-2026-0001',
      title: 'Periodieke keuring bedrijfshal',
      description: 'Jaarlijkse keuring van de bedrijfshal inclusief brandveiligheid en constructieve elementen.',
      status: ProjectStatus.ACTIEF,
      contactId: contact1.id,
      locationId: loc1Kantoor.id,
      projectManagerId: createdOrg1Users[Role.MANAGER],
      startDate: new Date('2026-01-15'),
      createdBy: createdOrg1Users[Role.MANAGER],
    },
  });
  console.log(`  ✓ Project: ${project1.projectNumber}`);

  // Link existing request and quote to project
  await prisma.request.update({
    where: { id: req1.id },
    data: { projectId: project1.id },
  });
  await prisma.quote.update({
    where: { id: quote1.id },
    data: { projectId: project1.id },
  });

  // Add a follower to project 1
  await prisma.projectFollower.create({
    data: {
      projectId: project1.id,
      userId: createdOrg1Users[Role.ORG_ADMIN],
    },
  });

  // ─── PRD-12: Projectfasen op het demo-project ──────────────
  const phase1 = await prisma.projectPhase.create({
    data: {
      orgId: org1.id,
      projectId: project1.id,
      name: 'Fase 1 — Kantoorpand Zuidas',
      description: 'Initiële inspectie van het hoofdpand aan de Zuidas.',
      status: PhaseStatus.ACTIEF,
      sortOrder: 0,
      locationId: loc1Kantoor.id,
      startDate: new Date('2026-06-01'),
      expectedEndDate: new Date('2026-07-15'),
      budgetAmount: 4500,
      createdBy: createdOrg1Users[Role.MANAGER],
    },
  });
  const phase2 = await prisma.projectPhase.create({
    data: {
      orgId: org1.id,
      projectId: project1.id,
      name: 'Fase 2 — Herinspectie',
      description: 'Herinspectie na uitvoering van herstelwerkzaamheden.',
      status: PhaseStatus.NIET_GESTART,
      sortOrder: 1,
      createdBy: createdOrg1Users[Role.MANAGER],
    },
  });

  // Milestones: één met dueDate binnen 7 dagen (voor de reminder-demo).
  const milestoneSoon = new Date();
  milestoneSoon.setDate(milestoneSoon.getDate() + 5);
  await prisma.phaseMilestone.createMany({
    data: [
      {
        orgId: org1.id,
        phaseId: phase1.id,
        title: 'Rapportage pand A gereed',
        description: 'Concept-rapportage opleveren aan de projectmanager.',
        dueDate: milestoneSoon,
        assigneeId: createdOrg1Users[Role.INSPECTEUR],
        reminderDaysBefore: 7,
        sortOrder: 0,
      },
      {
        orgId: org1.id,
        phaseId: phase1.id,
        title: 'Oplevering aan klant',
        dueDate: new Date('2026-07-20'),
        sortOrder: 1,
      },
      {
        orgId: org1.id,
        phaseId: phase2.id,
        title: 'Herinspectie ingepland',
        dueDate: new Date('2026-08-15'),
        assigneeId: createdOrg1Users[Role.MANAGER],
        sortOrder: 0,
      },
    ],
  });

  // Eén (interne) volger per fase.
  await prisma.projectPhaseFollower.createMany({
    data: [
      { phaseId: phase1.id, userId: createdOrg1Users[Role.ORG_ADMIN] },
      { phaseId: phase2.id, userId: createdOrg1Users[Role.ORG_ADMIN] },
    ],
  });
  console.log(`  ✓ Projectfasen: 2 fasen op ${project1.projectNumber} (Fase 1 ACTIEF)`);

  const project2 = await prisma.project.create({
    data: {
      orgId: org1.id,
      projectNumber: 'P-2026-0002',
      title: 'Nieuwbouw inspectie kantoorpand',
      status: ProjectStatus.ACTIEF,
      contactId: contact1.id,
      projectManagerId: createdOrg1Users[Role.ORG_ADMIN],
      startDate: new Date('2026-02-01'),
      expectedEndDate: new Date('2026-06-30'),
      createdBy: createdOrg1Users[Role.ORG_ADMIN],
    },
  });
  console.log(`  ✓ Project: ${project2.projectNumber}`);
  void project2;

  // ─── REQ36: Favorieten (sterretjes) ────────────────────
  // Een paar demo-favorieten voor de ORG_ADMIN, verspreid over de modellen
  // zodat de favorieten-pagina meteen meerdere groepen toont.
  const demoFavoriteUserId = createdOrg1Users[Role.ORG_ADMIN];
  const demoFavorites: Array<{ entityType: string; entityId: string }> = [
    { entityType: 'Contact', entityId: contact1.id },
    { entityType: 'Request', entityId: req1.id },
    { entityType: 'Quote', entityId: quote1.id },
    { entityType: 'Project', entityId: project1.id },
    { entityType: 'Product', entityId: meerwerkProduct1.id },
  ];
  for (const fav of demoFavorites) {
    await prisma.favorite.create({
      data: {
        userId: demoFavoriteUserId,
        orgId: org1.id,
        entityType: fav.entityType,
        entityId: fav.entityId,
      },
    });
  }
  console.log(`  ✓ Favorites: ${demoFavorites.length} (admin@inspexi-demo.nl)`);

  // ─── PRD-10 Fase 1: Helpsysteem ────────────────────────
  console.log('\n📚 Seeding help system...');

  const demoOrg = await prisma.organization.findUnique({ where: { slug: 'inspexidemo' } });
  const superUser = await prisma.user.findFirst({ where: { email: 'superuser@inspexi.nl' } });
  const demoAdmin = await prisma.user.findFirst({ where: { email: 'admin@inspexi-demo.nl' } });
  const demoUser = await prisma.user.findFirst({ where: { email: 'backoffice@inspexi-demo.nl' } });

  // Globale KB-categorieën (org_id = null) + artikelen
  const helpCategories = [
    { slug: 'aan-de-slag', name: 'Aan de slag', icon: 'rocket', order: 1, moduleKeys: ['dashboard', 'general'] },
    { slug: 'relaties', name: 'Relaties', icon: 'users', order: 2, moduleKeys: ['contacts'] },
    { slug: 'offertes', name: 'Offertes', icon: 'file-text', order: 3, moduleKeys: ['quotes'] },
    { slug: 'aanvragen', name: 'Aanvragen', icon: 'inbox', order: 4, moduleKeys: ['requests'] },
    { slug: 'planning', name: 'Planning', icon: 'calendar', order: 5, moduleKeys: ['planning'] },
    { slug: 'inspecties', name: 'Inspecties', icon: 'clipboard', order: 6, moduleKeys: ['inspections'] },
  ];

  for (const cat of helpCategories) {
    const category = await prisma.helpCategory.create({
      data: { orgId: null, slug: cat.slug, name: cat.name, icon: cat.icon, order: cat.order, isPublished: true },
    });

    // 2 voorbeeldartikelen per categorie
    for (let i = 1; i <= 2; i++) {
      await prisma.helpArticle.create({
        data: {
          orgId: null,
          categoryId: category.id,
          slug: `${cat.slug}-artikel-${i}`,
          title: `${cat.name}: voorbeeldartikel ${i}`,
          excerpt: `Korte uitleg over ${cat.name.toLowerCase()} (${i}).`,
          body: `# ${cat.name} ${i}\n\nDit is een voorbeeldartikel voor de knowledge base.\n\n1. Stap één\n2. Stap twee\n3. Stap drie`,
          status: 'PUBLISHED',
          publishedAt: new Date(),
          moduleKeys: cat.moduleKeys,
          tags: [cat.slug],
          order: i,
          authorId: superUser?.id ?? null,
        },
      });
    }
  }

  // Eén org-specifiek artikel (alleen zichtbaar voor de demo-org)
  if (demoOrg) {
    const offertesCat = await prisma.helpCategory.findFirst({ where: { orgId: null, slug: 'offertes' } });
    if (offertesCat) {
      await prisma.helpArticle.create({
        data: {
          orgId: demoOrg.id,
          categoryId: offertesCat.id,
          slug: 'interne-offerte-werkwijze',
          title: 'Interne werkwijze offertes (alleen InspeXi Demo)',
          excerpt: 'Org-specifieke afspraken rond offertes.',
          body: '# Interne werkwijze\n\nDit artikel is alleen zichtbaar binnen InspeXi Demo.',
          status: 'PUBLISHED',
          publishedAt: new Date(),
          moduleKeys: ['quotes'],
          tags: ['intern'],
          authorId: demoAdmin?.id ?? null,
        },
      });
    }
  }

  // Externe KB (klantportaal) — per-org, eigen externe categorieën.
  // Eén publieke categorie (zonder login zichtbaar) + één afgeschermde (na klant-login).
  if (demoOrg) {
    const externalCats = [
      {
        slug: 'veelgestelde-vragen',
        name: 'Veelgestelde vragen',
        icon: 'help-circle',
        order: 1,
        isPublic: true,
        articles: [
          {
            title: 'Hoe vraag ik een inspectie aan?',
            excerpt: 'De stappen om een nieuwe inspectie-aanvraag in te dienen.',
            body: '# Een inspectie aanvragen\n\n1. Log in op het klantportaal.\n2. Ga naar **Aanvragen** en klik op **Nieuwe aanvraag**.\n3. Vul de gegevens in en verstuur.\n\nWe nemen daarna contact met u op.',
          },
          {
            title: 'Wanneer ontvang ik mijn rapport?',
            excerpt: 'Wat u kunt verwachten na een uitgevoerde inspectie.',
            body: '# Uw inspectierapport\n\nNa afronding van de inspectie stellen wij het rapport op. Zodra het klaarstaat vindt u het onder **Documenten** in het klantportaal en ontvangt u een melding.',
          },
        ],
      },
      {
        slug: 'mijn-inspecties',
        name: 'Werken met uw inspecties',
        icon: 'clipboard',
        order: 2,
        isPublic: false,
        articles: [
          {
            title: 'Een constatering oplossen',
            excerpt: 'Hoe u een geconstateerd gebrek als opgelost markeert.',
            body: '# Constatering oplossen\n\nOpen de inspectie, ga naar de constatering en klik op **Oplossen**. U kunt een foto van de herstelde situatie toevoegen.',
          },
          {
            title: 'Een document ondertekenen',
            excerpt: 'Digitaal akkoord geven op een rapport of verklaring.',
            body: '# Document ondertekenen\n\nOnder **Documenten** ziet u welke stukken uw handtekening vereisen. Open het document en volg de stappen om digitaal te ondertekenen.',
          },
        ],
      },
    ];

    for (const cat of externalCats) {
      const category = await prisma.helpCategory.create({
        data: {
          orgId: demoOrg.id,
          slug: cat.slug,
          name: cat.name,
          icon: cat.icon,
          order: cat.order,
          isPublished: true,
          audience: 'EXTERNAL',
          isPublic: cat.isPublic,
        },
      });
      let i = 1;
      for (const art of cat.articles) {
        await prisma.helpArticle.create({
          data: {
            orgId: demoOrg.id,
            categoryId: category.id,
            slug: `${cat.slug}-${i}`,
            title: art.title,
            excerpt: art.excerpt,
            body: art.body,
            status: 'PUBLISHED',
            publishedAt: new Date(),
            audience: 'EXTERNAL',
            moduleKeys: [],
            tags: [cat.slug],
            order: i,
            authorId: demoAdmin?.id ?? null,
          },
        });
        i++;
      }
    }
  }

  // Demo-tickets op de demo-org (verschillende statussen)
  if (demoOrg && demoUser) {
    const demoTickets = [
      { n: 1, subject: 'Hoe maak ik een offerte op?', status: 'NIEUW', priority: 'NORMAAL', category: 'VRAAG' },
      { n: 2, subject: 'PDF-export lukt niet', status: 'IN_BEHANDELING', priority: 'HOOG', category: 'PROBLEEM' },
      { n: 3, subject: 'Verzoek: extra rapportveld', status: 'OPGELOST', priority: 'LAAG', category: 'FEATURE_REQUEST' },
    ] as const;

    for (const t of demoTickets) {
      await prisma.supportTicket.create({
        data: {
          orgId: demoOrg.id,
          ticketNumber: t.n,
          subject: t.subject,
          description: `Demo-ticket: ${t.subject}`,
          status: t.status,
          priority: t.priority,
          category: t.category,
          contextModule: 'quotes',
          createdById: demoUser.id,
          assignedToId: t.status === 'NIEUW' ? null : (superUser?.id ?? null),
          lastMessageAt: new Date(),
          resolvedAt: t.status === 'OPGELOST' ? new Date() : null,
          messages: {
            create: [
              { orgId: demoOrg.id, authorId: demoUser.id, authorType: 'USER', body: `Vraag: ${t.subject}` },
              ...(t.status !== 'NIEUW'
                ? [
                    {
                      orgId: demoOrg.id,
                      authorId: superUser?.id ?? null,
                      authorType: 'SUPPORT' as const,
                      body: 'Bedankt voor je melding, we kijken ernaar.',
                    },
                  ]
                : []),
            ],
          },
        },
      });
    }
  }

  // Support-toegang: demo-org staat AAN met een log-spoor
  if (demoOrg && demoAdmin) {
    await prisma.organization.update({
      where: { id: demoOrg.id },
      data: {
        supportAccessEnabled: true,
        supportAccessExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24u
      },
    });
    await prisma.supportAccessLog.create({
      data: {
        orgId: demoOrg.id,
        action: 'ENABLED',
        performedById: demoAdmin.id,
        performedByRole: 'ORG_ADMIN',
        ip: '127.0.0.1',
        note: 'Support-toegang geactiveerd (seed).',
      },
    });
  }
  console.log('  ✓ Help: 6 globale categorieën (12 artikelen) + 1 org-artikel, 3 tickets, support-toegang aan');

  // ─── Inspectiedomein (Fase 1) ──────────────────────────
  console.log('\n🔍 Seeding inspection domain...');

  // 1. Globale lookup-defaults (orgId null, isSystem)
  await seedLookups(prisma);
  console.log('  ✓ Inspection lookup defaults (11 sets)');

  // 2. Classificatiemodel (systeem) met kenmerken + opties
  const classModelNen = await prisma.classificationModel.create({
    data: {
      code: 'NEN1010_DEFAULT',
      name: 'NEN 1010 standaardclassificatie',
      description: 'Standaardclassificatie voor NEN 1010-inspecties',
      createdBy: superuser.id,
      characteristics: {
        create: [
          {
            code: 'SEVERITY',
            name: 'Ernst',
            sortOrder: 0,
            options: {
              create: [
                { code: 'C1', name: 'Gevaarlijk — direct herstellen', color: '#DC2626', sortOrder: 0 },
                { code: 'C2', name: 'Onveilig — herstel aanbevolen', color: '#D97706', sortOrder: 1 },
                { code: 'C3', name: 'Verbetering mogelijk', color: '#CA8A04', sortOrder: 2 },
                { code: 'FI', name: 'Nader onderzoek nodig', color: '#7C3AED', sortOrder: 3 },
              ],
            },
          },
        ],
      },
    },
  });

  const classModelScios = await prisma.classificationModel.create({
    data: {
      code: 'SCOPE8_DEFAULT',
      name: 'SCIOS Scope 8 classificatie',
      description: 'Standaardclassificatie voor SCIOS Scope 8-inspecties',
      createdBy: superuser.id,
      characteristics: {
        create: [
          {
            code: 'CATEGORY',
            name: 'Categorie',
            sortOrder: 0,
            options: {
              create: [
                { code: 'A', name: 'Categorie A — ernstig', color: '#DC2626', sortOrder: 0 },
                { code: 'B', name: 'Categorie B — matig', color: '#D97706', sortOrder: 1 },
                { code: 'C', name: 'Categorie C — gering', color: '#16A34A', sortOrder: 2 },
              ],
            },
          },
        ],
      },
    },
  });
  console.log('  ✓ Classification models (2)');

  // 3. Norm-type-definitions (systeem, globaal)
  const normDefs = [
    { code: 'NEN1010', label: 'NEN 1010', description: 'Veiligheidsbepalingen voor laagspanningsinstallaties', assetTypes: ['electrical_installation'], classificationModelId: classModelNen.id, sortOrder: 0 },
    { code: 'NEN3140', label: 'NEN 3140', description: 'Bedrijfsvoering van elektrische installaties — laagspanning', assetTypes: ['electrical_installation'], classificationModelId: classModelNen.id, sortOrder: 1 },
    { code: 'SCOPE_8', label: 'SCIOS Scope 8', description: 'Inspectie elektrisch materieel op brandrisico', assetTypes: ['electrical_installation'], classificationModelId: classModelScios.id, sortOrder: 2 },
    { code: 'SCOPE_10', label: 'SCIOS Scope 10', description: 'Inspectie zonnestroominstallaties', assetTypes: ['pv_installation'], classificationModelId: null, sortOrder: 3 },
    { code: 'IEC62446_1', label: 'IEC 62446-1', description: 'Inspectie en testen van PV-systemen', assetTypes: ['pv_installation'], classificationModelId: null, sortOrder: 4 },
    { code: 'SCOPE_12', label: 'SCIOS Scope 12', description: 'Inspectie zonnestroominstallaties — brandveiligheid', assetTypes: ['pv_installation'], classificationModelId: null, sortOrder: 5 },
  ];
  for (const n of normDefs) {
    await prisma.normTypeDefinition.create({ data: { ...n, createdBy: superuser.id } });
  }
  console.log('  ✓ Norm type definitions (6)');

  // 4. Asset- en locatietype-definitions (systeem) met velden
  await prisma.assetTypeDefinition.create({
    data: {
      code: 'electrical_installation',
      shortCode: 'EI', // [typecode] in de ASSET_NODE-nummering → bv. EI-0001
      name: 'Elektrische installatie',
      description: 'Laagspanningsinstallatie',
      icon: 'zap',
      color: '#2563EB',
      normTypes: ['NEN1010', 'NEN3140', 'SCOPE_8'],
      isSystem: true,
      sortOrder: 0,
      fields: {
        create: [
          { fieldKey: 'rated_current', label: 'Nominale stroom', fieldType: AssetFieldType.number, unit: 'A', sortOrder: 0 },
          { fieldKey: 'phases', label: 'Aantal fasen', fieldType: AssetFieldType.select, sortOrder: 1 },
        ],
      },
    },
  });
  await prisma.assetTypeDefinition.create({
    data: {
      code: 'pv_installation',
      shortCode: 'PV', // [typecode] in de ASSET_NODE-nummering → bv. PV-0001
      name: 'Zonnestroominstallatie',
      description: 'PV-installatie',
      icon: 'sun',
      color: '#CA8A04',
      normTypes: ['SCOPE_10', 'IEC62446_1', 'SCOPE_12'],
      isSystem: true,
      sortOrder: 1,
      fields: {
        create: [
          { fieldKey: 'peak_power', label: 'Piekvermogen', fieldType: AssetFieldType.number, unit: 'Wp', sortOrder: 0 },
        ],
      },
    },
  });
  await prisma.locationTypeDefinition.create({
    data: {
      code: 'distribution_room',
      shortCode: 'VR', // [typecode] beschikbaar als de LOCATION_NODE-nummering het gebruikt
      name: 'Verdeelruimte',
      description: 'Ruimte met verdeelinrichting',
      icon: 'door-open',
      color: '#0891B2',
      normTypes: ['NEN1010', 'NEN3140'],
      isSystem: true,
      sortOrder: 0,
      fields: {
        create: [
          { fieldKey: 'floor', label: 'Verdieping', fieldType: AssetFieldType.text, sortOrder: 0 },
        ],
      },
    },
  });
  console.log('  ✓ Asset/location type definitions (3)');

  // 5. Checklist (systeem) met items + links
  const checklistItemA = await prisma.checklistItem.create({
    data: { isSystem: true, code: 'NEN1010-001', question: 'Is de hoofdschakelaar correct geïnstalleerd en bereikbaar?', normReference: 'NEN 1010 art. 462', createdBy: superuser.id },
  });
  const checklistItemB = await prisma.checklistItem.create({
    data: { isSystem: true, code: 'NEN1010-002', question: 'Zijn alle aardverbindingen aanwezig en deugdelijk?', normReference: 'NEN 1010 art. 411', createdBy: superuser.id },
  });
  const checklistNen = await prisma.checklist.create({
    data: {
      isSystem: true,
      code: 'CL-NEN1010',
      name: 'NEN 1010 basis-inspectiechecklist',
      description: 'Standaardchecklist voor NEN 1010-eerstinspecties',
      normTypeCode: 'NEN1010',
      assetTypes: ['electrical_installation'],
      locationTypes: ['distribution_room'],
      status: ChecklistStatus.ACTIEF,
      publishedAt: new Date(),
      createdBy: superuser.id,
      itemLinks: {
        create: [
          { checklistItemId: checklistItemA.id, sortOrder: 0, isRequired: true },
          { checklistItemId: checklistItemB.id, sortOrder: 1, isRequired: true },
        ],
      },
    },
  });
  console.log('  ✓ Checklist + items (1 checklist, 2 items)');

  // 6. Meetstaat-template (globaal) met sectie + velden
  const measSheet = await prisma.measurementSheetTemplate.create({
    data: {
      code: 'MS-NEN1010-ISO',
      name: 'NEN 1010 isolatieweerstandmeting',
      description: 'Meetstaat voor isolatieweerstand- en doorgangsmetingen',
      normTypeCode: 'NEN1010',
      assetTypes: ['electrical_installation'],
      locationTypes: [],
      status: MeasurementSheetTemplateStatus.ACTIEF,
      publishedAt: new Date(),
      createdBy: superuser.id,
      sections: {
        create: [
          {
            code: 'isolation',
            name: 'Isolatieweerstand',
            sortOrder: 0,
            isRepeating: true,
            minRows: 1,
            fields: {
              create: [
                { code: 'group', name: 'Groep', fieldType: MeasurementSheetFieldType.TEXT, sortOrder: 0, isRequired: true },
                {
                  code: 'r_iso',
                  name: 'Isolatieweerstand',
                  fieldType: MeasurementSheetFieldType.NUMBER,
                  unit: 'MΩ',
                  decimals: 2,
                  sortOrder: 1,
                  isRequired: true,
                  passFailEnabled: true,
                  passFailOperator: PassFailOperator.GTE,
                  passFailValue: 1,
                  passFailFailMessage: 'Isolatieweerstand onder de minimumwaarde van 1 MΩ',
                },
              ],
            },
          },
        ],
      },
    },
  });
  console.log('  ✓ Measurement sheet template + section/fields (1)');

  // 6b. Voice base-prompt (Fase 7) — één actieve prompt zodat /voice/parse-measurement
  //     direct werkt zonder aparte configuratiestap (fallback blijft de geporte default).
  await prisma.voiceBasePrompt.create({
    data: {
      name: 'Standaard NL meet-prompt',
      content: DEFAULT_VOICE_BASE_PROMPT,
      isActive: true,
    },
  });
  console.log('  ✓ Voice base-prompt (1, actief)');

  // 7. Inspectie-template (verwijst naar classificatiemodel; links naar checklist + meetstaat)
  const inspTemplate = await prisma.inspectionTemplate.create({
    data: {
      isSystem: true,
      code: 'IT-NEN1010-INITIAL',
      name: 'NEN 1010 eerste inspectie',
      description: 'Inspectietemplate voor NEN 1010-eerstinspecties',
      normTypeCode: 'NEN1010',
      classificationModelId: classModelNen.id,
      status: TemplateStatus.ACTIEF,
      publishedAt: new Date(),
      createdBy: superuser.id,
      checklistLinks: {
        create: [{ checklistId: checklistNen.id, assetTypes: ['electrical_installation'], sortOrder: 0 }],
      },
      measurementSheetLinks: {
        create: [{ measurementSheetTemplateId: measSheet.id, assetTypes: ['electrical_installation'], sortOrder: 0 }],
      },
    },
  });
  console.log('  ✓ Inspection template (1)');

  // 7b. Document-template (PLAN) voor de demo-inspectietemplate — t.b.v. document-generatie (Fase 4)
  const planDocTemplate = await prisma.documentTemplate.create({
    data: {
      inspectionTemplateId: inspTemplate.id,
      documentType: DocumentType.PLAN,
      templateMode: TemplateMode.SECTIONS,
      pageSize: 'A4',
      orientation: 'portrait',
      headerHtml: '<div>{{organization.name}} — Inspectieplan</div>',
      footerHtml: '<div>Pagina {{pageNumber}} van {{totalPages}}</div>',
      sections: {
        create: [
          {
            code: 'projectgegevens',
            title: 'Projectgegevens',
            sectionType: SectionType.STATIC,
            sortOrder: 0,
            contentHtml: [
              '<table>',
              '<tr><th>Referentie</th><td>{{plan.reference}}</td></tr>',
              '<tr><th>Project</th><td>{{plan.projectName}}</td></tr>',
              '<tr><th>Norm</th><td>{{plan.normTypeName}}</td></tr>',
              '<tr><th>Opdrachtgever</th><td>{{client.name}}</td></tr>',
              '<tr><th>Locatie</th><td>{{location.address}}, {{location.city}}</td></tr>',
              '<tr><th>Inspecteur</th><td>{{inspector.name}}</td></tr>',
              '</table>',
            ].join('\n'),
          },
          {
            code: 'bevindingen',
            title: 'Bevindingen',
            sectionType: SectionType.STATIC,
            sortOrder: 1,
            contentHtml: [
              '<p>Totaal aantal bevindingen: {{findingsSummary.total}}</p>',
              '{{#each findings}}',
              '<div class="finding-item">',
              '<p><strong>{{this.shortDescription}}</strong> — <span class="classification-badge">{{this.classificationName}}</span></p>',
              '{{#if this.longDescription}}<p>{{this.longDescription}}</p>{{/if}}',
              '<p>Asset: {{this.assetName}}</p>',
              '</div>',
              '{{/each}}',
            ].join('\n'),
          },
          {
            code: 'meetmiddelen',
            title: 'Gebruikte meetmiddelen',
            sectionType: SectionType.STATIC,
            sortOrder: 2,
            contentHtml: [
              '{{#each measurementSheets}}',
              '{{#if this.usedInstruments.length}}',
              '<h3>{{this.name}}</h3>',
              '<table>',
              '<tr><th>Nummer</th><th>Merk</th><th>Type</th><th>Serienr.</th><th>Laatste kalibratie</th><th>Verloopt</th></tr>',
              '{{#each this.usedInstruments}}',
              '<tr><td>{{this.code}}</td><td>{{this.brand}}</td><td>{{this.type}}</td><td>{{this.serialNumber}}</td><td>{{formatDate this.lastCalibrationDate "DD-MM-YYYY"}}</td><td>{{formatDate this.nextCalibrationDue "DD-MM-YYYY"}}</td></tr>',
              '{{/each}}',
              '</table>',
              '{{/if}}',
              '{{/each}}',
            ].join('\n'),
          },
          {
            code: 'ondertekening',
            title: 'Ondertekening',
            sectionType: SectionType.SIGNATURE_BLOCK,
            sortOrder: 3,
          },
        ],
      },
    },
  });
  console.log('  ✓ Document template (PLAN) (1)');

  // 8. Demo-inspectieplan (org1, contact1, inspecteur) op de unified AssetNode-boom.
  // De hoofdlocatie (locationId) = CRM-Locatie "Kantoorpand Zuidas" = boom-wortel.
  const inspecteurId = createdOrg1Users[Role.INSPECTEUR];

  const demoPlan = await prisma.inspectionPlan.create({
    data: {
      orgId: org1.id,
      contactId: contact1.id,
      locationId: loc1Kantoor.id,
      projectName: 'NEN 1010 inspectie hoofdkantoor De Vries',
      description: 'Periodieke veiligheidsinspectie van de elektrische installatie',
      referenceNumber: 'INSP-2026-0001',
      normTypeCode: 'NEN1010',
      inspectionTypeCode: 'initial',
      statusCode: 'draft',
      inspectionTemplateId: inspTemplate.id,
      assignedTo: createdOrg1Users[Role.INSPECTEUR],
      addressStreet: 'Industrieweg',
      addressHouseNumber: '12',
      addressPostalCode: '1234 AB',
      addressCity: 'Amsterdam',
      plannedDate: new Date('2026-07-01'),
      createdBy: createdOrg1Users[Role.ORG_ADMIN],
    },
  });

  // PRD-12: koppel het demo-inspectieplan aan Fase 1 (project + fase consistent).
  await prisma.inspectionPlan.update({
    where: { id: demoPlan.id },
    data: { projectId: project1.id, projectPhaseId: phase1.id },
  });

  // AssetNode-boom: wortel-LOCATION (1:1 aan de CRM-Locatie) → deellocatie
  // "Verdieping 1" → 2 assets. path/depth worden door de DB-trigger gevuld, dus
  // parents vóór kinderen inserten.
  const rootNode = await prisma.assetNode.create({
    data: {
      orgId: org1.id,
      nodeType: 'LOCATION',
      rootLocationId: loc1Kantoor.id,
      typeCode: 'distribution_room',
      name: 'Hoofdkantoor',
      identifier: 'LOC-HK',
      createdBy: inspecteurId,
    },
  });
  const floorNode = await prisma.assetNode.create({
    data: {
      orgId: org1.id,
      nodeType: 'LOCATION',
      parentId: rootNode.id,
      typeCode: 'distribution_room',
      name: 'Verdieping 1',
      identifier: 'LOC-V1',
      createdBy: inspecteurId,
    },
  });

  const asset1 = await prisma.assetNode.create({
    data: {
      orgId: org1.id,
      nodeType: 'ASSET',
      parentId: floorNode.id,
      typeCode: 'electrical_installation',
      name: 'Hoofdverdeler HVK',
      identifier: 'HVK-01',
      statusCode: 'new',
      sortOrder: 0,
      createdBy: inspecteurId,
    },
  });
  const asset2 = await prisma.assetNode.create({
    data: {
      orgId: org1.id,
      nodeType: 'ASSET',
      parentId: floorNode.id,
      typeCode: 'electrical_installation',
      name: 'Onderverdeler kantoor',
      identifier: 'OVK-02',
      statusCode: 'new',
      sortOrder: 1,
      createdBy: inspecteurId,
    },
  });

  // Scope-deellocatie: "Verdieping 1" als (primaire) scope van het plan.
  await prisma.inspectionPlanLocation.create({
    data: {
      orgId: org1.id,
      inspectionPlanId: demoPlan.id,
      assetNodeId: floorNode.id,
      isPrimary: true,
    },
  });

  const finding1 = await prisma.finding.create({
    data: {
      orgId: org1.id,
      assetNodeId: asset1.id,
      inspectionPlanId: demoPlan.id,
      inspectionType: FindingInspectionType.visual,
      shortDescription: 'Ontbrekende afdekking op verdeelinrichting',
      longDescription: 'De afdekking van de hoofdverdeler ontbreekt, aanraakgevaar voor spanningvoerende delen.',
      normReference: 'NEN 1010 art. 412',
      statusCode: 'open',
    },
  });
  await prisma.finding.create({
    data: {
      orgId: org1.id,
      assetNodeId: asset2.id,
      inspectionPlanId: demoPlan.id,
      inspectionType: FindingInspectionType.measurement,
      shortDescription: 'Isolatieweerstand onder norm op groep 3',
      longDescription: 'Gemeten isolatieweerstand 0,3 MΩ, onder de minimumwaarde van 1 MΩ.',
      normReference: 'NEN 1010 art. 612',
      statusCode: 'open',
    },
  });
  console.log(
    '  ✓ Demo AssetNode-boom: hoofdlocatie → Verdieping 1 (scope) → 2 assets + 2 findings',
  );

  // Visuele inspectie op asset1 (completed). VisualInspection heeft GEEN createdBy-kolom.
  await prisma.visualInspection.create({
    data: {
      orgId: org1.id,
      assetNodeId: asset1.id,
      inspectionPlanId: demoPlan.id,
      status: InspectionExecStatus.completed,
      checklistResults: [
        { itemCode: 'cover-present', label: 'Afdekking aanwezig', result: 'fail' },
        { itemCode: 'labeling', label: 'Bekabeling gelabeld', result: 'pass' },
        { itemCode: 'earthing', label: 'Aarding aanwezig', result: 'pass' },
      ] as any,
      inspectorId: inspecteurId,
      startedAt: new Date('2026-06-15T10:30:00Z'),
      completedAt: new Date('2026-06-15T10:45:00Z'),
      deviceId: 'demo-device-001',
    },
  });

  // Standalone-meting geworteld op een LOCATION-node (Verdieping 1), gekoppeld aan asset1.
  await prisma.standaloneMeasurement.create({
    data: {
      orgId: org1.id,
      inspectionPlanId: demoPlan.id,
      locationNodeId: floorNode.id,
      measurementType: 'isolatieweerstand',
      description: 'Steekproef isolatieweerstand op verdieping 1',
      linkedAssetNodeId: asset1.id,
      createdBy: inspecteurId,
      deviceId: 'demo-device-001',
      values: {
        create: [
          { fieldName: 'R_iso', fieldType: 'number', value: '210', unit: 'MΩ', passFailCode: 'pass' },
          { fieldName: 'U_test', fieldType: 'number', value: '500', unit: 'V' },
          { fieldName: 'Opmerking', fieldType: 'text', value: 'Meting binnen norm' },
        ],
      },
    },
  });
  console.log('  ✓ Visuele inspectie (asset1) + standalone-meting (Verdieping 1 → asset1, 3 waarden)');

  // Plattegrond op de root-locatie: genereer een echte 800x600 PNG en schrijf 'm naar
  // de lokale storage (UPLOAD_DIR), zodat de afbeelding in het portal daadwerkelijk
  // rendert. Key-patroon = location-images.service: `${orgId}/${uuid}-${filename}`.
  // uploads/ is gitignored → niet gecommit; herseed genereert 'm opnieuw.
  const floorPlanFilename = 'plattegrond-demo.png';
  const floorPlanKey = `${org1.id}/${randomUUID()}-${floorPlanFilename}`;
  const floorPlanBytes = makeFloorPlanPng(800, 600);
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const floorPlanFullPath = path.join(uploadDir, floorPlanKey);
  fs.mkdirSync(path.dirname(floorPlanFullPath), { recursive: true });
  fs.writeFileSync(floorPlanFullPath, floorPlanBytes);

  const floorPlanImage = await prisma.locationImage.create({
    data: {
      orgId: org1.id,
      nodeId: rootNode.id,
      storagePath: floorPlanKey,
      originalFilename: floorPlanFilename,
      fileSize: floorPlanBytes.length,
      mimeType: 'image/png',
      width: 800,
      height: 600,
      createdBy: inspecteurId,
    },
  });

  // Markers op de plattegrond (positionX/Y = percentage 0-100). Twee assets + één
  // constatering, gekoppeld via FK. Kleur/icon laten we leeg → frontend kleurt o.b.v. lookups.
  await prisma.locationImageMarker.createMany({
    data: [
      {
        orgId: org1.id,
        locationImageId: floorPlanImage.id,
        positionX: 27,
        positionY: 30,
        markerType: MarkerType.ASSET,
        assetNodeId: asset1.id,
        label: 'Hoofdverdeler HVK',
        createdBy: inspecteurId,
      },
      {
        orgId: org1.id,
        locationImageId: floorPlanImage.id,
        positionX: 73,
        positionY: 64,
        markerType: MarkerType.ASSET,
        assetNodeId: asset2.id,
        label: 'Onderverdeler kantoor',
        createdBy: inspecteurId,
      },
      {
        orgId: org1.id,
        locationImageId: floorPlanImage.id,
        positionX: 34,
        positionY: 46,
        markerType: MarkerType.FINDING,
        findingId: finding1.id,
        label: 'Ontbrekende afdekking',
        createdBy: inspecteurId,
      },
    ],
  });
  console.log('  ✓ Plattegrond (LocationImage 800x600) + 3 markers (2 assets, 1 constatering)');

  // Meetstaat-records (snapshot van de measSheet-template). Eén geslaagde meting op
  // asset1 en één afgekeurde op asset2 (groep 3 < 1 MΩ → finalCheckPassed false),
  // passend bij de bestaande constatering "Isolatieweerstand onder norm op groep 3".
  const measSheetFull = await prisma.measurementSheetTemplate.findUnique({
    where: { id: measSheet.id },
    include: {
      sections: {
        include: { fields: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
  const measSnapshot = buildMeasurementSnapshot(measSheetFull!);

  await prisma.measurementSheetRecord.create({
    data: {
      orgId: org1.id,
      templateId: measSheet.id,
      assetNodeId: asset1.id,
      inspectionPlanId: demoPlan.id,
      templateVersion: measSheet.version,
      templateSnapshot: measSnapshot as any,
      status: MeasurementSheetRecordStatus.COMPLETED,
      data: {
        isolation: {
          '0': { group: { value: 'Hoofdgroep', passFail: null }, r_iso: { value: 250, passFail: 'pass' } },
          '1': { group: { value: 'Groep 1', passFail: null }, r_iso: { value: 180.5, passFail: 'pass' } },
        },
      } as any,
      finalCheckExecuted: true,
      finalCheckPassed: true,
      finalCheckResults: { passed: true, results: [] } as any,
      completedAt: new Date('2026-06-15T11:00:00Z'),
      createdBy: inspecteurId,
    },
  });

  await prisma.measurementSheetRecord.create({
    data: {
      orgId: org1.id,
      templateId: measSheet.id,
      assetNodeId: asset2.id,
      inspectionPlanId: demoPlan.id,
      templateVersion: measSheet.version,
      templateSnapshot: measSnapshot as any,
      status: MeasurementSheetRecordStatus.COMPLETED,
      data: {
        isolation: {
          '0': { group: { value: 'Groep 1', passFail: null }, r_iso: { value: 120, passFail: 'pass' } },
          '1': { group: { value: 'Groep 2', passFail: null }, r_iso: { value: 95.2, passFail: 'pass' } },
          '2': { group: { value: 'Groep 3', passFail: null }, r_iso: { value: 0.3, passFail: 'fail' } },
        },
      } as any,
      finalCheckExecuted: true,
      finalCheckPassed: false,
      finalCheckResults: {
        passed: false,
        results: [
          {
            ruleType: 'passFail',
            passed: false,
            message: 'Isolatieweerstand 0,30 MΩ ligt onder de norm (≥ 1 MΩ) op groep 3',
            details: { sectionCode: 'isolation', rowIndex: '2', fieldCode: 'r_iso' },
          },
        ],
      } as any,
      completedAt: new Date('2026-06-15T11:05:00Z'),
      createdBy: inspecteurId,
    },
  });
  console.log('  ✓ Meetstaat-records (2: asset1 geslaagd, asset2 afgekeurd op groep 3)');
  console.log('  → Demo-inspectie compleet: + 2 locaties, 1 plattegrond + 3 markers, 2 meetstaat-records, 1 visuele inspectie, 1 standalone-meting');

  // ─── Meetmiddelen + kalibraties (demo) ─────────────────
  // Drie meetmiddelen met afgeleide statussen: binnenkort verlopend, verlopen en geldig.
  // De afgeleide cache (lastCalibrationDate/nextCalibrationDue) wordt hier expliciet
  // gezet (de recompute draait normaal in de service, niet bij een rauwe prisma.create).
  console.log('\n📏 Seeding meetmiddelen + kalibraties...');
  const mmDay = 1000 * 60 * 60 * 24;
  const mmNow = Date.now();
  const mmAdminId = createdOrg1Users[Role.ORG_ADMIN];

  async function seedInstrument(opts: {
    code: string;
    brand: string;
    type: string;
    serialNumber: string;
    intervalMonths: number;
    assignedToUserId: string | null;
    calibrations: Array<{
      daysAgo: number;
      performedBy: string;
      certificateNumber?: string;
      withDocument?: boolean;
    }>;
  }) {
    const instrument = await prisma.measurementInstrument.create({
      data: {
        orgId: org1.id,
        code: opts.code,
        brand: opts.brand,
        type: opts.type,
        serialNumber: opts.serialNumber,
        calibrationIntervalMonths: opts.intervalMonths,
        assignedToUserId: opts.assignedToUserId,
        createdById: mmAdminId,
      },
    });

    let latest: Date | null = null;
    for (const c of opts.calibrations) {
      const calDate = new Date(mmNow - c.daysAgo * mmDay);
      if (!latest || calDate > latest) latest = calDate;

      let fileFields: Record<string, unknown> = {};
      if (c.withDocument) {
        const filename = `kalibratiecertificaat-${opts.code}.pdf`;
        const key = `${org1.id}/measurement-instruments/${instrument.id}/calibrations/${randomUUID()}-${filename}`;
        const bytes = makeCertificatePdf(
          `Kalibratiecertificaat ${opts.code} — ${opts.brand} ${opts.type}`,
        );
        const full = path.join(process.env.UPLOAD_DIR || './uploads', key);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, bytes);
        fileFields = {
          storageKey: key,
          fileName: filename,
          originalName: filename,
          mimeType: 'application/pdf',
          size: bytes.length,
        };
      }

      await prisma.calibration.create({
        data: {
          orgId: org1.id,
          instrumentId: instrument.id,
          calibrationDate: calDate,
          performedBy: c.performedBy,
          certificateNumber: c.certificateNumber ?? null,
          createdById: mmAdminId,
          ...fileFields,
        },
      });
    }

    await prisma.measurementInstrument.update({
      where: { id: instrument.id },
      data: {
        lastCalibrationDate: latest,
        nextCalibrationDue: latest ? addMonths(latest, opts.intervalMonths) : null,
      },
    });
    return instrument;
  }

  // BINNENKORT — laatste kalibratie ~340 dagen geleden, interval 12 mnd → verloopt over ~3-4 weken
  const mi1 = await seedInstrument({
    code: 'MM-001',
    brand: 'Fluke',
    type: '1587 FC',
    serialNumber: 'SN-FLK-1587-001',
    intervalMonths: 12,
    assignedToUserId: inspecteurId,
    calibrations: [
      { daysAgo: 400, performedBy: 'KalibratieLab BV', certificateNumber: 'CAL-2025-0412' },
      { daysAgo: 340, performedBy: 'KalibratieLab BV', certificateNumber: 'CAL-2025-0588', withDocument: true },
    ],
  });

  // VERLOPEN — laatste kalibratie ~395 dagen geleden, interval 12 mnd → ~1 maand verlopen
  const mi2 = await seedInstrument({
    code: 'MM-002',
    brand: 'Megger',
    type: 'MIT430/2',
    serialNumber: 'SN-MGR-430-002',
    intervalMonths: 12,
    assignedToUserId: null, // op voorraad
    calibrations: [
      { daysAgo: 395, performedBy: 'IJkmeester Nederland', certificateNumber: 'IJK-2025-1180', withDocument: true },
    ],
  });

  // GELDIG — recent gekalibreerd, interval 24 mnd
  const mi3 = await seedInstrument({
    code: 'MM-003',
    brand: 'Gossen Metrawatt',
    type: 'PROFITEST',
    serialNumber: 'SN-GMC-PT-003',
    intervalMonths: 24,
    assignedToUserId: inspecteurId,
    calibrations: [
      { daysAgo: 60, performedBy: 'KalibratieLab BV', certificateNumber: 'CAL-2026-0042', withDocument: true },
    ],
  });

  // Niveau 1 — globale standaard-meetmiddelen voor de demo-inspecteur
  await prisma.userDefaultInstrument.createMany({
    data: [
      { orgId: org1.id, userId: inspecteurId, instrumentId: mi1.id },
      { orgId: org1.id, userId: inspecteurId, instrumentId: mi3.id },
    ],
  });

  // Gebruikte meetmiddelen op het geslaagde demo-meetstaat-record (asset1)
  await prisma.measurementSheetRecord.updateMany({
    where: { assetNodeId: asset1.id, templateId: measSheet.id },
    data: { usedInstrumentIds: [mi1.id, mi3.id] },
  });

  console.log('  ✓ 3 meetmiddelen (binnenkort/verlopen/geldig) + kalibraties + 3 certificaten');
  console.log('  ✓ Niveau-1 standaard-meetmiddelen voor de demo-inspecteur + usedInstrumentIds op meetstaat');

  // ─── Client-portal demo (Fase 6) ───────────────────────
  // Onboarded demo-klant met een vaste, niet-gebruikte magic-link op het bestaande
  // demo-inspectieplan. Logt direct in (issueTokens) — geen wachtwoord, geen registratie —
  // omdat de ClientUser bestaat én ClientAccess heeft op het Contact van het plan.
  // Zie client-auth.service.ts → validateMagicLink. Alle records zijn additief en worden
  // door de bestaande deleteMany-volgorde bovenin (kinderen eerst) weer opgeruimd.
  console.log('\n👤 Seeding client-portal demo...');

  const orgAdminId = createdOrg1Users[Role.ORG_ADMIN];

  // 1. Geclassificeerde bevinding op het demo-plan (naast de 2 open bevindingen), zodat het
  //    ondertekenbare document ook een geclassificeerde bevinding toont (SEVERITY → C2).
  await prisma.finding.create({
    data: {
      orgId: org1.id,
      assetNodeId: asset1.id,
      inspectionPlanId: demoPlan.id,
      inspectionType: FindingInspectionType.visual,
      shortDescription: 'Beschadigde mantel op hoofdvoedingskabel',
      longDescription: 'De mantel van de hoofdvoedingskabel is plaatselijk beschadigd; de isolatie is zichtbaar aangetast.',
      classificationValues: { SEVERITY: 'C2' },
      normReference: 'NEN 1010 art. 526',
      statusCode: 'open',
      createdBy: createdOrg1Users[Role.INSPECTEUR],
    },
  });

  // 2. Gegenereerd document (PLAN) op het demo-plan — wacht op de klant-handtekening.
  //    De inspecteur heeft al getekend; de CLIENT-handtekening staat PENDING, zodat de klant
  //    via het portal kan ondertekenen (client-documents.service.ts → sign()).
  const demoDocHtml = [
    '<h1>Inspectieplan — NEN 1010</h1>',
    '<table>',
    `<tr><th>Referentie</th><td>${demoPlan.referenceNumber}</td></tr>`,
    `<tr><th>Project</th><td>${demoPlan.projectName}</td></tr>`,
    '<tr><th>Norm</th><td>NEN 1010</td></tr>',
    `<tr><th>Opdrachtgever</th><td>${contact1.companyName}</td></tr>`,
    `<tr><th>Locatie</th><td>${demoPlan.addressStreet} ${demoPlan.addressHouseNumber}, ${demoPlan.addressCity}</td></tr>`,
    '</table>',
    '<h2>Bevindingen</h2>',
    '<ul>',
    '<li>Ontbrekende afdekking op verdeelinrichting — <em>open</em></li>',
    '<li>Isolatieweerstand onder norm op groep 3 — <em>open</em></li>',
    '<li>Beschadigde mantel op hoofdvoedingskabel — <strong>C2 — Onveilig, herstel aanbevolen</strong></li>',
    '</ul>',
    '<h2>Ondertekening</h2>',
    '<p>Inspecteur: Tom Visser (getekend)</p>',
    '<p>Opdrachtgever: Demo Klant (in afwachting)</p>',
  ].join('\n');

  await prisma.generatedDocument.create({
    data: {
      orgId: org1.id,
      documentTemplateId: planDocTemplate.id,
      inspectionPlanId: demoPlan.id,
      documentType: DocumentType.PLAN,
      htmlContent: demoDocHtml,
      status: GeneratedDocumentStatus.PENDING_SIGNATURES,
      generatedBy: orgAdminId,
      signatures: {
        create: [
          {
            signerRoleCode: 'INSPECTOR',
            signerName: 'Tom Visser',
            signerFunction: 'Inspecteur',
            status: SignatureStatus.SIGNED,
            signedAt: new Date('2026-06-15T10:00:00Z'),
            signatureImage: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
          },
          {
            signerRoleCode: 'CLIENT',
            signerName: 'Demo Klant',
            signerFunction: 'Facilitair manager',
            status: SignatureStatus.PENDING,
          },
        ],
      },
    },
  });
  console.log('  ✓ Generated document (PLAN, PENDING_SIGNATURES) + 2 handtekeningen (inspecteur getekend, klant open)');

  // 3. Onboarded demo-klant (ClientUser). Login loopt via magic-link; passwordHash is fallback.
  const demoClient = await prisma.clientUser.create({
    data: {
      email: 'klant@inspexi-demo.nl',
      firstName: 'Demo',
      lastName: 'Klant',
      function: 'Facilitair manager',
      emailVerified: true,
      status: ClientUserStatus.ACTIVE,
      passwordHash: await bcrypt.hash('Password123!', 10),
    },
  });
  console.log(`  ✓ ClientUser: ${demoClient.email} (ACTIVE)`);

  // 4. ClientAccess → Contact van het plan: bepaalt de org-scope van de klant (subdomein-org).
  await prisma.clientAccess.create({
    data: {
      clientUserId: demoClient.id,
      contactId: contact1.id,
      role: ClientAccessRole.VIEWER,
      grantedBy: orgAdminId,
    },
  });

  // 5. Expliciete plan-toegang: bekijken én ondertekenen van het demo-plan.
  await prisma.inspectionClientAccess.create({
    data: {
      inspectionPlanId: demoPlan.id,
      clientUserId: demoClient.id,
      canView: true,
      canSign: true,
      invitedBy: orgAdminId,
    },
  });
  console.log(`  ✓ ClientAccess (VIEWER → ${contact1.companyName}) + InspectionClientAccess (canView/canSign)`);

  // 6. Vaste, niet-gebruikte magic-link → directe login ZONDER wachtwoord.
  //    Dit is een gevaarlijke gemaks-shortcut en wordt daarom ALLEEN aangemaakt
  //    achter de expliciete vlag SEED_DEMO=1 (zie .env.example). Standaard-seed
  //    laat 'm weg. Korte expiry (30 dagen) i.p.v. "ver in de toekomst".
  //    validateMagicLink markeert 'm bij eerste gebruik als usedAt; re-seed maakt 'm opnieuw.
  if (process.env.SEED_DEMO === '1') {
    await prisma.clientMagicLink.create({
      data: {
        clientUserId: demoClient.id,
        email: 'klant@inspexi-demo.nl',
        token: 'demo-klant-magic',
        inspectionPlanId: demoPlan.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        usedAt: null,
        createdBy: orgAdminId,
      },
    });
    console.log('  ✓ ClientMagicLink: token "demo-klant-magic" (SEED_DEMO=1, verloopt over 30 dagen)');
  } else {
    console.log('  ⏭️  ClientMagicLink "demo-klant-magic" overgeslagen (zet SEED_DEMO=1 om aan te maken)');
  }

  // ─── SaaS-varianten (PRD-09 §7.1) — testmatrix-orgs ─────────────────────
  // Drie extra orgs, los van de rijke demo-org, om de §7.3-testmatrix per
  // variant af te lopen: Basis blokkeert Compleet-functies, Compleet is overal
  // toegankelijk, en een per-org override schakelt één Compleet-functie bij.
  // Slugs zonder hyphens (regex ^[a-z0-9]+$).
  console.log('\n🧪 Seeding SaaS-variant-orgs (PRD-09 §7.1)...');
  const variantRefs = {
    passwordHash,
    inspTemplateId: inspTemplate.id,
    planDocTemplateId: planDocTemplate.id,
    crmLocationTypeId: crmLocationTypes.kantoor,
  };

  await seedVariantOrg(
    prisma,
    { name: 'InspeXi Basis', slug: 'inspexibasis', planId: basisPlan.id, emailDomain: 'inspexibasis.nl', magicToken: 'basis-klant-magic' },
    variantRefs,
  );
  await seedVariantOrg(
    prisma,
    { name: 'InspeXi Compleet', slug: 'inspexicompleet', planId: compleetPlan.id, emailDomain: 'inspexicompleet.nl', magicToken: 'compleet-klant-magic' },
    variantRefs,
  );

  // Mix-org: Basis-plan + per-org override WORKFLOW_COMPLEET=true → /documents
  // toegankelijk terwijl de overige Compleet-functies (offertes etc.) geblokkeerd
  // blijven. Test van "bijschakelen bovenop het plan".
  const mix = await seedVariantOrg(
    prisma,
    { name: 'InspeXi Mix', slug: 'inspeximix', planId: basisPlan.id, emailDomain: 'inspeximix.nl', magicToken: 'mix-klant-magic' },
    variantRefs,
  );
  await prisma.organizationFeature.create({
    data: {
      orgId: mix.org.id,
      featureKey: 'WORKFLOW_COMPLEET',
      enabled: true,
      updatedById: mix.admin.id,
    },
  });
  // Eén DMS-document zodat /documents bij de mix-org daadwerkelijk content toont.
  await prisma.document.create({
    data: {
      orgId: mix.org.id,
      entityType: DocumentEntityType.CONTACT,
      entityId: mix.contact.id,
      fileName: 'welkomstbrief.pdf',
      originalName: 'Welkomstbrief InspeXi Mix.pdf',
      mimeType: 'application/pdf',
      size: 8_192,
      storageKey: `${mix.org.id}/seed-welkomstbrief.pdf`,
      description: 'Demo-document (DMS) — zichtbaar dankzij de WORKFLOW_COMPLEET-override',
      uploadedById: mix.admin.id,
    },
  });
  console.log('  ✓ Mix-org override: WORKFLOW_COMPLEET=true (bijgeschakeld) + 1 DMS-document');

  // ─── Nummering: default schemes + numbers + counters-after-max ──────────
  await backfillNumbering(prisma);
  console.log('  ✓ Nummering: standaard-schemas, nummers en tellers geseed (per org, per model)');

  console.log('\n✅ Seed completed successfully!');
  console.log('\n📋 Login credentials (all use Password123!):');
  console.log('   superuser@inspexi.nl      → SUPERUSER');
  console.log('   admin@inspexi-demo.nl     → ORG_ADMIN (InspeXi Demo)');
  console.log('   manager@inspexi-demo.nl   → MANAGER (InspeXi Demo)');
  console.log('   backoffice@inspexi-demo.nl → BACKOFFICE (InspeXi Demo)');
  console.log('   admin@testbedrijf.nl      → ORG_ADMIN (Test Bedrijf)');
  console.log('\n🧪 SaaS-variant-orgs (PRD-09 §7.1, wachtwoord Password123!):');
  console.log('   admin@inspexibasis.nl     → ORG_ADMIN (InspeXi Basis — plan Basis)');
  console.log('   admin@inspexicompleet.nl  → ORG_ADMIN (InspeXi Compleet — plan Compleet)');
  console.log('   admin@inspeximix.nl       → ORG_ADMIN (InspeXi Mix — Basis + WORKFLOW_COMPLEET)');
  if (process.env.SEED_DEMO === '1') {
    console.log('\n🔗 Klant-portaal (client-portal) — directe login via magic-link (SEED_DEMO=1):');
    console.log('   http://inspexidemo.localhost:5174/magic/demo-klant-magic');
    console.log('   http://inspexibasis.localhost:5174/magic/basis-klant-magic');
    console.log('   http://inspexicompleet.localhost:5174/magic/compleet-klant-magic');
    console.log('   http://inspeximix.localhost:5174/magic/mix-klant-magic');
  } else {
    console.log('\n🔗 Klant-portaal magic-links overgeslagen (zet SEED_DEMO=1 om ze aan te maken).');
  }
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
