import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Plan.name is the unique key (see schema.prisma).
  const plans = [
    { name: 'FREE', dailyLimit: 100, price: 0 },
    { name: 'BASIC', dailyLimit: 2000, price: 99 },
    { name: 'PRO', dailyLimit: 20000, price: 299 },
    { name: 'ENTERPRISE', dailyLimit: 100000000, price: 999 },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { name: plan.name },
      update: {
        dailyLimit: plan.dailyLimit,
        price: plan.price,
      },
      create: {
        name: plan.name,
        dailyLimit: plan.dailyLimit,
        price: plan.price,
      },
    });
  }

  console.log('Seed completed: plans created');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
