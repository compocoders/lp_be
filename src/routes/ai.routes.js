import { Router } from 'express';
import { chatWithDocument, generateActivity, generateStudyMaterial, gradeWithAI, ideaSpark, getTokenInfo } from '../controllers/ai.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { checkAndDeductTokens } from '../middlewares/token.middleware.js';

const router = Router();

// All AI routes require authentication
router.use(authenticate);

// Get token info (does NOT deduct tokens)
router.get('/token-info', getTokenInfo);

// The rest require token deduction
router.use(checkAndDeductTokens);

router.post('/chat-document', chatWithDocument);
router.post('/generate-activity', generateActivity);
router.post('/generate-study-material', generateStudyMaterial);
router.post('/grade-submission', gradeWithAI);
router.post('/idea-spark', ideaSpark);

export default router;
