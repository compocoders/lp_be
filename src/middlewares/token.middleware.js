import { prisma } from '../config/db.js';

const DAILY_TOKEN_LIMIT = 50000;

/**
 * Returns midnight of the next day in local server time as a UTC ISO string.
 */
const getNextMidnight = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.toISOString();
};

export const checkAndDeductTokens = async (req, res, next) => {
  try {
    const userId = req.user.id; // Assumes authMiddleware has run

    // 1. Fetch user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { virtualTokens: true, lastTokenReset: true }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 2. Check for daily reset — compare calendar day
    const now = new Date();
    const lastReset = new Date(user.lastTokenReset);
    let currentTokens = user.virtualTokens;

    const isDifferentDay =
      lastReset.getDate() !== now.getDate() ||
      lastReset.getMonth() !== now.getMonth() ||
      lastReset.getFullYear() !== now.getFullYear();

    if (isDifferentDay) {
      // Reset tokens to daily limit
      await prisma.user.update({
        where: { id: userId },
        data: {
          virtualTokens: DAILY_TOKEN_LIMIT,
          lastTokenReset: now,
        }
      });
      currentTokens = DAILY_TOKEN_LIMIT;
    }

    // 3. Hard block — if tokens are exhausted, reject with reset time
    if (currentTokens <= 0) {
      return res.status(429).json({
        message: 'Daily AI token limit reached. Your tokens will reset tomorrow.',
        remainingTokens: 0,
        nextResetAt: getNextMidnight(),
      });
    }

    // 4. Attach token wallet to req for controllers to deduct after usage
    req.tokenWallet = {
      availableTokens: currentTokens,
      userId,
      deductTokens: async (amountUsed) => {
        const newBalance = Math.max(0, currentTokens - amountUsed);
        await prisma.user.update({
          where: { id: userId },
          data: { virtualTokens: newBalance }
        });
        return newBalance;
      }
    };

    next();
  } catch (error) {
    console.error('Token Middleware Error:', error);
    res.status(500).json({ message: 'Internal server error checking tokens' });
  }
};

export { DAILY_TOKEN_LIMIT, getNextMidnight };
