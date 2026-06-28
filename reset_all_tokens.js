import { prisma } from './src/config/db.js';
const DAILY_TOKEN_LIMIT = 50000;

async function main() {
  console.log(`Starting token reset migration...`);
  try {
    const result = await prisma.user.updateMany({
      data: {
        virtualTokens: DAILY_TOKEN_LIMIT,
        lastTokenReset: new Date()
      }
    });
    console.log(`Successfully reset tokens for ${result.count} users to ${DAILY_TOKEN_LIMIT}.`);
  } catch (error) {
    console.error('Error resetting tokens:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
