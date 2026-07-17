/**
 * ─── Authentication Controller ────────────────────────────────────────────────
 *
 * Handles user registration, login, session management, and credential updates.
 *
 * Security design decisions:
 *  - JWT is delivered ONLY via an httpOnly cookie — it is intentionally NOT
 *    included in the JSON response body. This prevents the token from being
 *    captured by JavaScript, browser logs, or frontend state management.
 *  - Cookies are set with Secure=true in production (HTTPS-only) and
 *    SameSite=None in production to support cross-origin requests between
 *    a separate frontend domain and this API.
 *  - In development, SameSite=Lax is used to work with http://localhost.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as authService from '../services/auth.service.js';

/**
 * Builds the cookie options based on the current environment.
 * Production requires Secure + SameSite=None for cross-origin cookies.
 * Development uses SameSite=Lax to work over plain HTTP on localhost.
 */
const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,                                        // Not accessible via document.cookie
    secure: isProduction,                                  // HTTPS-only in production
    sameSite: isProduction ? 'None' : 'Lax',              // None = cross-origin; Lax = same-site (dev)
    maxAge: 24 * 60 * 60 * 1000,                          // 1 day in milliseconds
  };
};

/**
 * POST /auth/register
 * Creates a new user account and issues a session cookie.
 * Returns user data (id + email) — the JWT is in the cookie only.
 */
export const register = async (req, res, next) => {
  try {
    const result = await authService.registerUser(req.body);

    // Set the JWT as a secure httpOnly cookie — do NOT expose it in the response body
    res.cookie('token', result.token, getCookieOptions());

    // Return the user's data and token so the frontend can use the Authorization header fallback
    res.status(201).json({ user: result.user, token: result.token });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/login
 * Authenticates an existing user and issues a session cookie.
 * Returns user data (id + email) — the JWT is in the cookie only.
 */
export const login = async (req, res, next) => {
  try {
    const result = await authService.loginUser(req.body);

    // Set the JWT as a secure httpOnly cookie — do NOT expose it in the response body
    res.cookie('token', result.token, getCookieOptions());

    // Return 200 OK and include the token for the Authorization header fallback
    res.status(200).json({ user: result.user, token: result.token });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /auth/me
 * Returns the currently authenticated user's basic info.
 * Requires: authenticate middleware (sets req.user).
 */
export const getMe = async (req, res, next) => {
  try {
    const profile = await authService.getUserProfile(req.user.id);
    res.status(200).json({
      user: {
        id: req.user.id,
        email: req.user.email,
        isEmailVerified: req.user.isEmailVerified,
        hasProfile: !!profile,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/logout
 * Ends the user's session by clearing the auth cookie.
 * Requires: authenticate middleware (user must be logged in to log out).
 */
export const logout = async (req, res, next) => {
  try {
    // Clear the cookie with the same options it was set with
    res.clearCookie('token', getCookieOptions());
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/request-email-update
 * Validates current password and sends an OTP to the new email.
 */
export const requestEmailUpdate = async (req, res, next) => {
  try {
    const { currentPassword, newEmail } = req.body;
    await authService.requestEmailUpdateUser(req.user.id, currentPassword, newEmail);
    res.status(200).json({
      message: 'Verification code sent to the new email address'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /auth/update-email
 * Verifies the OTP and applies the pending email change.
 */
export const updateEmail = async (req, res, next) => {
  try {
    const { otp } = req.body;
    const updatedUser = await authService.updateEmailUser(req.user.id, otp);
    res.status(200).json({
      message: 'Email updated successfully',
      user: updatedUser
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /auth/update-password
 * Updates the user's password after verifying their current password.
 * Requires: authenticate middleware.
 */
export const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.updatePasswordUser(req.user.id, currentPassword, newPassword);
    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/verify-email
 * Verifies the 6-digit OTP sent to the user's email.
 * Requires: authenticate middleware (so we know who is verifying).
 */
export const verifyEmail = async (req, res, next) => {
  try {
    const { otp } = req.body;
    await authService.verifyEmailOTP(req.user.id, otp);
    res.status(200).json({ message: 'Email verified successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/resend-verification
 * Resends the 6-digit OTP to the authenticated user.
 * Requires: authenticate middleware.
 */
export const resendVerification = async (req, res, next) => {
  try {
    await authService.resendVerificationEmail(req.user.id);
    res.status(200).json({ message: 'Verification email sent' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/forgot-password
 * Initiates the password reset flow by sending a 6-digit OTP.
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    await authService.requestPasswordReset(email);
    // Always return 200 even if email not found to prevent user enumeration
    res.status(200).json({ message: 'If an account exists with that email, a reset code has been sent.' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/verify-reset-otp
 * Verifies the 6-digit OTP before allowing the user to reset their password.
 */
export const verifyResetOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    await authService.checkResetOTP(email, otp);
    res.status(200).json({ message: 'OTP is valid' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /auth/reset-password
 * Verifies the 6-digit OTP and resets the password.
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    await authService.resetPasswordWithOTP(email, otp, newPassword);
    res.status(200).json({ message: 'Password has been reset successfully. You can now log in.' });
  } catch (error) {
    next(error);
  }
};
