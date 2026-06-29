/**
 * ─── Environment Variable Configuration ──────────────────────────────────────
 *
 * Validates all required environment variables at startup using Zod.
 * If any required variable is missing or malformed, the server will REFUSE to
 * start and print a descriptive error — preventing silent misconfigurations
 * in production.
 *
 * Required .env variables:
 *  DATABASE_URL      — PostgreSQL connection string
 *  JWT_SECRET        — Secret key for signing JWTs (min 10 chars)
 *  FRONTEND_URL      — Production frontend URL (for CORS whitelist)
 *
 * Optional .env variables:
 *  PORT              — Server port (default: 3000)
 *  JWT_EXPIRES_IN    — Token expiry duration (default: '1d')
 *  NODE_ENV          — Runtime environment (default: 'development')
 *  R2_*              — Cloudflare R2 storage credentials
 *  JUDGE0_*          — Code execution API credentials
 *  GEMINI_API_KEY    — Google Gemini AI API key
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // ─── Server ──────────────────────────────────────────────────────────────
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // ─── Database ─────────────────────────────────────────────────────────────
  DATABASE_URL: z.string(),

  // ─── Authentication ───────────────────────────────────────────────────────
  JWT_SECRET: z.string().min(10, 'JWT_SECRET must be at least 10 characters'),
  JWT_EXPIRES_IN: z.string().default('1d'),

  // ─── CORS ─────────────────────────────────────────────────────────────────
  // The production frontend URL added to the CORS whitelist.
  // Example: https://yourapp.vercel.app
  FRONTEND_URL: z.string().url().optional(),

  // ─── Cloudflare R2 Storage ────────────────────────────────────────────────
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),

  // ─── Judge0 (Code Execution) ──────────────────────────────────────────────
  JUDGE0_BASE_URL: z.string().url().default('https://judge0-ce.p.rapidapi.com'),
  JUDGE0_API_KEY: z.string().optional().default(''),

  // ─── Google Gemini AI ─────────────────────────────────────────────────────
  GEMINI_API_KEY: z.string().optional().default(''),

  // ─── Email Services ───────────────────────────────────────────────────────
  RESEND_API_KEY: z.string().optional(),
  SMTP_EMAIL: z.string().email().optional(),
  SMTP_PASSWORD: z.string().optional(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  throw new Error('Invalid environment variables — check your .env file');
}

export const env = _env.data;
