import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import * as dashboardController from '../controllers/dashboard.controller.js';
import { z } from 'zod';
const router = Router();


router.get('/' , authenticate, authController.getMe);
router.get('/me', authenticate, dashboardController.getDashboardData);
export default router;