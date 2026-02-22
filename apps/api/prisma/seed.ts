import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing imp_ data (safe for shared DB — only deletes our tables)
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

  for (const u of org1Users) {
    await prisma.user.create({
      data: { ...u, passwordHash, orgId: org1.id, emailVerifiedAt: new Date() },
    });
    console.log(`  ✓ User: ${u.email} (${u.role})`);
  }

  // Org 2 users
  const org2Users = [
    { email: 'admin@testbedrijf.nl', firstName: 'Lisa', lastName: 'Mulder', role: Role.ORG_ADMIN },
    { email: 'inspecteur@testbedrijf.nl', firstName: 'Henk', lastName: 'Groot', role: Role.INSPECTEUR },
  ];

  for (const u of org2Users) {
    await prisma.user.create({
      data: { ...u, passwordHash, orgId: org2.id, emailVerifiedAt: new Date() },
    });
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
