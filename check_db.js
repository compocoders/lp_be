import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();
async function run() {
  const activities = await prisma.activity.findMany({ select: { id: true, title: true, status: true }});
  console.log(activities);
}
run();
