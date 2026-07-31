/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log(`Seed: ${userCount} user(s) already exist — skipping admin creation.`);
    return;
  }

  const email = (process.env.ADMIN_EMAIL ?? 'admin@mfd.local').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';
  const name = process.env.ADMIN_NAME ?? 'MFD Admin';

  await prisma.user.create({
    data: {
      email,
      name,
      role: 'ADMIN',
      passwordHash: await bcrypt.hash(password, 10),
    },
  });
  console.log(`Seed: created admin user ${email}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('Seed: ADMIN_PASSWORD not set — using the default. Change it immediately.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
