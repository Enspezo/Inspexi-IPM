import { PrismaClient, Role, ContactType, LogType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing imp_ data (safe for shared DB — only deletes our tables)
  // CRM tables first (dependent on contacts)
  await prisma.contactEmail.deleteMany();
  await prisma.contactLog.deleteMany();
  await prisma.location.deleteMany();
  await prisma.contactAddress.deleteMany();
  await prisma.contact.deleteMany();
  // Auth/org tables
  await prisma.invitation.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // ─── Organizations ─────────────────────────────────────
  const org1 = await prisma.organization.create({
    data: {
      name: 'InspeXi Demo',
      slug: 'inspexi-demo',
      primaryColor: '#1E40AF',
      defaultVat: 21,
      defaultValidityDays: 30,
    },
  });
  console.log(`  ✓ Organization: ${org1.name} (${org1.slug})`);

  const org2 = await prisma.organization.create({
    data: {
      name: 'Test Bedrijf',
      slug: 'test-bedrijf',
      primaryColor: '#059669',
      defaultVat: 21,
      defaultValidityDays: 14,
    },
  });
  console.log(`  ✓ Organization: ${org2.name} (${org2.slug})`);

  // ─── Users ─────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Password123!', 10);

  // Superuser (no org)
  await prisma.user.create({
    data: {
      email: 'superuser@inspexi.nl',
      passwordHash,
      firstName: 'Super',
      lastName: 'Admin',
      role: Role.SUPERUSER,
      emailVerifiedAt: new Date(),
    },
  });
  console.log('  ✓ User: superuser@inspexi.nl (SUPERUSER)');

  // Org 1 users
  const org1Users = [
    { email: 'admin@inspexi-demo.nl', firstName: 'Jan', lastName: 'de Vries', role: Role.ORG_ADMIN },
    { email: 'manager@inspexi-demo.nl', firstName: 'Pieter', lastName: 'Bakker', role: Role.MANAGER },
    { email: 'backoffice@inspexi-demo.nl', firstName: 'Maria', lastName: 'Jansen', role: Role.BACKOFFICE },
    { email: 'werkvoorbereider@inspexi-demo.nl', firstName: 'Kees', lastName: 'Smit', role: Role.WERKVOORBEREIDER },
    { email: 'inspecteur@inspexi-demo.nl', firstName: 'Tom', lastName: 'Visser', role: Role.INSPECTEUR },
  ];

  const createdOrg1Users: Record<string, string> = {};
  for (const u of org1Users) {
    const created = await prisma.user.create({
      data: { ...u, passwordHash, orgId: org1.id, emailVerifiedAt: new Date() },
    });
    createdOrg1Users[u.role] = created.id;
    console.log(`  ✓ User: ${u.email} (${u.role})`);
  }

  // Org 2 users
  const org2Users = [
    { email: 'admin@testbedrijf.nl', firstName: 'Lisa', lastName: 'Mulder', role: Role.ORG_ADMIN },
    { email: 'inspecteur@testbedrijf.nl', firstName: 'Henk', lastName: 'Groot', role: Role.INSPECTEUR },
  ];

  const createdOrg2Users: Record<string, string> = {};
  for (const u of org2Users) {
    const created = await prisma.user.create({
      data: { ...u, passwordHash, orgId: org2.id, emailVerifiedAt: new Date() },
    });
    createdOrg2Users[u.role] = created.id;
    console.log(`  ✓ User: ${u.email} (${u.role})`);
  }

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

  // Locaties
  await prisma.location.create({
    data: {
      contactId: contact1.id,
      orgId: org1.id,
      name: 'Kantoorpand Zuidas',
      street: 'Gustav Mahlerlaan',
      houseNumber: '10',
      postalCode: '1082 PP',
      city: 'Amsterdam',
      objectType: 'kantoor',
      notes: 'Grote kantoorvloer, 3 verdiepingen',
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
      objectType: 'woning',
    },
  });
  await prisma.location.create({
    data: {
      contactId: contact1.id,
      orgId: org1.id,
      name: 'Bedrijfshal Schiphol',
      street: 'Schipholweg',
      houseNumber: '200',
      postalCode: '1171 PK',
      city: 'Badhoevedorp',
      objectType: 'industrieel',
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

  await prisma.location.create({
    data: {
      contactId: contact2.id,
      orgId: org1.id,
      name: 'Woning Utrecht',
      street: 'Kerkstraat',
      houseNumber: '15',
      postalCode: '3512 AB',
      city: 'Utrecht',
      objectType: 'woning',
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

  await prisma.location.createMany({
    data: [
      {
        contactId: contact3.id,
        orgId: org1.id,
        name: 'Appartementencomplex Kralingen',
        street: 'Kralingse Plaslaan',
        houseNumber: '50',
        postalCode: '3062 DB',
        city: 'Rotterdam',
        objectType: 'woning',
        notes: '24 appartementen',
      },
      {
        contactId: contact3.id,
        orgId: org1.id,
        name: 'Winkelcentrum Alexandrium',
        street: 'Alexandrium',
        houseNumber: '1',
        postalCode: '3068 NC',
        city: 'Rotterdam',
        objectType: 'kantoor',
      },
    ],
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

  await prisma.location.create({
    data: {
      contactId: contact4.id,
      orgId: org2.id,
      name: 'Magazijn Nieuwegein',
      street: 'Industriepark',
      houseNumber: '30',
      postalCode: '3430 AA',
      city: 'Nieuwegein',
      objectType: 'industrieel',
    },
  });

  console.log('    → 1 adres, 1 locatie');

  console.log('\n✅ Seed completed successfully!');
  console.log('\n📋 Login credentials (all use Password123!):');
  console.log('   superuser@inspexi.nl      → SUPERUSER');
  console.log('   admin@inspexi-demo.nl     → ORG_ADMIN (InspeXi Demo)');
  console.log('   manager@inspexi-demo.nl   → MANAGER (InspeXi Demo)');
  console.log('   backoffice@inspexi-demo.nl → BACKOFFICE (InspeXi Demo)');
  console.log('   admin@testbedrijf.nl      → ORG_ADMIN (Test Bedrijf)');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
