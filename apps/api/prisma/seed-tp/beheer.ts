/**
 * Testprogramma-seed — deel "beheer" (secties A t/m G + J van
 * `docs/testprogramma/01-seed-datasets.md`).
 *
 * Dekt: organisaties, gebruikers + beschikbaarheid, relaties/locaties,
 * producten & prijstabellen, aanvragen, offertes en projecten/planning.
 * Het inspectiedomein (secties H/I) zit in `inspectie.ts`.
 *
 * Uitgangspunten (zie ook shared.ts):
 * - Draait NAAST de hoofdseed en mag die data niet wissen → nooit een
 *   ongefilterde `deleteMany()`; opruimen alleen gescoped op een parent-id.
 * - Idempotent: `upsert` op natuurlijke unieke sleutels, anders
 *   "zoek → bijwerken of aanmaken" (`upsertBy` / `findOrCreate`).
 * - Alle door dit script aangemaakte records dragen de `TP `-prefix in hun naam,
 *   zodat ze in de portal herkenbaar zijn tussen de hoofdseed-data.
 */
import {
  PrismaClient,
  Role,
  ContactType,
  PriceType,
  RequestSource,
  RequestStatus,
  Priority,
  QuoteStatus,
  ApprovalStatus,
  ApprovalKind,
  PlanningStatus,
  SessionStatus,
  AcceptanceStatus,
  ProjectStatus,
  EmploymentType,
  AvailabilityExceptionType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

import {
  DIRTY,
  SLUGS,
  TODAY,
  TP_PASSWORD,
  daysFromToday,
  findOrCreate,
  step,
  type TpRefs,
} from './shared';

// ─── Generieke helpers ──────────────────────────────────────────────────────

/**
 * "Zoek → bijwerken, anders aanmaken" voor modellen zonder bruikbare unieke
 * sleutel. Aanvulling op `findOrCreate` uit shared.ts: die laat een bestaande rij
 * ongemoeid, hier wil je dat een her-run gewijzigde seedwaarden alsnog doorzet.
 */
async function upsertBy<T extends { id: string }>(
  find: () => Promise<T | null>,
  create: () => Promise<T>,
  update: (id: string) => Promise<T>,
): Promise<T> {
  const existing = await find();
  return existing ? update(existing.id) : create();
}

/** Afronden op 2 decimalen — identiek aan de offerte-service (Decimal(12,2)). */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Vlakke velden van een relatie; bewust smal getypt zodat hij in create én update past. */
interface ContactSeed {
  orgId: string;
  type: ContactType;
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  vatNumber?: string | null;
  cocNumber?: string | null;
  notes?: string | null;
  ownerId?: string | null;
  isDeleted?: boolean;
}

/** Relatie op (org + naam) zoeken en bijwerken, anders aanmaken. */
async function upsertContact(
  prisma: PrismaClient,
  match: { orgId: string; companyName?: string; firstName?: string; lastName?: string },
  data: ContactSeed,
): Promise<string> {
  const existing = await prisma.contact.findFirst({ where: match, select: { id: true } });
  if (existing) {
    await prisma.contact.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const created = await prisma.contact.create({ data, select: { id: true } });
  return created.id;
}

/** Vlakke velden van een locatie. */
interface LocationSeed {
  orgId: string;
  contactId: string;
  name: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  notes?: string | null;
}

/**
 * Locatie op (org + relatie + naam) zoeken en bijwerken, anders aanmaken.
 * NB: locaties worden door `inspectie.ts` als AssetNode-boomwortel gebruikt →
 * nooit verwijderen-en-opnieuw-aanmaken, anders breekt de `rootLocationId`-FK.
 */
async function upsertLocation(prisma: PrismaClient, data: LocationSeed): Promise<string> {
  const existing = await prisma.location.findFirst({
    where: { orgId: data.orgId, contactId: data.contactId, name: data.name },
    select: { id: true },
  });
  if (existing) {
    await prisma.location.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const created = await prisma.location.create({ data, select: { id: true } });
  return created.id;
}

/** Contactpersoon op (relatie + voor/achternaam) zoeken en bijwerken, anders aanmaken. */
async function upsertContactPerson(
  prisma: PrismaClient,
  data: {
    orgId: string;
    contactId: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
  },
): Promise<string> {
  const existing = await prisma.contactPerson.findFirst({
    where: {
      contactId: data.contactId,
      firstName: data.firstName,
      lastName: data.lastName,
    },
    select: { id: true },
  });
  if (existing) {
    await prisma.contactPerson.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const created = await prisma.contactPerson.create({ data, select: { id: true } });
  return created.id;
}

// ─── Offerte-rekenwerk ──────────────────────────────────────────────────────

interface TpQuoteLineSpec {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  discountPct?: number;
  productId?: string;
}

interface TpQuoteTotals {
  subtotal: number;
  discountTotal: number;
  vatTotal: number;
  total: number;
  lines: Array<TpQuoteLineSpec & { discountPct: number; lineTotal: number; sortOrder: number }>;
}

/**
 * Rekent de offertetotalen uit met exact dezelfde formule als
 * `QuotesService.replaceLines` (apps/api/src/modules/quotes/quotes.service.ts):
 *
 *   lineTotal     = round2(quantity × unitPrice × (1 − discountPct/100))
 *   fullPrice     = round2(quantity × unitPrice)
 *   subtotal      = Σ lineTotal
 *   vatTotal      = Σ round2(lineTotal × vatRate / 100)
 *   discountTotal = Σ round2(fullPrice − lineTotal)
 *   total         = round2(subtotal + vatTotal)
 *
 * Bewust hier herhaald (en niet geïmporteerd) zodat het testprogramma kan
 * vaststellen of API én portal met dezelfde formule rekenen — inclusief de
 * onzin-regels (negatieve prijs, korting > 100%, btw 250%) uit §F.
 */
function computeQuoteTotals(specs: TpQuoteLineSpec[]): TpQuoteTotals {
  let subtotal = 0;
  let vatTotal = 0;
  let discountTotal = 0;

  const lines = specs.map((spec, index) => {
    const discountPct = spec.discountPct ?? 0;
    const lineTotal = round2(spec.quantity * spec.unitPrice * (1 - discountPct / 100));
    const fullPrice = round2(spec.quantity * spec.unitPrice);
    subtotal += lineTotal;
    vatTotal += round2((lineTotal * spec.vatRate) / 100);
    discountTotal += round2(fullPrice - lineTotal);
    return { ...spec, discountPct, lineTotal, sortOrder: index };
  });

  return {
    lines,
    subtotal: round2(subtotal),
    discountTotal: round2(discountTotal),
    vatTotal: round2(vatTotal),
    total: round2(subtotal + vatTotal),
  };
}

/** Vlakke offertevelden die zowel bij create als update passen. */
interface QuoteSeed {
  status: QuoteStatus;
  subject: string;
  contactId: string;
  locationId?: string | null;
  requestId?: string | null;
  projectId?: string | null;
  validUntil?: Date | null;
  requiresApproval?: boolean;
  internalNotes?: string | null;
  publicToken?: string | null;
  sentAt?: Date | null;
  viewedAt?: Date | null;
  signedAt?: Date | null;
  clientName?: string | null;
}

/**
 * Offerte + regels idempotent wegschrijven. `[orgId, quoteNumber]` is uniek →
 * `upsert`; de regels worden gescoped op `quoteId` verwijderd en opnieuw gezet
 * (net als de service doet in `replaceLines`).
 */
async function upsertQuote(
  prisma: PrismaClient,
  orgId: string,
  createdBy: string,
  quoteNumber: string,
  seed: QuoteSeed,
  lineSpecs: TpQuoteLineSpec[],
): Promise<string> {
  const totals = computeQuoteTotals(lineSpecs);
  const money = {
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    vatTotal: totals.vatTotal,
    total: totals.total,
  };

  const quote = await prisma.quote.upsert({
    where: { orgId_quoteNumber: { orgId, quoteNumber } },
    update: { ...seed, ...money },
    create: { orgId, quoteNumber, createdBy, ...seed, ...money },
    select: { id: true },
  });

  await prisma.quoteLine.deleteMany({ where: { quoteId: quote.id } });
  if (totals.lines.length > 0) {
    await prisma.quoteLine.createMany({
      data: totals.lines.map((line) => ({
        quoteId: quote.id,
        productId: line.productId,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
        vatRate: line.vatRate,
        discountPct: line.discountPct,
        lineTotal: line.lineTotal,
        sortOrder: line.sortOrder,
      })),
    });
  }
  return quote.id;
}

// ─── Hoofdfunctie ───────────────────────────────────────────────────────────

/** Voornaam van exact 100 tekens (grensgeval weergave/afkapping in lijsten). */
const LONG_FIRST_NAME = 'Maximiliaan-Alexander-Bartholomeus-Christoffel-Ferdinand'
  .padEnd(100, 'x')
  .slice(0, 100);

/** Aanvraagtitel van 2000+ tekens (backend kent geen max → weergavetest). */
const LONG_REQUEST_TITLE = `TP ${'Lange titel voor de aanvraag. '.repeat(70)}`;

export async function seedBeheer(prisma: PrismaClient, refs: TpRefs): Promise<void> {
  const passwordHash = await bcrypt.hash(TP_PASSWORD, 10);

  // ─── A. Organisaties ──────────────────────────────────────────────────────
  step('A. Organisaties');

  const demoOrg = await prisma.organization.findUnique({ where: { slug: SLUGS.demo } });
  if (!demoOrg) {
    throw new Error(
      `Organisatie "${SLUGS.demo}" ontbreekt — draai eerst de hoofdseed (pnpm db:seed).`,
    );
  }
  const testOrg = await prisma.organization.findUnique({ where: { slug: SLUGS.test } });
  if (!testOrg) {
    throw new Error(
      `Organisatie "${SLUGS.test}" ontbreekt — draai eerst de hoofdseed (pnpm db:seed).`,
    );
  }

  // Plan "Compleet" hergebruiken; ontbreekt hij, dan blijft de org planloos
  // (alleen core-features) — geen reden om de seed te laten falen.
  const compleetPlan = await prisma.plan.findFirst({ where: { slug: 'compleet' } });

  // Unicode-org: naam met Latijn + Cyrillisch + CJK + emoji, slug net binnen de
  // regex ^[a-z0-9]+$. Test dat de orgnaam overal (sidebar, documenten, e-mail,
  // PDF) zonder mojibake of layout-breuk rendert.
  const randOrg = await prisma.organization.upsert({
    where: { slug: SLUGS.rand },
    update: {
      name: 'Råndбedrijf 试 🔧',
      planId: compleetPlan?.id ?? null,
      defaultVat: 21,
      defaultValidityDays: 30,
      primaryColor: '#7C3AED',
      isActive: true,
    },
    create: {
      name: 'Råndбedrijf 试 🔧',
      slug: SLUGS.rand,
      planId: compleetPlan?.id ?? null,
      defaultVat: 21,
      defaultValidityDays: 30,
      primaryColor: '#7C3AED',
    },
  });

  refs.orgs.demo = demoOrg.id;
  refs.orgs.test = testOrg.id;
  refs.orgs.rand = randOrg.id;
  step(`   ✓ orgs: ${SLUGS.demo} / ${SLUGS.test} / ${SLUGS.rand} (${randOrg.name})`);

  // ─── B. Gebruikers ────────────────────────────────────────────────────────
  step('B. Gebruikers + beschikbaarheid');

  /** Gebruiker op e-mail (uniek) upserten; wachtwoord altijd `Password123!`. */
  const upsertUser = async (data: {
    email: string;
    firstName: string;
    lastName: string;
    roles: Role[];
    orgId: string;
    employmentType?: EmploymentType | null;
  }): Promise<string> => {
    const user = await prisma.user.upsert({
      where: { email: data.email },
      update: {
        firstName: data.firstName,
        lastName: data.lastName,
        roles: data.roles,
        orgId: data.orgId,
        employmentType: data.employmentType ?? null,
        isActive: true,
        isDeleted: false,
      },
      create: {
        email: data.email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        roles: data.roles,
        orgId: data.orgId,
        employmentType: data.employmentType ?? null,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    return user.id;
  };

  // Bestaande hoofdseed-gebruikers ophalen (nodig als createdBy/owner/manager).
  const existingEmails = [
    'admin@inspexi-demo.nl',
    'manager@inspexi-demo.nl',
    'backoffice@inspexi-demo.nl',
    'werkvoorbereider@inspexi-demo.nl',
    'inspecteur@inspexi-demo.nl',
    'admin@testbedrijf.nl',
    'inspecteur@testbedrijf.nl',
    'superuser@inspexi.nl',
  ];
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: existingEmails } },
    select: { id: true, email: true },
  });
  const byEmail = new Map(existingUsers.map((u) => [u.email, u.id]));
  const requireUser = (email: string): string => {
    const id = byEmail.get(email);
    if (!id) throw new Error(`Gebruiker "${email}" ontbreekt — draai eerst de hoofdseed.`);
    return id;
  };

  refs.users.demoAdmin = requireUser('admin@inspexi-demo.nl');
  refs.users.demoManager = requireUser('manager@inspexi-demo.nl');
  refs.users.demoBackoffice = requireUser('backoffice@inspexi-demo.nl');
  refs.users.demoWerkvoorbereider = requireUser('werkvoorbereider@inspexi-demo.nl');
  refs.users.demoInspecteur = requireUser('inspecteur@inspexi-demo.nl');
  refs.users.testAdmin = requireUser('admin@testbedrijf.nl');
  refs.users.testInspecteur = requireUser('inspecteur@testbedrijf.nl');
  refs.users.superuser = requireUser('superuser@inspexi.nl');

  // Freelance-inspecteur zónder weekschema → moet standaard NIET beschikbaar zijn
  // (precedentie: alleen DIENSTVERBAND + geldig schema levert een baseline).
  refs.users.demoInspecteur2 = await upsertUser({
    email: 'inspecteur2@inspexi-demo.nl',
    firstName: 'Freek',
    lastName: 'Lansier',
    roles: [Role.INSPECTEUR],
    orgId: demoOrg.id,
    employmentType: EmploymentType.FREELANCE,
  });

  // Dubbelrol: MANAGER én INSPECTEUR (menu-, rechten- en filtertests).
  refs.users.demoMulti = await upsertUser({
    email: 'multi@inspexi-demo.nl',
    firstName: 'Mila',
    lastName: 'Dubbelrol',
    roles: [Role.MANAGER, Role.INSPECTEUR],
    orgId: demoOrg.id,
    employmentType: EmploymentType.DIENSTVERBAND,
  });

  refs.users.randAdmin = await upsertUser({
    email: 'admin@randorg.nl',
    firstName: 'Renske',
    lastName: 'Råndбедrijf',
    roles: [Role.ORG_ADMIN],
    orgId: randOrg.id,
  });

  // Voornaam van exact 100 tekens → afkapping/overflow in lijsten, avatar-initialen.
  refs.users.randLongName = await upsertUser({
    email: 'langenaam@randorg.nl',
    firstName: LONG_FIRST_NAME,
    lastName: 'van der Zeer-Uitgebreide-Achternaam',
    roles: [Role.BACKOFFICE],
    orgId: randOrg.id,
  });

  // Achternaam die op een HTML-tag lijkt → escaping in lijsten én documenten.
  refs.users.randXss = await upsertUser({
    email: 'xss@randorg.nl',
    firstName: 'Piet',
    lastName: '<b>Piet</b>',
    roles: [Role.WERKVOORBEREIDER],
    orgId: randOrg.id,
  });

  step('   ✓ 5 TP-gebruikers (freelance, dubbelrol, unicode-org, 100-teken-naam, HTML-naam)');

  // --- Beschikbaarheid: weekschema ma–vr 08:00–17:00 ---
  const tpTemplate = await prisma.availabilityTemplate.upsert({
    where: { orgId_name: { orgId: demoOrg.id, name: 'Testprogramma ma-vr 08-17' } },
    update: {
      description: 'Weekschema voor het testprogramma: maandag t/m vrijdag 08:00–17:00.',
      isActive: true,
      isDeleted: false,
    },
    create: {
      orgId: demoOrg.id,
      name: 'Testprogramma ma-vr 08-17',
      description: 'Weekschema voor het testprogramma: maandag t/m vrijdag 08:00–17:00.',
    },
    select: { id: true },
  });
  // Slots gescoped opnieuw zetten (geen unieke sleutel op slot-niveau).
  await prisma.availabilityTemplateSlot.deleteMany({ where: { templateId: tpTemplate.id } });
  await prisma.availabilityTemplateSlot.createMany({
    data: [1, 2, 3, 4, 5].map((weekday) => ({
      templateId: tpTemplate.id,
      weekday,
      startMinute: 480, // 08:00
      endMinute: 1020, // 17:00
    })),
  });

  // Alleen koppelen als de inspecteur nog géén lopende toewijzing heeft — de
  // hoofdseed (PRD-12) zet er normaal al één ("Standaard"); die niet overschrijven.
  const activeAssignment = await prisma.userScheduleAssignment.findFirst({
    where: {
      userId: refs.users.demoInspecteur,
      OR: [{ validUntil: null }, { validUntil: { gte: TODAY } }],
    },
    select: { id: true },
  });
  if (activeAssignment) {
    step('   · bestaand weekschema van inspecteur@inspexi-demo.nl behouden (PRD-12-seed)');
  } else {
    await prisma.userScheduleAssignment.create({
      data: {
        orgId: demoOrg.id,
        userId: refs.users.demoInspecteur,
        templateId: tpTemplate.id,
        validFrom: new Date('2026-01-01T00:00:00Z'),
        createdById: refs.users.demoAdmin,
      },
    });
    await prisma.user.update({
      where: { id: refs.users.demoInspecteur },
      data: { employmentType: EmploymentType.DIENSTVERBAND },
    });
    step('   ✓ weekschema "Testprogramma ma-vr 08-17" gekoppeld aan inspecteur@inspexi-demo.nl');
  }

  // Hele dag GEBLOKKEERD op 2026-08-12 → planning-assign moet hier 409 + warnings
  // geven (testgeval BO-35). Expliciete Z-tijden: de resolutie rekent in UTC.
  const blockStartsAt = new Date('2026-08-12T00:00:00Z');
  const blockEndsAt = new Date('2026-08-12T23:59:59Z');
  await upsertBy(
    () =>
      prisma.availabilityException.findFirst({
        // Bewust ZONDER `isDeleted`-filter: een in de UI weggeklikte uitzondering
        // wordt hersteld i.p.v. gedupliceerd, zodat BO-35 na een her-seed werkt.
        where: {
          orgId: demoOrg.id,
          userId: refs.users.demoInspecteur,
          startsAt: blockStartsAt,
        },
        select: { id: true },
      }),
    () =>
      prisma.availabilityException.create({
        data: {
          orgId: demoOrg.id,
          userId: refs.users.demoInspecteur,
          type: AvailabilityExceptionType.GEBLOKKEERD,
          startsAt: blockStartsAt,
          endsAt: blockEndsAt,
          allDay: true,
          reason: 'Testprogramma — geblokkeerd',
          createdById: refs.users.demoAdmin,
        },
        select: { id: true },
      }),
    (id) =>
      prisma.availabilityException.update({
        where: { id },
        data: {
          type: AvailabilityExceptionType.GEBLOKKEERD,
          endsAt: blockEndsAt,
          allDay: true,
          isRecurring: false,
          reason: 'Testprogramma — geblokkeerd',
          isDeleted: false,
        },
        select: { id: true },
      }),
  );
  step('   ✓ GEBLOKKEERD-uitzondering 2026-08-12 (hele dag) voor inspecteur@inspexi-demo.nl');

  // ─── C. Relaties, adressen, contactpersonen, locaties ─────────────────────
  step('C. Relaties + locaties');

  // C1. Netjes bedrijf: alle velden gevuld, primair adres, 2 contactpersonen.
  refs.contacts.net = await upsertContact(
    prisma,
    { orgId: demoOrg.id, companyName: 'TP Netjes Bouw BV' },
    {
      orgId: demoOrg.id,
      type: ContactType.COMPANY,
      companyName: 'TP Netjes Bouw BV',
      email: 'info@tp-netjesbouw.nl',
      phone: '+31 20 555 0101',
      vatNumber: 'NL812345678B01',
      cocNumber: '34567890',
      notes: 'Volledig gevulde referentierelatie voor het testprogramma.',
      ownerId: refs.users.demoManager,
    },
  );
  await prisma.contactAddress.deleteMany({ where: { contactId: refs.contacts.net } });
  await prisma.contactAddress.create({
    data: {
      contactId: refs.contacts.net,
      label: 'Hoofdvestiging',
      street: 'Damrak',
      houseNumber: '70',
      postalCode: '1012AB',
      city: 'Amsterdam',
      country: 'NL',
      isPrimary: true,
      isInvoice: true,
    },
  });
  await upsertContactPerson(prisma, {
    orgId: demoOrg.id,
    contactId: refs.contacts.net,
    firstName: 'Sanne',
    lastName: 'Bakker',
    email: 'sanne@tp-netjesbouw.nl',
    phone: '+31 6 1111 1111',
  });
  await upsertContactPerson(prisma, {
    orgId: demoOrg.id,
    contactId: refs.contacts.net,
    firstName: 'Joris',
    lastName: 'Veenstra',
    email: 'joris@tp-netjesbouw.nl',
    phone: '+31 6 2222 2222',
  });

  // C2. Particulier zonder e-mail/telefoon → test de `—`-fallbacks en het
  // versturen van een offerte naar een relatie zonder e-mailadres.
  refs.contacts.particulier = await upsertContact(
    prisma,
    { orgId: demoOrg.id, firstName: 'TP Wilhelmina', lastName: 'Zonder-Email' },
    {
      orgId: demoOrg.id,
      type: ContactType.INDIVIDUAL,
      firstName: 'TP Wilhelmina',
      lastName: 'Zonder-Email',
      email: null,
      phone: null,
    },
  );

  // C3. Bedrijfsnaam van 220+ tekens.
  // Let op: `ContactAddress.postalCode` is NOT NULL zonder default → een "adres
  // zonder postcode" kan alleen als LEGE STRING. Dat wordt hier bewust gedaan:
  // de DB accepteert het, dus het testprogramma kan vaststellen hoe de portal
  // en de gegenereerde documenten met een lege postcode omgaan.
  const langeNaam = `TP ${DIRTY.longName}`;
  refs.contacts.langeNaam = await upsertContact(
    prisma,
    { orgId: demoOrg.id, companyName: langeNaam },
    {
      orgId: demoOrg.id,
      type: ContactType.COMPANY,
      companyName: langeNaam,
      email: 'info@tp-langenaam.nl',
    },
  );
  await prisma.contactAddress.deleteMany({ where: { contactId: refs.contacts.langeNaam } });
  await prisma.contactAddress.create({
    data: {
      contactId: refs.contacts.langeNaam,
      label: 'Vestiging zonder postcode',
      street: 'Onbekende Laan',
      houseNumber: '1',
      postalCode: '', // bewust leeg — kolom is NOT NULL, null kan niet
      city: 'Nergenshuizen',
      country: 'NL',
      isPrimary: true,
    },
  });

  // C4. Unicode-relatie met een Britse "postcode" → backend dwingt geen NL-regex af.
  const unicodeNaam = `TP ${DIRTY.mixed}`;
  refs.contacts.unicode = await upsertContact(
    prisma,
    { orgId: demoOrg.id, companyName: unicodeNaam },
    {
      orgId: demoOrg.id,
      type: ContactType.COMPANY,
      companyName: unicodeNaam,
      email: 'hello@tp-unicode.co.uk',
      phone: '+44 20 7946 0000',
      notes: `${DIRTY.rtl} ${DIRTY.cjk} ${DIRTY.emoji} ${DIRTY.zeroWidth}`,
    },
  );
  await prisma.contactAddress.deleteMany({ where: { contactId: refs.contacts.unicode } });
  await prisma.contactAddress.create({
    data: {
      contactId: refs.contacts.unicode,
      label: 'London office',
      street: 'Downing Street',
      houseNumber: '10',
      postalCode: 'SW1A 1AA',
      city: 'London',
      country: 'GB',
      isPrimary: true,
    },
  });

  // C5. Injectie-achtige relatie → escaping in overzicht, detail én documenten.
  const injectieNaam = `TP ${DIRTY.sqlContact}`;
  refs.contacts.injectie = await upsertContact(
    prisma,
    { orgId: demoOrg.id, companyName: injectieNaam },
    {
      orgId: demoOrg.id,
      type: ContactType.COMPANY,
      companyName: injectieNaam,
      email: 'robert@tp-injectie.nl',
      notes: `${DIRTY.script} ${DIRTY.imgOnerror}`,
    },
  );

  // C6. Relatie in een klantgroep met gekoppelde staffelprijstabel (zie §D).
  refs.contacts.groep = await upsertContact(
    prisma,
    { orgId: demoOrg.id, companyName: 'TP VIP Installaties BV' },
    {
      orgId: demoOrg.id,
      type: ContactType.COMPANY,
      companyName: 'TP VIP Installaties BV',
      email: 'inkoop@tp-vip.nl',
      phone: '+31 30 555 0202',
      cocNumber: '11223344',
    },
  );
  const vipGroup = await findOrCreate(
    () =>
      prisma.customerGroup.findFirst({
        where: { orgId: demoOrg.id, name: 'TP VIP-groep' },
        select: { id: true },
      }),
    () =>
      prisma.customerGroup.create({
        data: {
          orgId: demoOrg.id,
          name: 'TP VIP-groep',
          notes: 'Klantgroep met gekoppelde staffelprijstabel.',
        },
        select: { id: true },
      }),
  );
  await prisma.contactCustomerGroup.upsert({
    where: {
      contactId_customerGroupId: {
        contactId: refs.contacts.groep,
        customerGroupId: vipGroup.id,
      },
    },
    update: {},
    create: { contactId: refs.contacts.groep, customerGroupId: vipGroup.id },
  });

  // Tegenpartij-relaties in de andere orgs (cross-tenant isolatietests).
  refs.contacts.test = await upsertContact(
    prisma,
    { orgId: testOrg.id, companyName: 'TP Cross-tenant Test BV' },
    {
      orgId: testOrg.id,
      type: ContactType.COMPANY,
      companyName: 'TP Cross-tenant Test BV',
      email: 'info@tp-crosstenant.nl',
    },
  );
  refs.contacts.rand = await upsertContact(
    prisma,
    { orgId: randOrg.id, companyName: `TP Råndklant ${DIRTY.cjk}` },
    {
      orgId: randOrg.id,
      type: ContactType.COMPANY,
      companyName: `TP Råndklant ${DIRTY.cjk}`,
      email: 'info@tp-randklant.nl',
    },
  );

  // Locaties — elke relatie krijgt er één; ze dienen als AssetNode-boomwortel
  // voor het inspectiedomein (`inspectie.ts`).
  refs.locations.net = await upsertLocation(prisma, {
    orgId: demoOrg.id,
    contactId: refs.contacts.net,
    name: 'TP Kantoorpand Damrak',
    street: 'Damrak',
    houseNumber: '70',
    postalCode: '1012AB',
    city: 'Amsterdam',
  });
  refs.locations.particulier = await upsertLocation(prisma, {
    orgId: demoOrg.id,
    contactId: refs.contacts.particulier,
    name: 'TP Woning Zonder-Email',
    street: 'Dorpsstraat',
    houseNumber: '3a',
    postalCode: '3512JE',
    city: 'Utrecht',
  });
  refs.locations.langeNaam = await upsertLocation(prisma, {
    orgId: demoOrg.id,
    contactId: refs.contacts.langeNaam,
    name: 'TP Locatie lange naam',
    street: 'Onbekende Laan',
    houseNumber: '1',
    postalCode: '0000XX', // Location.postalCode ook NOT NULL; placeholder i.p.v. leeg
    city: 'Nergenshuizen',
  });
  refs.locations.unicode = await upsertLocation(prisma, {
    orgId: demoOrg.id,
    contactId: refs.contacts.unicode,
    name: `TP Locatie ${DIRTY.mixed}`,
    street: 'Downing Street',
    houseNumber: '10',
    postalCode: 'SW1A 1AA',
    city: 'London',
  });
  refs.locations.injectie = await upsertLocation(prisma, {
    orgId: demoOrg.id,
    contactId: refs.contacts.injectie,
    name: `TP Locatie ${DIRTY.script}`,
    street: 'Robertstraat',
    houseNumber: '1',
    postalCode: '5611AB',
    city: 'Eindhoven',
  });
  refs.locations.groep = await upsertLocation(prisma, {
    orgId: demoOrg.id,
    contactId: refs.contacts.groep,
    name: 'TP Werkplaats VIP',
    street: 'Industrieweg',
    houseNumber: '12',
    postalCode: '3542AD',
    city: 'Utrecht',
  });
  refs.locations.test = await upsertLocation(prisma, {
    orgId: testOrg.id,
    contactId: refs.contacts.test,
    name: 'TP Locatie Testbedrijf',
    street: 'Testlaan',
    houseNumber: '2',
    postalCode: '2511CV',
    city: 'Den Haag',
  });
  refs.locations.rand = await upsertLocation(prisma, {
    orgId: randOrg.id,
    contactId: refs.contacts.rand,
    name: `TP Locatie ${DIRTY.emoji}`,
    street: 'Råndweg',
    houseNumber: '9',
    postalCode: '9711LM',
    city: 'Groningen',
  });

  step('   ✓ 8 relaties (6 demo + 1 test + 1 rand), 4 adressen, 2 contactpersonen, 8 locaties');

  // ─── D. Producten & prijstabellen ─────────────────────────────────────────
  step('D. Producten + prijstabellen');

  /** Product upserten op `[orgId, productCode]` (uniek per org). */
  const upsertProduct = async (data: {
    productCode: string;
    name: string;
    unit: string;
    defaultVat: number;
    description?: string | null;
  }): Promise<string> => {
    const product = await prisma.product.upsert({
      where: { orgId_productCode: { orgId: demoOrg.id, productCode: data.productCode } },
      update: {
        name: data.name,
        unit: data.unit,
        defaultVat: data.defaultVat,
        description: data.description ?? null,
        isActive: true,
      },
      create: {
        orgId: demoOrg.id,
        productCode: data.productCode,
        name: data.name,
        unit: data.unit,
        defaultVat: data.defaultVat,
        description: data.description ?? null,
      },
      select: { id: true },
    });
    return product.id;
  };

  refs.products.fixed = await upsertProduct({
    productCode: 'TP-PROD-FIXED',
    name: 'TP Inspectie-uur (vast tarief)',
    unit: 'uur',
    defaultVat: 21,
    description: 'Standaardproduct met een vaste prijs in de prijstabel.',
  });
  refs.products.tiered = await upsertProduct({
    productCode: 'TP-PROD-TIERED',
    name: 'TP Meetpunt (staffel)',
    unit: 'stuks',
    defaultVat: 21,
    description: 'Product met een staffelprijs van 3 tiers (1-9 / 10-49 / 50+).',
  });
  refs.products.nul = await upsertProduct({
    productCode: 'TP-PROD-NUL',
    name: 'TP Gratis intake',
    unit: 'stuks',
    defaultVat: 21,
    description: 'Prijs 0,00 — test bedragweergave van een nulbedrag.',
  });
  refs.products.max = await upsertProduct({
    productCode: 'TP-PROD-MAX',
    name: 'TP Totaalproject (maximumbedrag)',
    unit: 'stuks',
    defaultVat: 21,
    description: 'Prijs 9.999.999,99 — grens van Decimal(12,2) in de weergave.',
  });
  refs.products.btw0 = await upsertProduct({
    productCode: 'TP-PROD-BTW0',
    name: 'TP Werk in het buitenland (btw verlegd)',
    unit: 'stuks',
    defaultVat: 0,
    description: 'Btw-tarief 0% — test btw-berekening in offertetotalen.',
  });
  refs.products.btw9 = await upsertProduct({
    productCode: 'TP-PROD-BTW9',
    name: 'TP Onderhoudsabonnement (9% btw)',
    unit: 'maand',
    defaultVat: 9,
    description: 'Btw-tarief 9% — test btw-berekening in offertetotalen.',
  });
  // §J: vuile data ook in een product-omschrijving.
  refs.products.btw21 = await upsertProduct({
    productCode: 'TP-PROD-BTW21',
    name: 'TP Advies op locatie (21% btw)',
    unit: 'uur',
    defaultVat: 21,
    description: `${DIRTY.script} ${DIRTY.imgOnerror} ${DIRTY.emoji} ${DIRTY.cjk} — ${DIRTY.sqlDrop}`,
  });

  const vipTable = await findOrCreate(
    () =>
      prisma.priceTable.findFirst({
        where: { orgId: demoOrg.id, name: 'TP VIP-prijstabel' },
        select: { id: true },
      }),
    () =>
      prisma.priceTable.create({
        data: {
          orgId: demoOrg.id,
          name: 'TP VIP-prijstabel',
          description: 'Prijstabel van het testprogramma: vaste prijzen + één staffel.',
          isDefault: false,
        },
        select: { id: true },
      }),
  );
  refs.priceTables.vip = vipTable.id;

  // Items + tiers gescoped opnieuw opbouwen. PriceTier heeft geen cascade →
  // eerst de tiers van deze tabel weg, dan de items.
  const existingItems = await prisma.priceTableItem.findMany({
    where: { priceTableId: vipTable.id },
    select: { id: true },
  });
  if (existingItems.length > 0) {
    await prisma.priceTier.deleteMany({
      where: { priceTableItemId: { in: existingItems.map((i) => i.id) } },
    });
    await prisma.priceTableItem.deleteMany({ where: { priceTableId: vipTable.id } });
  }

  const fixedPrices: Array<[string, number]> = [
    [refs.products.fixed, 85.0],
    [refs.products.nul, 0.0], // grensgeval: gratis
    [refs.products.max, 9999999.99], // grensgeval: maximumbedrag
    [refs.products.btw0, 100.0],
    [refs.products.btw9, 49.95],
    [refs.products.btw21, 95.0],
  ];
  for (const [productId, basePrice] of fixedPrices) {
    await prisma.priceTableItem.create({
      data: { priceTableId: vipTable.id, productId, priceType: PriceType.FIXED, basePrice },
    });
  }
  await prisma.priceTableItem.create({
    data: {
      priceTableId: vipTable.id,
      productId: refs.products.tiered,
      priceType: PriceType.TIERED,
      tiers: {
        create: [
          { fromQty: 1, toQty: 9, price: 12.5 },
          { fromQty: 10, toQty: 49, price: 10.0 },
          { fromQty: 50, price: 7.5 }, // open bovengrens
        ],
      },
    },
  });

  await prisma.contactPriceTable.upsert({
    where: {
      contactId_priceTableId: {
        contactId: refs.contacts.groep,
        priceTableId: vipTable.id,
      },
    },
    update: {},
    create: { contactId: refs.contacts.groep, priceTableId: vipTable.id },
  });

  step('   ✓ 7 producten (btw 0/9/21, prijs 0,00 en 9.999.999,99) + prijstabel met 3-tier staffel');

  // ─── E. Aanvragen ─────────────────────────────────────────────────────────
  step('E. Aanvragen');

  const lostReason = await prisma.lostReason.findFirst({
    where: { code: 'TE_DUUR' },
    select: { id: true },
  });

  /** Aanvraag + statushistorie idempotent wegschrijven (`[orgId, requestNumber]` uniek). */
  const upsertRequest = async (
    requestNumber: string,
    data: {
      contactId: string;
      locationId?: string | null;
      source: RequestSource;
      status: RequestStatus;
      title: string;
      description?: string | null;
      priority?: Priority;
      assignedTo?: string | null;
      lostReasonId?: string | null;
      lostNote?: string | null;
    },
    history: Array<{ fromStatus: RequestStatus | null; toStatus: RequestStatus; note?: string }>,
  ): Promise<string> => {
    const request = await prisma.request.upsert({
      where: { orgId_requestNumber: { orgId: demoOrg.id, requestNumber } },
      update: { ...data, isDeleted: false },
      create: {
        orgId: demoOrg.id,
        requestNumber,
        createdBy: refs.users.demoBackoffice,
        ...data,
      },
      select: { id: true },
    });
    await prisma.requestStatusHistory.deleteMany({ where: { requestId: request.id } });
    await prisma.requestStatusHistory.createMany({
      data: history.map((h, index) => ({
        requestId: request.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        changedBy: refs.users.demoBackoffice,
        changedAt: daysFromToday(-30 + index),
        note: h.note,
      })),
    });
    return request.id;
  };

  refs.requests.nieuw = await upsertRequest(
    'TP-AV-001',
    {
      contactId: refs.contacts.net,
      locationId: refs.locations.net,
      source: RequestSource.MANUAL,
      status: RequestStatus.NIEUW,
      // §J: emoji + CJK in een aanvraagtitel.
      title: `TP Nieuwe aanvraag ${DIRTY.emoji} ${DIRTY.cjk}`,
      description: 'Handmatig ingevoerde aanvraag; status NIEUW.',
      priority: Priority.NORMAL,
    },
    [{ fromStatus: null, toStatus: RequestStatus.NIEUW }],
  );

  refs.requests.inBehandeling = await upsertRequest(
    'TP-AV-002',
    {
      contactId: refs.contacts.groep,
      locationId: refs.locations.groep,
      source: RequestSource.WEB_FORM,
      status: RequestStatus.IN_BEHANDELING,
      title: 'TP Aanvraag via webformulier',
      description: 'Binnengekomen via het publieke webformulier.',
      priority: Priority.HIGH,
      assignedTo: refs.users.demoManager,
    },
    [
      { fromStatus: null, toStatus: RequestStatus.NIEUW },
      { fromStatus: RequestStatus.NIEUW, toStatus: RequestStatus.IN_BEHANDELING, note: 'Opgepakt' },
    ],
  );

  refs.requests.offerteGemaakt = await upsertRequest(
    'TP-AV-003',
    {
      contactId: refs.contacts.net,
      locationId: refs.locations.net,
      source: RequestSource.EMAIL,
      status: RequestStatus.OFFERTE_GEMAAKT,
      title: 'TP Aanvraag per e-mail — offerte opgesteld',
      description: 'Aanvraag per e-mail; er is inmiddels een offerte gemaakt.',
      assignedTo: refs.users.demoBackoffice,
    },
    [
      { fromStatus: null, toStatus: RequestStatus.NIEUW },
      { fromStatus: RequestStatus.NIEUW, toStatus: RequestStatus.IN_BEHANDELING },
      { fromStatus: RequestStatus.IN_BEHANDELING, toStatus: RequestStatus.OFFERTE_GEMAAKT },
    ],
  );

  refs.requests.gewonnen = await upsertRequest(
    'TP-AV-004',
    {
      contactId: refs.contacts.groep,
      locationId: refs.locations.groep,
      source: RequestSource.PHONE,
      status: RequestStatus.GEWONNEN,
      title: 'TP Telefonische aanvraag — gewonnen',
      description: 'Telefonisch binnengekomen en gewonnen.',
      priority: Priority.HIGH,
    },
    [
      { fromStatus: null, toStatus: RequestStatus.NIEUW },
      { fromStatus: RequestStatus.NIEUW, toStatus: RequestStatus.OFFERTE_GEMAAKT },
      { fromStatus: RequestStatus.OFFERTE_GEMAAKT, toStatus: RequestStatus.GEWONNEN },
    ],
  );

  refs.requests.verloren = await upsertRequest(
    'TP-AV-005',
    {
      contactId: refs.contacts.unicode,
      locationId: refs.locations.unicode,
      source: RequestSource.MANUAL,
      status: RequestStatus.VERLOREN,
      title: 'TP Verloren aanvraag (met reden)',
      description: 'Klant koos voor een concurrent.',
      lostReasonId: lostReason?.id ?? null,
      lostNote: 'Concurrent was 15% goedkoper — TE_DUUR.',
    },
    [
      { fromStatus: null, toStatus: RequestStatus.NIEUW },
      { fromStatus: RequestStatus.NIEUW, toStatus: RequestStatus.VERLOREN, note: 'Te duur' },
    ],
  );
  if (!lostReason) {
    step('   ! LostReason "TE_DUUR" niet gevonden — TP-AV-005 heeft geen reden verloren');
  }

  refs.requests.onHold = await upsertRequest(
    'TP-AV-006',
    {
      contactId: refs.contacts.injectie,
      locationId: refs.locations.injectie,
      source: RequestSource.WEB_FORM,
      status: RequestStatus.ON_HOLD,
      // §J: HTML/JS-injectie in een aanvraagtitel → escaping in lijst + detail.
      title: `TP On hold ${DIRTY.script}`,
      description: `${DIRTY.imgOnerror} — ${DIRTY.sqlDrop}`,
    },
    [
      { fromStatus: null, toStatus: RequestStatus.NIEUW },
      { fromStatus: RequestStatus.NIEUW, toStatus: RequestStatus.ON_HOLD, note: 'Wacht op klant' },
    ],
  );

  // Grensgevallen titel: 1 teken en 2000+ tekens (backend kent geen max).
  refs.requests.korteTitel = await upsertRequest(
    'TP-AV-007',
    {
      contactId: refs.contacts.particulier,
      locationId: refs.locations.particulier,
      source: RequestSource.PHONE,
      status: RequestStatus.NIEUW,
      title: 'X',
      description: 'Aanvraag met een titel van precies 1 teken.',
      priority: Priority.LOW,
    },
    [{ fromStatus: null, toStatus: RequestStatus.NIEUW }],
  );

  refs.requests.langeTitel = await upsertRequest(
    'TP-AV-008',
    {
      contactId: refs.contacts.langeNaam,
      locationId: refs.locations.langeNaam,
      source: RequestSource.EMAIL,
      status: RequestStatus.NIEUW,
      title: LONG_REQUEST_TITLE,
      description: DIRTY.hugeText,
    },
    [{ fromStatus: null, toStatus: RequestStatus.NIEUW }],
  );

  step(
    `   ✓ 8 aanvragen (4 bronnen × 6 statussen, titel 1 teken en ${LONG_REQUEST_TITLE.length} tekens)`,
  );

  // ─── F. Offertes ──────────────────────────────────────────────────────────
  step('F. Offertes');

  const validUntil = daysFromToday(30);
  const createdBy = refs.users.demoBackoffice;

  // F1. Onder de org-drempel (10.000): btw verlegd (0%) → total exact € 500,00.
  refs.quotes.concept = await upsertQuote(
    prisma,
    demoOrg.id,
    createdBy,
    'TP-OFF-001',
    {
      status: QuoteStatus.CONCEPT,
      subject: 'TP Kleine keuring — onder de goedkeuringsdrempel',
      contactId: refs.contacts.net,
      locationId: refs.locations.net,
      validUntil,
      internalNotes: 'Totaal € 500,00 → mag zonder goedkeuring verstuurd worden.',
    },
    [
      {
        description: 'TP Werk in het buitenland (btw verlegd)',
        quantity: 5,
        unit: 'stuks',
        unitPrice: 100.0,
        vatRate: 0,
        productId: refs.products.btw0,
      },
    ],
  );

  // F2. Ver boven de drempel: total exact € 25.000,00 → moet TER_GOEDKEURING.
  refs.quotes.terGoedkeuring = await upsertQuote(
    prisma,
    demoOrg.id,
    createdBy,
    'TP-OFF-002',
    {
      status: QuoteStatus.TER_GOEDKEURING,
      subject: 'TP Grootproject — boven de goedkeuringsdrempel',
      contactId: refs.contacts.net,
      locationId: refs.locations.net,
      validUntil,
      requiresApproval: true,
      internalNotes: 'Totaal € 25.000,00 → drempel 10.000 overschreden.',
    },
    [
      {
        description: 'TP Grootproject (btw verlegd)',
        quantity: 10,
        unit: 'stuks',
        unitPrice: 2500.0,
        vatRate: 0,
        productId: refs.products.btw0,
      },
    ],
  );
  // Openstaand, verplicht goedkeuringsverzoek gericht aan de MANAGER-rol.
  await upsertBy(
    () =>
      prisma.quoteApprovalRequest.findFirst({
        where: { quoteId: refs.quotes.terGoedkeuring, kind: ApprovalKind.THRESHOLD },
        select: { id: true },
      }),
    () =>
      prisma.quoteApprovalRequest.create({
        data: {
          quoteId: refs.quotes.terGoedkeuring,
          requestedBy: createdBy,
          status: ApprovalStatus.PENDING,
          kind: ApprovalKind.THRESHOLD,
          approverRole: Role.MANAGER,
          note: 'Bedrag boven de org-drempel van € 10.000.',
        },
        select: { id: true },
      }),
    (id) =>
      prisma.quoteApprovalRequest.update({
        where: { id },
        data: {
          status: ApprovalStatus.PENDING,
          approverRole: Role.MANAGER,
          reviewedBy: null,
          reviewedAt: null,
        },
        select: { id: true },
      }),
  );

  // F3. GOEDGEKEURD met gemengde btw-tarieven (21 / 9 / 0) én een regelkorting.
  refs.quotes.goedgekeurd = await upsertQuote(
    prisma,
    demoOrg.id,
    createdBy,
    'TP-OFF-003',
    {
      status: QuoteStatus.GOEDGEKEURD,
      subject: 'TP Gemengde btw-tarieven (21% / 9% / 0%)',
      contactId: refs.contacts.groep,
      locationId: refs.locations.groep,
      requestId: refs.requests.offerteGemaakt,
      validUntil,
      internalNotes: 'Controleer of de portal dezelfde btw- en kortingtotalen toont.',
    },
    [
      {
        description: 'TP Advies op locatie (21% btw)',
        quantity: 4,
        unit: 'uur',
        unitPrice: 95.0,
        vatRate: 21,
        productId: refs.products.btw21,
      },
      {
        description: 'TP Onderhoudsabonnement (9% btw, 10% korting)',
        quantity: 12,
        unit: 'maand',
        unitPrice: 49.95,
        vatRate: 9,
        discountPct: 10,
        productId: refs.products.btw9,
      },
      {
        description: 'TP Werk in het buitenland (btw verlegd, 0%)',
        quantity: 1,
        unit: 'stuks',
        unitPrice: 250.0,
        vatRate: 0,
        productId: refs.products.btw0,
      },
    ],
  );

  // F4. VERSTUURD met publieke token → anonieme `/offerte/:token`-test.
  // Bewust naar een relatie ZONDER e-mailadres (weergave/verzendrand).
  refs.quotes.verstuurd = await upsertQuote(
    prisma,
    demoOrg.id,
    createdBy,
    'TP-OFF-004',
    {
      status: QuoteStatus.VERSTUURD,
      subject: 'TP Verstuurde offerte (publieke token)',
      contactId: refs.contacts.particulier,
      locationId: refs.locations.particulier,
      validUntil,
      publicToken: 'tp-offerte-verstuurd',
      sentAt: daysFromToday(-3),
    },
    [
      {
        description: 'TP Inspectie-uur (vast tarief)',
        quantity: 6,
        unit: 'uur',
        unitPrice: 85.0,
        vatRate: 21,
        productId: refs.products.fixed,
      },
    ],
  );

  // F5. BEKEKEN — verstuurd én door de klant geopend.
  refs.quotes.bekeken = await upsertQuote(
    prisma,
    demoOrg.id,
    createdBy,
    'TP-OFF-005',
    {
      status: QuoteStatus.BEKEKEN,
      subject: 'TP Bekeken offerte',
      contactId: refs.contacts.net,
      locationId: refs.locations.net,
      validUntil,
      sentAt: daysFromToday(-5),
      viewedAt: daysFromToday(-4),
    },
    [
      {
        description: 'TP Meetpunt (staffel, 12 stuks)',
        quantity: 12,
        unit: 'stuks',
        unitPrice: 10.0,
        vatRate: 21,
        productId: refs.products.tiered,
      },
    ],
  );

  // F6. GEACCEPTEERD — ondertekend, met publieke token voor de bevestigingspagina.
  refs.quotes.geaccepteerd = await upsertQuote(
    prisma,
    demoOrg.id,
    createdBy,
    'TP-OFF-006',
    {
      status: QuoteStatus.GEACCEPTEERD,
      subject: 'TP Geaccepteerde offerte',
      contactId: refs.contacts.net,
      locationId: refs.locations.net,
      validUntil,
      publicToken: 'tp-offerte-geaccepteerd',
      sentAt: daysFromToday(-10),
      viewedAt: daysFromToday(-9),
      signedAt: daysFromToday(-8),
      clientName: 'Sanne Bakker',
    },
    [
      {
        description: 'TP Inspectie-uur (vast tarief)',
        quantity: 8,
        unit: 'uur',
        unitPrice: 85.0,
        vatRate: 21,
        productId: refs.products.fixed,
      },
      {
        description: 'TP Gratis intake',
        quantity: 1,
        unit: 'stuks',
        unitPrice: 0.0,
        vatRate: 21,
        productId: refs.products.nul,
      },
    ],
  );

  // F7. AFGEWEZEN.
  refs.quotes.afgewezen = await upsertQuote(
    prisma,
    demoOrg.id,
    createdBy,
    'TP-OFF-007',
    {
      status: QuoteStatus.AFGEWEZEN,
      subject: `TP Afgewezen offerte ${DIRTY.mixed}`,
      contactId: refs.contacts.unicode,
      locationId: refs.locations.unicode,
      validUntil,
      sentAt: daysFromToday(-20),
      viewedAt: daysFromToday(-19),
      internalNotes: 'Klant koos voor een andere partij.',
    },
    [
      {
        description: `TP Advies ${DIRTY.cjk}`,
        quantity: 2,
        unit: 'uur',
        unitPrice: 95.0,
        vatRate: 21,
        productId: refs.products.btw21,
      },
    ],
  );

  // F8. VERLOPEN — validUntil in het verleden.
  refs.quotes.verlopen = await upsertQuote(
    prisma,
    demoOrg.id,
    createdBy,
    'TP-OFF-008',
    {
      status: QuoteStatus.VERLOPEN,
      subject: 'TP Verlopen offerte',
      contactId: refs.contacts.langeNaam,
      locationId: refs.locations.langeNaam,
      validUntil: daysFromToday(-7),
      sentAt: daysFromToday(-40),
    },
    [
      {
        description: 'TP Inspectie-uur (vast tarief)',
        quantity: 3,
        unit: 'uur',
        unitPrice: 85.0,
        vatRate: 21,
        productId: refs.products.fixed,
      },
    ],
  );

  // F9. Offerte met NUL regels → alle totalen 0,00 (verzendtest van lege offerte).
  // §J: vuile data in het onderwerp.
  refs.quotes.leeg = await upsertQuote(
    prisma,
    demoOrg.id,
    createdBy,
    'TP-OFF-009',
    {
      status: QuoteStatus.CONCEPT,
      subject: `TP Lege offerte ${DIRTY.script} ${DIRTY.emoji}`,
      contactId: refs.contacts.injectie,
      locationId: refs.locations.injectie,
      validUntil,
      internalNotes: 'Nul regels — verwacht: blokkeren bij versturen, of totaal 0,00.',
    },
    [],
  );

  // F10. Bewust onzinnige regels (BO-13..16). De backend kent geen @Min/@Max, dus
  // dit mag bestaan; het testprogramma vergelijkt de UI-totalen met onderstaande:
  //   regel A: 2 × -100,00, 0% korting, 21% btw → lineTotal   -200,00 / btw  -42,00
  //   regel B: 1 ×  500,00, 150% korting, 21% btw → lineTotal -250,00 / btw  -52,50
  //   regel C: 1 ×  100,00, 0% korting, 250% btw → lineTotal   100,00 / btw  250,00
  //   subtotal -350,00 · discountTotal 750,00 · vatTotal 155,50 · total -194,50
  refs.quotes.onzin = await upsertQuote(
    prisma,
    demoOrg.id,
    createdBy,
    'TP-OFF-010',
    {
      status: QuoteStatus.CONCEPT,
      subject: 'TP Onzinnige regels (negatieve prijs, korting 150%, btw 250%)',
      contactId: refs.contacts.net,
      locationId: refs.locations.net,
      validUntil,
      internalNotes:
        'Doeltestgeval: backend accepteert deze waarden. Verwachte totalen staan in de seed-comment.',
    },
    [
      {
        description: 'TP Negatieve eenheidsprijs',
        quantity: 2,
        unit: 'stuks',
        unitPrice: -100.0,
        vatRate: 21,
      },
      {
        description: 'TP Korting van 150%',
        quantity: 1,
        unit: 'stuks',
        unitPrice: 500.0,
        vatRate: 21,
        discountPct: 150,
      },
      {
        description: 'TP Btw-tarief van 250%',
        quantity: 1,
        unit: 'stuks',
        unitPrice: 100.0,
        vatRate: 250,
      },
    ],
  );

  step('   ✓ 10 offertes: alle 8 statussen + drempelvarianten + 0 regels + onzin-regels');

  // ─── G. Projecten & planning ──────────────────────────────────────────────
  step('G. Project + planning');

  const tpProject = await prisma.project.upsert({
    where: { orgId_projectNumber: { orgId: demoOrg.id, projectNumber: 'TP-P-001' } },
    update: {
      title: 'TP Testprogramma-project',
      description: 'Verzamelproject voor de planning- en beschikbaarheidstests.',
      status: ProjectStatus.ACTIEF,
      contactId: refs.contacts.net,
      locationId: refs.locations.net,
      projectManagerId: refs.users.demoManager,
      isDeleted: false,
    },
    create: {
      orgId: demoOrg.id,
      projectNumber: 'TP-P-001',
      title: 'TP Testprogramma-project',
      description: 'Verzamelproject voor de planning- en beschikbaarheidstests.',
      status: ProjectStatus.ACTIEF,
      contactId: refs.contacts.net,
      locationId: refs.locations.net,
      projectManagerId: refs.users.demoManager,
      startDate: daysFromToday(-14),
      createdBy: refs.users.demoAdmin,
    },
    select: { id: true },
  });
  refs.projects.tp = tpProject.id;

  /** Planregel op (org + productName) zoeken en bijwerken, anders aanmaken. */
  const upsertPlanning = async (data: {
    productName: string;
    status: PlanningStatus;
    contactId: string;
    locationId?: string | null;
    productId?: string | null;
    scheduledDate?: Date | null;
    durationHours?: number | null;
    endTime?: Date | null;
    isMultiDay?: boolean;
    sessionCount?: number | null;
    internalNotes?: string | null;
  }): Promise<string> => {
    const payload = { ...data, projectId: tpProject.id };
    const item = await upsertBy(
      () =>
        prisma.planningItem.findFirst({
          where: { orgId: demoOrg.id, productName: data.productName },
          select: { id: true },
        }),
      () =>
        prisma.planningItem.create({
          data: { orgId: demoOrg.id, createdBy: refs.users.demoWerkvoorbereider, ...payload },
          select: { id: true },
        }),
      (id) => prisma.planningItem.update({ where: { id }, data: payload, select: { id: true } }),
    );
    return item.id;
  };

  refs.planning.nogTePlannen = await upsertPlanning({
    productName: 'TP Planning — nog te plannen',
    status: PlanningStatus.NOG_TE_PLANNEN,
    contactId: refs.contacts.net,
    locationId: refs.locations.net,
    productId: refs.products.fixed,
    internalNotes: 'Zonder scheduledDate → geen beschikbaarheidscheck bij toewijzen.',
  });

  // Enkeldags GEPLAND op 2026-08-10, 8 uur.
  // LET OP: de hoofdseed (PRD-12) blokkeert inspecteur@inspexi-demo.nl van
  // 2026-08-03 t/m 2026-08-15 ("Vakantie"). Deze dag is dus alleen "vrij" als die
  // vakantie-uitzondering is verwijderd; anders geeft toewijzen ook hier een 409.
  refs.planning.gepland = await upsertPlanning({
    productName: 'TP Planning — gepland 10 aug',
    status: PlanningStatus.GEPLAND,
    contactId: refs.contacts.groep,
    locationId: refs.locations.groep,
    productId: refs.products.fixed,
    scheduledDate: new Date('2026-08-10T08:00:00Z'),
    durationHours: 8,
    endTime: new Date('2026-08-10T16:00:00Z'),
    internalNotes: 'Hele werkdag; inspecteur staat op PENDING (nog niet geaccepteerd).',
  });
  await prisma.planningInspector.upsert({
    where: {
      planningItemId_userId: {
        planningItemId: refs.planning.gepland,
        userId: refs.users.demoInspecteur,
      },
    },
    update: { isPrimary: true, acceptanceStatus: AcceptanceStatus.PENDING, acceptedAt: null },
    create: {
      planningItemId: refs.planning.gepland,
      userId: refs.users.demoInspecteur,
      isPrimary: true,
      acceptanceStatus: AcceptanceStatus.PENDING,
    },
  });

  // Meerdaags met 2 sessies.
  refs.planning.meerdaags = await upsertPlanning({
    productName: 'TP Planning — meerdaags (2 sessies)',
    status: PlanningStatus.GEPLAND,
    contactId: refs.contacts.net,
    locationId: refs.locations.net,
    productId: refs.products.tiered,
    scheduledDate: new Date('2026-08-17T08:00:00Z'),
    durationHours: 8,
    isMultiDay: true,
    sessionCount: 2,
    internalNotes: 'Twee sessies op opeenvolgende dagen.',
  });
  // Sessies gescoped opnieuw zetten (PlanningSessionInspector cascadeert mee).
  await prisma.planningSession.deleteMany({
    where: { planningItemId: refs.planning.meerdaags },
  });
  await prisma.planningSession.createMany({
    data: [
      {
        planningItemId: refs.planning.meerdaags,
        sessionNumber: 1,
        scheduledDate: new Date('2026-08-17T08:00:00Z'),
        durationHours: 4,
        status: SessionStatus.DEFINITIEF,
        isDefinitief: true,
        notes: 'Sessie 1 — voormiddag.',
      },
      {
        planningItemId: refs.planning.meerdaags,
        sessionNumber: 2,
        scheduledDate: new Date('2026-08-18T08:00:00Z'),
        durationHours: 4,
        status: SessionStatus.CONCEPT,
        notes: 'Sessie 2 — nog te bevestigen.',
      },
    ],
  });

  // Datum ver in het verleden: er is GEEN backend-guard op een verleden
  // `scheduledDate` — bewust geseed om dat als S3-kandidaat te documenteren.
  refs.planning.verleden = await upsertPlanning({
    productName: 'TP Planning — datum in het verleden',
    status: PlanningStatus.GEPLAND,
    contactId: refs.contacts.particulier,
    locationId: refs.locations.particulier,
    productId: refs.products.fixed,
    scheduledDate: new Date('2020-01-01T09:00:00Z'),
    durationHours: 4,
    endTime: new Date('2020-01-01T13:00:00Z'),
    internalNotes: 'Geen guard op datum in het verleden — gedocumenteerd testgeval.',
  });

  step('   ✓ project TP-P-001 + 4 planregels (nog te plannen / gepland / meerdaags / verleden)');
}
