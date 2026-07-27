/**
 * Seed voor het autonome testprogramma (docs/testprogramma/01-seed-datasets.md).
 *
 * Draait NAAST `seed.ts` (die de basisdata + SEED_DEMO-extra's neerzet) en voegt
 * variatie toe: extra organisatie, rommelige CRM-data, offertes in elke status,
 * beschikbaarheidsconflicten, assetbomen van wisselende vorm, online-herstel-data
 * en client-portal-rollen.
 *
 * Gebruik (vanuit apps/api):
 *   npx ts-node prisma/seed-testprogramma.ts
 *
 * Vereist dat `pnpm db:seed` (bij voorkeur met SEED_DEMO=1) al gedraaid heeft.
 * Herstart de API na afloop — de tenant-cache houdt orgs 5 minuten vast.
 */

import { PrismaClient } from '@prisma/client';
import { emptyRefs } from './seed-tp/shared';
import { seedBeheer } from './seed-tp/beheer';
import { seedInspectie } from './seed-tp/inspectie';
import { backfillNumbering } from './backfill-numbering';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('▶ Seed testprogramma — start');

  const refs = emptyRefs();

  console.log('\n[1/3] Beheer-domein (orgs, users, CRM, producten, offertes, planning)');
  await seedBeheer(prisma, refs);

  console.log('\n[2/3] Inspectiedomein, client-realm, online herstel & documenten');
  await seedInspectie(prisma, refs);

  console.log('\n[3/3] Nummering bijwerken');
  await backfillNumbering(prisma);

  console.log('\n✔ Seed testprogramma — klaar');
  console.log(
    `  orgs=${Object.keys(refs.orgs).length} users=${Object.keys(refs.users).length} ` +
      `contacten=${Object.keys(refs.contacts).length} offertes=${Object.keys(refs.quotes).length} ` +
      `plannen=${Object.keys(refs.plans).length} nodes=${Object.keys(refs.assetNodes).length}`,
  );
}

main()
  .catch((e) => {
    console.error('✘ Seed testprogramma faalde:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
