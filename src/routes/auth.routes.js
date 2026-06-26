import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { z } from 'zod';

const router = Router();

const registerSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6),
 
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
});

const updateEmailSchema = z.object({
  body: z.object({
    currentPassword: z.string(),
    newEmail: z.string().email(),
  }),
});

const updatePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string(),
    newPassword: z.string().min(6),
  }),
});

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.get('/me', authenticate, authController.getMe);
router.post('/logout', authController.logout);

router.put('/update-email', authenticate, validate(updateEmailSchema), authController.updateEmail);
router.put('/update-password', authenticate, validate(updatePasswordSchema), authController.updatePassword);

export default router;
