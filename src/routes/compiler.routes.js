/**
 * ─── Compiler (Code Execution) Routes ───────────────────────────────────────────────────
 *
 * Proxies code execution to the Judge0 API.
 *
 * Endpoints:
 *  GET  /compiler/languages  — List supported languages (intentionally public — used by the
 *                               activity builder's language picker before the user is in a session)
 *  POST /compiler/run        — Execute code (requires auth + rate limited)
 *
 * The POST /run endpoint is rate-limited with `compilerLimiter` (10 runs/min per user)
 * because each execution makes an outbound request to Judge0 and can be abused
 * for cryptocurrency mining or resource exhaustion attacks.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { compilerLimiter } from '../middlewares/rateLimiter.middleware.js';
import * as compilerController from '../controllers/compiler.controller.js';
import { SUPPORTED_LANGUAGES } from '../services/compiler.service.js';

// ─── Validation Schema ────────────────────────────────────────────────────────

/**
 * Validates a code execution request.
 * - language must be one of the supported values
 * - sourceCode is required and capped at 50,000 characters (prevents huge payloads)
 * - stdin and expectedOutput are optional but also capped
 */
const runCodeSchema = z.object({
  body: z.object({
    language: z
      .string()
      .toLowerCase()
      .refine((val) => Object.keys(SUPPORTED_LANGUAGES).includes(val), {
        message: `Unsupported language. Choose one of: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`,
      }),
    sourceCode:     z.string().min(1, 'Source code cannot be empty').max(50_000, 'Source code too large'),
    stdin:          z.string().max(10_000).optional().default(''),
    expectedOutput: z.string().max(10_000).optional().nullable(),
  }),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

const router = Router();

// Public — no auth required (used by the activity builder language picker)
router.get('/languages', compilerController.getSupportedLanguages);

// Protected + rate limited — prevents abuse of the external Judge0 execution API
router.post('/run', authenticate, compilerLimiter, validate(runCodeSchema), compilerController.runCode);

export default router;
