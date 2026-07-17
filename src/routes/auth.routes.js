import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { z } from 'zod';

const router = Router();

const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address'),
  }),
});

const verifyResetOtpSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address'),
    otp: z.string().length(6, 'OTP must be exactly 6 digits'),
  }),
});

const resetPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Please provide a valid email address'),
    otp: z.string().length(6, 'OTP must be exactly 6 digits'),
    newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  }),
});

const verifyEmailSchema = z.object({
  body: z.object({
    otp: z.string().length(6, 'OTP must be exactly 6 digits'),
  }),
});

const requestEmailUpdateSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newEmail: z.string().email('Please provide a valid new email address'),
  }),
});

const updateEmailSchema = z.object({
  body: z.object({
    otp: z.string().length(6, 'OTP must be exactly 6 digits'),
  }),
});

const updatePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  }),
});

// Auth Routes
router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.get('/me', authenticate, authController.getMe);
router.post('/logout', authenticate, authController.logout);

// Password Reset Routes
router.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/verify-reset-otp', validate(verifyResetOtpSchema), authController.verifyResetOTP);
router.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);

// Email Verification Routes
router.post('/verify-email', authenticate, validate(verifyEmailSchema), authController.verifyEmail);
router.post('/resend-verification', authenticate, authController.resendVerification);

// Protected Profile & Settings Routes
router.post('/request-email-update', authenticate, validate(requestEmailUpdateSchema), authController.requestEmailUpdate);
router.put('/update-email', authenticate, validate(updateEmailSchema), authController.updateEmail);
router.put('/update-password', authenticate, validate(updatePasswordSchema), authController.updatePassword);

export default router;
