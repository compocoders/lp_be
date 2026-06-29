/**
 * ─── AI Feature Routes ────────────────────────────────────────────────────────
 *
 * All routes in this file require authentication. Most also require tokens
 * (daily AI budget), enforced by the `checkAndDeductTokens` middleware.
 *
 * Rate limiting (aiLimiter) is applied to all routes:
 *  - Primary protection: daily token wallet (limits total AI spend per user)
 *  - Secondary protection: aiLimiter (prevents rapid-fire bursts of requests)
 *
 * Endpoints:
 *  GET  /ai/token-info           — Get remaining token balance (no tokens deducted)
 *  POST /ai/chat-document        — Chat with a learning material document (classroom member only)
 *  POST /ai/generate-activity    — Generate quiz/coding/essay activity content
 *  POST /ai/generate-study-material — Generate notes or quiz from a document (classroom member only)
 *  POST /ai/grade-submission     — AI-assisted grading (classroom OWNER only)
 *  POST /ai/idea-spark           — Generate creative teaching ideas for a topic
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Router } from 'express';
import { z } from 'zod';
import {
  chatWithDocument,
  generateActivity,
  generateStudyMaterial,
  gradeWithAI,
  ideaSpark,
  getTokenInfo
} from '../controllers/ai.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { checkAndDeductTokens } from '../middlewares/token.middleware.js';
import { aiLimiter } from '../middlewares/rateLimiter.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';

const router = Router();

// ─── Validation Schemas ───────────────────────────────────────────────────────

/**
 * Chat with document schema.
 * message is capped at 2000 chars to prevent token abuse.
 * modelType defaults to 'flash' (cheaper); 'pro' is also accepted.
 */
const chatDocumentSchema = z.object({
  body: z.object({
    message:    z.string().min(1).max(2000, 'Message cannot exceed 2000 characters'),
    materialId: z.string().uuid('Invalid material ID'),
    modelType:  z.enum(['flash', 'pro']).optional().default('flash'),
  }),
});

/**
 * Generate activity schema.
 * topic is the main field — capped at 500 chars.
 * additionalInstructions is teacher-supplied text — capped at 1000 chars to
 * prevent prompt injection attempts from adding malicious system-level instructions.
 */
const generateActivitySchema = z.object({
  body: z.object({
    topic:                  z.string().min(1).max(500, 'Topic cannot exceed 500 characters'),
    gradeLevel:             z.string().min(1).max(100),
    type:                   z.string().optional().default('quiz'),
    additionalInstructions: z.string().max(1000, 'Additional instructions cannot exceed 1000 characters').optional().default(''),
    cssFramework:           z.string().optional().default('native'),
    codingLanguage:         z.string().optional().default('javascript'),
    difficulty:             z.string().optional().default('intermediate'),
    quizCount:              z.number().int().min(1).max(20).optional().default(5),
    quizType:               z.string().optional().default('multiple_choice'),
    problemCount:           z.number().int().min(1).max(10).optional().default(3),
    wordCount:              z.number().int().min(50).max(2000).optional().default(300),
    spreadsheetColumns:     z.number().int().min(2).max(10).optional().default(4),
    spreadsheetTask:        z.string().optional().default('mixed'),
  }),
});

/**
 * Generate study material schema.
 * type is either 'quiz' or 'notes'.
 */
const generateStudyMaterialSchema = z.object({
  body: z.object({
    materialId: z.string().uuid('Invalid material ID'),
    type:       z.enum(['quiz', 'notes'], { message: 'Type must be "quiz" or "notes"' }),
  }),
});

/**
 * Grade submission with AI schema.
 * submissionId must be a valid UUID.
 */
const gradeSubmissionSchema = z.object({
  body: z.object({
    submissionId: z.string().uuid('Invalid submission ID'),
  }),
});

/**
 * Idea spark schema.
 * topic is capped at 500 chars to prevent oversized prompts.
 */
const ideaSparkSchema = z.object({
  body: z.object({
    topic: z.string().min(1).max(500, 'Topic cannot exceed 500 characters'),
  }),
});

// ─── Middleware Stack ─────────────────────────────────────────────────────────
// All AI routes require authentication
router.use(authenticate);
// All AI routes are rate-limited (burst protection on top of the token wallet)
router.use(aiLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────

// Token info — does NOT call the AI and does NOT deduct tokens
router.get('/token-info', getTokenInfo);

// All routes below this line require tokens (calls the Gemini API)
router.use(checkAndDeductTokens);

router.post('/chat-document',         validate(chatDocumentSchema),         chatWithDocument);
router.post('/generate-activity',     validate(generateActivitySchema),     generateActivity);
router.post('/generate-study-material', validate(generateStudyMaterialSchema), generateStudyMaterial);
router.post('/grade-submission',      validate(gradeSubmissionSchema),      gradeWithAI);
router.post('/idea-spark',            validate(ideaSparkSchema),            ideaSpark);

export default router;
