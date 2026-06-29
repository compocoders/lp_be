/**
 * ─── Token Middleware ─────────────────────────────────────────────────────────
 *
 * Manages the user's daily AI token budget. Every AI endpoint (except /token-info)
 * runs this middleware BEFORE the controller to:
 *
 *  1. Check if the user's daily token quota needs resetting (new calendar day).
 *  2. Block the request if the user has exhausted their daily tokens (returns 429).
 *  3. Attach a `deductTokens()` helper to `req.tokenWallet` so controllers can
 *     deduct the actual tokens used after receiving the AI response.
 *
 * ─── Daily Token Budget ───────────────────────────────────────────────────────
 * Each user gets DAILY_TOKEN_LIMIT virtual tokens per day. These reset at midnight
 * of the next local server day. The token count loosely maps to Gemini API tokens
 * (1 virtual token ≈ 1 Gemini input/output token).
 *
 * ─── Race Condition Prevention ────────────────────────────────────────────────
 * `deductTokens()` uses Prisma's atomic `{ decrement: n }` operator instead of
 * a read-then-write pattern. This prevents two concurrent requests from both
 * reading the same starting balance and each deducting from it independently
 * (which would cause the balance to go negative or allow overspending).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { prisma } from '../config/db.js';

/** Each user's maximum virtual token allocation per calendar day. */
const DAILY_TOKEN_LIMIT = 50000;

/**
 * Returns the ISO timestamp for midnight of the next local server day.
 * Used in API responses to tell the frontend when the user's tokens will reset.
 *
 * @returns {string} ISO 8601 date-time string for the next midnight
 */
const getNextMidnight = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.toISOString();
};

/**
 * Token check & deduction middleware.
 *
 * Must run AFTER the `authenticate` middleware (requires req.user.id).
 * Attaches `req.tokenWallet` for use by AI controllers.
 */
export const checkAndDeductTokens = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // 1. Fetch the user's current token balance and last reset time
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { virtualTokens: true, lastTokenReset: true }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 2. Check if today is a new calendar day compared to the last reset
    const now = new Date();
    const lastReset = new Date(user.lastTokenReset);
    let currentTokens = user.virtualTokens;

    const isDifferentDay =
      lastReset.getDate()     !== now.getDate()     ||
      lastReset.getMonth()    !== now.getMonth()     ||
      lastReset.getFullYear() !== now.getFullYear();

    if (isDifferentDay) {
      // New day — atomically reset the token balance back to the daily limit
      await prisma.user.update({
        where: { id: userId },
        data: {
          virtualTokens: DAILY_TOKEN_LIMIT,
          lastTokenReset: now,
        }
      });
      currentTokens = DAILY_TOKEN_LIMIT;
    }

    // 3. Hard block — if the user is out of tokens, reject the request
    if (currentTokens <= 0) {
      return res.status(429).json({
        message: 'Daily AI token limit reached. Your tokens will reset tomorrow.',
        remainingTokens: 0,
        nextResetAt: getNextMidnight(),
      });
    }

    // 4. Attach the token wallet to the request object so AI controllers can
    //    deduct tokens AFTER receiving the AI response (we don't know the cost upfront).
    req.tokenWallet = {
      availableTokens: currentTokens,
      userId,

      /**
       * Atomically deducts `amountUsed` tokens from the user's balance.
       *
       * Uses Prisma's `{ decrement: n }` to perform the decrement in a single
       * atomic DB operation, preventing race conditions from concurrent requests.
       * If the result would go below 0, a second update clamps it to 0.
       *
       * @param {number} amountUsed — Number of tokens consumed by this AI call
       * @returns {Promise<number>} The new token balance after deduction
       */
      deductTokens: async (amountUsed) => {
        // Atomic decrement — prevents race conditions from parallel requests
        const updated = await prisma.user.update({
          where: { id: userId },
          data: { virtualTokens: { decrement: amountUsed } },
          select: { virtualTokens: true }
        });

        const newBalance = updated.virtualTokens;

        // Clamp to 0 if the decrement pushed the balance below zero
        // (rare but possible if two large requests fire simultaneously)
        if (newBalance < 0) {
          await prisma.user.update({
            where: { id: userId },
            data: { virtualTokens: 0 }
          });
          return 0;
        }

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
