/**
 * ─── AI Studio Controller ────────────────────────────────────────────────────
 *
 * Handles the AI-powered study session features:
 *  - Conversations: Multi-turn chat sessions tied to a learning material
 *  - Messages: Individual messages within a conversation
 *  - Study Materials: AI-generated notes/quizzes saved by the user
 *
 * ─── Security Model ──────────────────────────────────────────────────────────
 *
 * Every mutation and read operation MUST verify resource ownership before acting.
 * Pattern used: Prisma `where: { id, userId: req.user.id }` — if 0 rows match,
 * the resource either doesn't exist OR belongs to another user. Either way we
 * return 403 to avoid leaking information about whether the ID exists at all.
 *
 * This pattern prevents IDOR (Insecure Direct Object Reference) attacks where
 * an attacker guesses or enumerates UUIDs to access other users' data.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { prisma } from '../config/db.js';
import { generateContentWithRetry, getFlashModel } from '../services/ai.service.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
import { parseFileForGemini, s3Client } from './ai.controller.js';

/**
 * System-level instruction prepended to every AI conversation.
 * Sets the personality and formatting rules for the Likhâ AI tutor.
 */
const systemInstruction = "You are Likhâ, a friendly, human-like AI tutor. Your goal is to help students and teachers study their learning materials. Provide highly accurate information, but deliver it in a natural, conversational, and empathetic tone. Avoid sounding overly robotic, rigid, or excessively structured (like starting every point with a bullet unless necessary). Speak as if you are a real human tutor sitting next to them. CRITICAL INSTRUCTION: Write the response entirely in plain, natural human text. DO NOT use any Markdown formatting. DO NOT use asterisks (*), hashes (#), or any special formatting symbols. Use natural paragraph spacing.";

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /studio/conversations/material/:materialId
 *
 * Returns all conversations the authenticated user has for a specific
 * learning material. Only shows saved conversations or those from the
 * last 30 days (older unsaved ones are hidden to reduce clutter).
 *
 * Ownership is enforced via `userId: req.user.id` in the Prisma query.
 */
export const getConversations = async (req, res, next) => {
  try {
    const { materialId } = req.params;

    const conversations = await prisma.aiConversation.findMany({
      where: {
        learningMaterialId: materialId,
        userId: req.user.id, // Only return THIS user's conversations
        OR: [
          { isSaved: true },  // Always show saved conversations
          { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } // Show last 30 days
        ]
      },
      orderBy: { updatedAt: 'desc' }
    });

    res.status(200).json(conversations);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /studio/conversations
 *
 * Creates a new AI conversation session linked to a learning material.
 * The userId is always taken from req.user (never from the request body)
 * to prevent users from creating conversations on behalf of others.
 */
export const createConversation = async (req, res, next) => {
  try {
    const { materialId, title } = req.body;

    const conversation = await prisma.aiConversation.create({
      data: {
        learningMaterialId: materialId,
        userId: req.user.id,           // Always use the authenticated user's ID
        title: title || 'New Conversation'
      }
    });

    res.status(201).json(conversation);
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /studio/conversations/:id
 *
 * Deletes a conversation. Uses `deleteMany` with both `id` AND `userId`
 * so a user can never delete another user's conversation — if 0 rows
 * are deleted, the response is 403 (access denied).
 */
export const deleteConversation = async (req, res, next) => {
  try {
    const { id } = req.params;

    // SECURITY: Include userId in the where clause so users can only delete their own conversations
    const result = await prisma.aiConversation.deleteMany({
      where: {
        id,
        userId: req.user.id,  // Ownership check — prevents IDOR
      }
    });

    // If count is 0, either the conversation doesn't exist or it belongs to another user
    if (result.count === 0) {
      return res.status(403).json({ error: 'Conversation not found or access denied' });
    }

    res.status(200).json({ message: 'Conversation deleted' });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /studio/conversations/:id/save
 *
 * Toggles the `isSaved` flag on a conversation. Uses `updateMany` with
 * both `id` AND `userId` to enforce ownership.
 */
export const toggleSaveConversation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isSaved } = req.body;

    // SECURITY: Include userId in the where clause so users can only update their own conversations
    const result = await prisma.aiConversation.updateMany({
      where: {
        id,
        userId: req.user.id,  // Ownership check — prevents IDOR
      },
      data: { isSaved }
    });

    // If count is 0, conversation doesn't exist or belongs to another user
    if (result.count === 0) {
      return res.status(403).json({ error: 'Conversation not found or access denied' });
    }

    // Return the updated conversation so the frontend can update its local state
    const updated = await prisma.aiConversation.findUnique({ where: { id } });
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /studio/conversations/:conversationId/messages
 *
 * Returns all messages in a conversation. Before returning messages, we
 * verify that the conversation belongs to the requesting user to prevent
 * one user from reading another user's chat history.
 */
export const getMessages = async (req, res, next) => {
  try {
    const { conversationId } = req.params;

    // SECURITY: Verify the conversation belongs to this user before returning messages
    const conversation = await prisma.aiConversation.findUnique({
      where: { id: conversationId }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (conversation.userId !== req.user.id) {
      // Return 403 (not 404) so users know they found a resource they don't own
      return res.status(403).json({ error: 'Access denied — this conversation belongs to another user' });
    }

    // Ownership confirmed — return messages in chronological order
    const messages = await prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' }
    });

    res.status(200).json(messages);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /studio/conversations/:conversationId/messages
 *
 * Sends a user message, calls the Gemini AI with conversation history and
 * the linked learning material as context, saves both messages to the DB,
 * deducts tokens from the user's daily wallet, and returns the AI's reply.
 *
 * On the first message in a new conversation, a title is also generated.
 *
 * Security checks:
 *  - Conversation must belong to the requesting user (IDOR prevention)
 *  - Message text is capped at 2000 characters (enforced by Zod in routes)
 *  - Token wallet is checked before calling the AI (enforced by token middleware)
 */
export const sendMessage = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { text } = req.body;

    // 1. Fetch the conversation and verify ownership
    const conversation = await prisma.aiConversation.findUnique({
      where: { id: conversationId },
      include: { LearningMaterial: true }
    });

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // SECURITY: Ensure the conversation belongs to the requesting user
    if (conversation.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied — this conversation belongs to another user' });
    }

    // 2. Optionally fetch and parse the linked learning material for context
    let materialContext = '';
    let inlineData = null;

    if (conversation.LearningMaterial?.fileUrl) {
      const key = conversation.LearningMaterial.fileUrl.replace(env.R2_PUBLIC_URL + '/', '');
      try {
        const command = new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key });
        const s3Response = await s3Client.send(command);
        const fileBuffer = await s3Response.Body.transformToByteArray();
        const parsed = await parseFileForGemini(key, fileBuffer);
        materialContext = parsed.extractedText;
        inlineData = parsed.inlineData;
      } catch (e) {
        // Non-fatal: if we can't parse the material, we continue without context
        console.error('Failed to parse material for studio', e);
      }
    }

    // 3. Save the user's message to the database
    await prisma.aiMessage.create({
      data: {
        conversationId,
        sender: 'user',
        content: text
      }
    });

    // 4. Fetch recent conversation history (last 10 messages) for context
    const history = await prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 10 // Limit history to keep prompt size manageable
    });

    // 5. Build the prompt: system instruction + material context + chat history
    let promptText = `System: ${systemInstruction}\n\n`;

    if (materialContext) {
      // Trim material to 30,000 chars to stay within token budget
      const textStr = typeof materialContext === 'string' ? materialContext : String(materialContext);
      promptText += `Context Material:\n"""\n${textStr.substring(0, 30000)}\n"""\n\n`;
    }

    promptText += 'Chat History:\n';
    history.forEach(msg => {
      promptText += `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
    });
    promptText += '\nAssistant:';

    const parts = [];
    if (inlineData) parts.push({ inlineData });
    parts.push({ text: promptText });

    // 6. Call the AI model (with retry logic and token budget enforcement)
    const primaryModel = getFlashModel();
    const result = await generateContentWithRetry(primaryModel, parts, req.tokenWallet);
    const aiReply = result.response.text();

    // 7. Save the AI's reply to the database
    const aiMessage = await prisma.aiMessage.create({
      data: {
        conversationId,
        sender: 'ai',
        content: aiReply
      }
    });

    // 8. Update the conversation's updatedAt timestamp
    await prisma.aiConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() }
    });

    // 9. Deduct tokens from the user's daily wallet
    let tokensToDeduct = 10; // Fallback if usage metadata is unavailable
    if (result.response.usageMetadata) {
      tokensToDeduct = Math.max(1, Math.floor(result.response.usageMetadata.totalTokenCount / 10));
    }
    if (req.tokenWallet) {
      await req.tokenWallet.deductTokens(tokensToDeduct);
    }

    // 10. Generate a conversation title on the FIRST message only (runs once per conversation)
    let newTitle = undefined;
    if (history.length === 1) {
      // history.length is 1 because we just saved the user message above and re-fetched
      try {
        const titleResult = await getFlashModel().generateContent(
          `Generate a short, concise 2-4 word title for a conversation that starts with this message: "${text.substring(0, 500)}". Reply ONLY with the title. Do not use quotes or special formatting.`
        );
        newTitle = titleResult.response.text().trim().replace(/["'*]/g, '');
        if (newTitle.length > 50) newTitle = newTitle.substring(0, 50); // Safety length cap

        // Save the generated title to the conversation
        await prisma.aiConversation.update({
          where: { id: conversationId },
          data: { title: newTitle }
        });
      } catch (e) {
        // Non-fatal: if title generation fails, the conversation keeps its default title
        console.error('Failed to generate conversation title', e);
      }
    }

    res.status(200).json({
      reply: aiMessage.content,
      remainingTokens: req.tokenWallet ? req.tokenWallet.availableTokens - tokensToDeduct : undefined,
      title: newTitle   // Only present on the first message; undefined otherwise
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STUDY MATERIALS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /studio/study-materials/material/:materialId
 *
 * Returns all AI-generated study materials (notes, quizzes) that the
 * authenticated user has saved for a specific learning material.
 * Ownership is enforced via `userId: req.user.id` in the Prisma query.
 */
export const getSavedMaterials = async (req, res, next) => {
  try {
    const { materialId } = req.params;

    const materials = await prisma.aiStudyMaterial.findMany({
      where: {
        learningMaterialId: materialId,
        userId: req.user.id,  // Only return THIS user's saved materials
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json(materials);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /studio/study-materials
 *
 * Saves an AI-generated study material (e.g., notes or a quiz) to the user's
 * collection. The userId is always taken from req.user to prevent forgery.
 */
export const saveStudyMaterial = async (req, res, next) => {
  try {
    const { materialId, type, content } = req.body;

    const saved = await prisma.aiStudyMaterial.create({
      data: {
        learningMaterialId: materialId,
        userId: req.user.id,  // Always use the authenticated user's ID
        type,
        content
      }
    });

    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /studio/study-materials/:id
 *
 * Deletes a saved study material. Uses `deleteMany` with both `id` AND
 * `userId` so a user can never delete another user's saved materials.
 */
export const deleteSavedMaterial = async (req, res, next) => {
  try {
    const { id } = req.params;

    // SECURITY: Include userId in the where clause so users can only delete their own materials
    const result = await prisma.aiStudyMaterial.deleteMany({
      where: {
        id,
        userId: req.user.id,  // Ownership check — prevents IDOR
      }
    });

    // If count is 0, the material doesn't exist or belongs to another user
    if (result.count === 0) {
      return res.status(403).json({ error: 'Study material not found or access denied' });
    }

    res.status(200).json({ message: 'Saved material deleted' });
  } catch (error) {
    next(error);
  }
};
