import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { checkAndDeductTokens } from '../middlewares/token.middleware.js';
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

// Protect all routes
router.use(authenticate);

// --- CONVERSATIONS ---
router.get('/conversations/material/:materialId', getConversations);
router.post('/conversations', createConversation);
router.delete('/conversations/:id', deleteConversation);
router.patch('/conversations/:id/save', toggleSaveConversation);

router.get('/conversations/:conversationId/messages', getMessages);
// Sending a message deducts tokens, so we apply the token middleware here
router.post('/conversations/:conversationId/messages', checkAndDeductTokens, sendMessage);

// --- STUDY MATERIALS ---
router.get('/study-materials/material/:materialId', getSavedMaterials);
router.post('/study-materials', saveStudyMaterial);
router.delete('/study-materials/:id', deleteSavedMaterial);

export default router;
