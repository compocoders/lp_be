import { prisma } from './src/config/db.js';

async function run() {
  const result = await prisma.activity.updateMany({ data: { status: 'published' } });
  console.log('Updated activities:', result.count);
}
run();
