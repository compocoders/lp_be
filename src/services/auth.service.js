/**
 * ─── Authentication Service ───────────────────────────────────────────────────────────────────
 *
 * Contains all business logic for user authentication and credential management.
 *
 * Security notes:
 *  - Passwords are hashed with bcrypt (cost factor 10) before storing
 *  - Login uses a generic error message ('Invalid email or password') to avoid
 *    leaking whether an email address is registered in the system
 *  - Email uniqueness is checked at the service level (not just the DB constraint)
 *    to provide a helpful error message before hitting the DB unique violation
 * ─────────────────────────────────────────────────────────────────────────────
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { generateToken } from '../utils/jwt.js';
import { sendVerificationEmail, sendPasswordResetEmail, sendEmailUpdateOTP } from './email.service.js';

// Helper to generate a 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const registerUser = async (data) => {
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    throw new ApiError(400, 'Email already in use');
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);
  const otp = generateOTP();
  const otpExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  const user = await prisma.user.create({
    data: {
      email: data.email,
      password: hashedPassword,
      emailVerificationOTP: otp,
      emailVerificationOTPExpires: otpExpires,
    },
  });

  // Attempt to send email, but don't block registration if it fails
  try {
    await sendVerificationEmail(user.email, otp);
  } catch (error) {
    console.error('Failed to send verification email:', error);
  }

  const token = generateToken(user.id);
  
  return {
    user: {
      id: user.id,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
    },
    token,
  };
};

export const loginUser = async (data) => {
  const user = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (!user) {
    throw new ApiError(400, 'Invalid email or password');
  }

  const isPasswordValid = await bcrypt.compare(data.password, user.password);
  
  if (!isPasswordValid) {
    throw new ApiError(400, 'Invalid email or password');
  }

  const token = generateToken(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
    },
    token,
  };
};

export const requestEmailUpdateUser = async (userId, currentPassword, newEmail) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');

  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordValid) throw new ApiError(400, 'Incorrect current password');

  const emailExists = await prisma.user.findUnique({ where: { email: newEmail } });
  if (emailExists && emailExists.id !== userId) {
    throw new ApiError(400, 'Email is already in use by another account');
  }

  const otp = generateOTP();
  const otpExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.user.update({
    where: { id: userId },
    data: {
      pendingNewEmail: newEmail,
      updateEmailOTP: otp,
      updateEmailOTPExpires: otpExpires,
    }
  });

  try {
    await sendEmailUpdateOTP(newEmail, otp);
  } catch (error) {
    console.error('Failed to send email update OTP:', error);
    throw new ApiError(500, 'Failed to send verification email to the new address.');
  }
};

export const updateEmailUser = async (userId, otp) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');
  if (!user.pendingNewEmail || !user.updateEmailOTP) {
    throw new ApiError(400, 'No pending email update found');
  }

  if (user.updateEmailOTP !== otp) {
    throw new ApiError(400, 'Invalid verification code');
  }

  if (user.updateEmailOTPExpires < new Date()) {
    throw new ApiError(400, 'Verification code has expired. Please try again.');
  }

  // Double check the new email isn't taken right before updating
  const emailExists = await prisma.user.findUnique({ where: { email: user.pendingNewEmail } });
  if (emailExists && emailExists.id !== userId) {
    throw new ApiError(400, 'Email is already in use by another account');
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { 
      email: user.pendingNewEmail,
      pendingNewEmail: null,
      updateEmailOTP: null,
      updateEmailOTPExpires: null,
    }
  });

  return { id: updatedUser.id, email: updatedUser.email };
};

export const updatePasswordUser = async (userId, currentPassword, newPassword) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');

  const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
  if (!isPasswordValid) throw new ApiError(400, 'Incorrect current password');

  const hashedNewPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedNewPassword }
  });
};

export const getUserProfile = async (userId) => {
  return prisma.profile.findUnique({ where: { userId } });
};

export const verifyEmailOTP = async (userId, otp) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');
  if (user.isEmailVerified) throw new ApiError(400, 'Email is already verified');

  if (user.emailVerificationOTP !== otp) {
    throw new ApiError(400, 'Invalid verification code');
  }
  
  if (user.emailVerificationOTPExpires < new Date()) {
    throw new ApiError(400, 'Verification code has expired. Please request a new one.');
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      isEmailVerified: true,
      emailVerificationOTP: null,
      emailVerificationOTPExpires: null,
    },
  });
};

export const resendVerificationEmail = async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, 'User not found');
  if (user.isEmailVerified) throw new ApiError(400, 'Email is already verified');

  const otp = generateOTP();
  const otpExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerificationOTP: otp,
      emailVerificationOTPExpires: otpExpires,
    },
  });

  await sendVerificationEmail(user.email, otp);
};

export const requestPasswordReset = async (email) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return; // Silent return for security

  const otp = generateOTP();
  const otpExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetOTP: otp,
      passwordResetOTPExpires: otpExpires,
    },
  });

  try {
    await sendPasswordResetEmail(user.email, otp);
  } catch (error) {
    console.error('Failed to send password reset email:', error);
  }
};

export const checkResetOTP = async (email, otp) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new ApiError(400, 'Invalid or expired reset code');

  if (user.passwordResetOTP !== otp) {
    throw new ApiError(400, 'Invalid reset code');
  }

  if (user.passwordResetOTPExpires < new Date()) {
    throw new ApiError(400, 'Reset code has expired. Please request a new one.');
  }
};

export const resetPasswordWithOTP = async (email, otp, newPassword) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new ApiError(400, 'Invalid or expired reset code');

  if (user.passwordResetOTP !== otp) {
    throw new ApiError(400, 'Invalid reset code');
  }

  if (user.passwordResetOTPExpires < new Date()) {
    throw new ApiError(400, 'Reset code has expired. Please request a new one.');
  }

  const hashedNewPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedNewPassword,
      passwordResetOTP: null,
      passwordResetOTPExpires: null,
    },
  });
};
