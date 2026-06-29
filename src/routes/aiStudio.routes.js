/**
 * ─── AI Studio Routes ─────────────────────────────────────────────────────────
 *
 * All routes require authentication. Token deduction is only applied to
 * the `sendMessage` endpoint (the only one that calls the AI model).
 *
 * Rate limiting (aiLimiter) is applied to all routes to prevent burst abuse.
 *
 * Endpoints:
 *  GET    /studio/conversations/material/:materialId          — List user's conversations for a material
 *  POST   /studio/conversations                              — Start a new conversation
 *  DELETE /studio/conversations/:id                          — Delete a conversation (owner only)
 *  PATCH  /studio/conversations/:id/save                     — Toggle save status (owner only)
 *  GET    /studio/conversations/:conversationId/messages     — Get conversation messages (owner only)
 *  POST   /studio/conversations/:conversationId/messages     — Send a message + get AI reply (deducts tokens)
 *  GET    /studio/study-materials/material/:materialId       — List user's saved study materials
 *  POST   /studio/study-materials                            — Save a new study material
 *  DELETE /studio/study-materials/:id                        — Delete a saved material (owner only)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middlewares/auth.middleware.js';
import { checkAndDeductTokens } from '../middlewares/token.middleware.js';
import { aiLimiter } from '../middlewares/rateLimiter.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  getConversations,
  createConversation,
  deleteConversation,
  getMessages,
  sendMessage,
  getSavedMaterials,
  saveStudyMaterial,
  deleteSavedMaterial,
  toggleSaveConversation
} from '../controllers/aiStudio.controller.js';

const router = Router();

// ─── Validation Schemas ───────────────────────────────────────────────────────

/**
 * Validates the body when starting a new conversation.
 * materialId must be a valid UUID; title is optional.
 */
const createConversationSchema = z.object({
  body: z.object({
    materialId: z.string().uuid('Invalid material ID'),
    title: z.string().max(100).optional(),
  }),
});

/**
 * Validates the body when sending a message.
 * Text is capped at 2000 characters to prevent oversized prompts that would
 * burn through the user's entire daily token budget in a single request.
 */
const sendMessageSchema = z.object({
  body: z.object({
    text: z.string()
      .min(1, 'Message cannot be empty')
      .max(2000, 'Message cannot exceed 2000 characters'),
  }),
});

/**
 * Validates the body when saving a study material.
 */
const saveStudyMaterialSchema = z.object({
  body: z.object({
    materialId: z.string().uuid('Invalid material ID'),
    type: z.enum(['quiz', 'notes'], { message: 'Type must be "quiz" or "notes"' }),
    content: z.string().min(1, 'Content cannot be empty').max(50000, 'Content is too long'),
  }),
});

// ─── Middleware Stack ─────────────────────────────────────────────────────────
// Every studio route requires authentication + rate limiting
router.use(authenticate);
router.use(aiLimiter);

// ─── Conversation Routes ──────────────────────────────────────────────────────

router.get( '/conversations/material/:materialId',          getConversations);
router.post('/conversations', validate(createConversationSchema),  createConversation);
router.delete('/conversations/:id',                         deleteConversation);
router.patch('/conversations/:id/save',                     toggleSaveConversation);
router.get(  '/conversations/:conversationId/messages',     getMessages);

// Sending a message deducts AI tokens — checkAndDeductTokens runs BEFORE sendMessage
router.post(
  '/conversations/:conversationId/messages',
  validate(sendMessageSchema),
  checkAndDeductTokens,
  sendMessage
);

// ─── Study Material Routes ────────────────────────────────────────────────────

router.get(   '/study-materials/material/:materialId',       getSavedMaterials);
router.post(  '/study-materials', validate(saveStudyMaterialSchema), saveStudyMaterial);
router.delete('/study-materials/:id',                        deleteSavedMaterial);

export default router;
