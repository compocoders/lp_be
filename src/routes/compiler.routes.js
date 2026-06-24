import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import * as compilerController from '../controllers/compiler.controller.js';
import { SUPPORTED_LANGUAGES } from '../services/compiler.service.js';

const router = Router();

const runCodeSchema = z.object({
  body: z.object({
    language: z
      .string()
      .toLowerCase()
      .refine((val) => Object.keys(SUPPORTED_LANGUAGES).includes(val), {
        message: `Unsupported language. Choose one of: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`,
      }),
    sourceCode: z.string().min(1, 'Source code cannot be empty').max(50_000, 'Source code too large'),
    stdin: z.string().max(10_000).optional().default(''),
    expectedOutput: z.string().max(10_000).optional().nullable(),
  }),
});

// GET /api/compiler/languages — public, no auth needed (used by activity builder picker)
router.get('/languages', compilerController.getSupportedLanguages);

// POST /api/compiler/run — authenticated; rate-limited by the server via natural polling delay
router.post('/run', authenticate, validate(runCodeSchema), compilerController.runCode);

export default router;
