import { PrismaClient, Role, ContactType, LogType, PriceType, RequestSource, RequestStatus, Priority, QuoteStatus, NotificationType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing imp_ data (safe for shared DB — only deletes our tables)
  // PRD-06 tables (no dependents)
  await prisma.notificationGroupPref.deleteMany();
  await prisma.notificationPref.deleteMany();
  await prisma.notification.deleteMany();
  // PRD-05 tables first (dependent on quotes → products/contacts)
  await prisma.quoteApprovalRequest.deleteMany();
  await prisma.quoteLine.deleteMany();
  await prisma.quote.deleteMany();
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
  // CRM tables (dependent on contacts)
  await prisma.contactCustomerGroup.deleteMany();
  await prisma.customerGroup.deleteMany();
  await prisma.contactPerson.deleteMany();
  await prisma.contactEmail.deleteMany();
  await prisma.contactLog.deleteMany();
  await prisma.location.deleteMany();
  await prisma.contactAddress.deleteMany();
  await prisma.contact.deleteMany();
  // Tasks & Documents (dependent on users)
  await prisma.document.deleteMany();
  await prisma.task.deleteMany();
  // Auth/org tables
  await prisma.auditLog.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // ─── Organizations ─────────────────────────────────────
  const org1 = await prisma.organization.create({
    data: {
      name: 'InspeXi Demo',
      slug: 'inspexidemo',
      primaryColor: '#1E40AF',
      defaultVat: 21,
      defaultValidityDays: 30,
    },
  });
  console.log(`  ✓ Organization: ${org1.name} (${org1.slug})`);

  const org2 = await prisma.organization.create({
    data: {
      name: 'Test Bedrijf',
      slug: 'testbedrijf',
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
  const loc1Kantoor = await prisma.location.create({
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
  const loc1Bedrijfshal = await prisma.location.create({
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

  const loc2Woning = await prisma.location.create({
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

  const loc3Zuidas = await prisma.location.create({
    data: {
      contactId: contact3.id,
      orgId: org1.id,
      name: 'Bouwplaats Zuidas',
      street: 'Kralingse Plaslaan',
      houseNumber: '50',
      postalCode: '3062 DB',
      city: 'Rotterdam',
      objectType: 'woning',
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
      objectType: 'kantoor',
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
      objectType: 'industrieel',
    },
  });

  console.log('    → 1 adres, 1 locatie');

  // ─── PRD-04: Products & Price Tables ─────────────────
  console.log('\n📦 Seeding Products & Price Tables...');

  // --- Org 1: Product Groups ---
  const [grpInspectie1, grpAdministratie1, grpOverig1] = await Promise.all([
    prisma.productGroup.create({ data: { orgId: org1.id, name: 'Inspectie' } }),
    prisma.productGroup.create({ data: { orgId: org1.id, name: 'Administratie' } }),
    prisma.productGroup.create({ data: { orgId: org1.id, name: 'Overig' } }),
  ]);
  console.log(`  ✓ 3 productgroepen voor ${org1.name}`);

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
      coverBlocks: [
        { type: 'heading', content: 'Offerte Inspectie' },
        { type: 'text', content: 'Hierbij ontvangt u onze offerte voor de gevraagde inspectie.' },
      ],
      contentBlocks: [
        { type: 'heading', content: 'Werkzaamheden' },
        { type: 'text', content: 'De volgende werkzaamheden zijn opgenomen in deze offerte:' },
      ],
      closingBlocks: [
        { type: 'text', content: 'Wij vertrouwen erop u hiermee een passend aanbod te hebben gedaan.' },
        { type: 'text', content: 'Met vriendelijke groet,\nInspeXi Demo' },
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
      coverBlocks: [{ type: 'heading', content: 'Projectofferte' }],
      contentBlocks: [{ type: 'text', content: 'Projectomschrijving en specificaties:' }],
      closingBlocks: [{ type: 'text', content: 'Wij zien uw reactie met belangstelling tegemoet.' }],
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
