/**
 * ─── Rate Limiter Middleware ──────────────────────────────────────────────────
 *
 * Provides different rate-limit configurations for different route categories:
 *
 *  - authLimiter      → Protects login/register from brute-force attacks
 *  - aiLimiter        → Prevents rapid-fire AI requests (per-user, not per-IP)
 *  - compilerLimiter  → Limits code execution requests to prevent abuse
 *  - generalLimiter   → Catch-all limiter for remaining API endpoints
 *
 * All limiters use the standard `RateLimit-*` response headers so clients know
 * their current usage and when the window resets.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import rateLimit from 'express-rate-limit';

/**
 * Auth rate limiter — applied to POST /auth/login and POST /auth/register.
 *
 * Allows up to 10 requests per 15-minute window per IP address.
 * This makes brute-force password attacks impractical (1 attempt every ~90s).
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 attempts per window
  standardHeaders: true,     // Return RateLimit-* headers in the response
  legacyHeaders: false,      // Disable the old X-RateLimit-* headers
  validate: { xForwardedForHeader: false }, // Suppress IPv6 proxy warning in dev
  message: {
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
  skipSuccessfulRequests: false,
});

/**
 * AI rate limiter — applied to all /ai/* and /studio/* routes.
 *
 * Limits each AUTHENTICATED USER (not just IP) to 15 AI requests per minute.
 * Using userId as the key prevents bypassing limits with different IPs/proxies.
 * The daily token wallet is a budget guard; this limiter is a burst guard.
 *
 * Falls back to IP if the user is somehow not set (shouldn't happen since
 * authenticate middleware runs first on all AI routes).
 */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 15,             // 15 AI requests per minute per user
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // Suppress IPv6 proxy warning in dev
  // Key by authenticated userId so each user has their own independent counter
  keyGenerator: (req) => req.user?.id || req.ip,
  message: {
    message: 'Too many AI requests. Please wait a moment before trying again.',
  },
});

/**
 * Compiler rate limiter — applied to POST /compiler/run.
 *
 * Code execution is expensive (calls external Judge0 API) and can be abused
 * for crypto mining attempts or DoS. Limits to 10 runs per minute per user.
 */
export const compilerLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 10,             // 10 code runs per minute per user
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // Suppress IPv6 proxy warning in dev
  keyGenerator: (req) => req.user?.id || req.ip,
  message: {
    message: 'Too many code execution requests. Please wait before running more code.',
  },
});

/**
 * General rate limiter — applied globally to all remaining API routes.
 *
 * Acts as a catch-all to prevent any single IP from overwhelming the server.
 * 100 requests per minute is generous for legitimate use but effective against scripts.
 */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 100,            // 100 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // Suppress IPv6 proxy warning in dev
  message: {
    message: 'Too many requests. Please slow down.',
  },
});
