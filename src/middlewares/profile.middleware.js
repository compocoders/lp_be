/**
 * ─── Profile Middleware ───────────────────────────────────────────────────────
 *
 *  `requireNoProfile` — Blocks the request if the user ALREADY has a profile.
 *                       Use on the "create profile" route to prevent duplicate profiles.
 *
 * This middleware depends on the `authenticate` middleware having already run
 * (it requires `req.user.id` to be set).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ApiError } from '../utils/ApiError.js';
import { prisma } from '../config/db.js';


/**
 * Middleware that BLOCKS the request if the user already has a profile.
 *
 * This is the inverse of `requiredProfile`. It gates the "create profile"
 * endpoint to ensure each user can only create one profile.
 *
 * If a profile already exists, responds with 403 and a `PROFILE_ALREADY_EXISTS`
 * code so the frontend can redirect the user to the edit page instead.
 */
export const requireNoProfile = async (req, res, next) => {
  try {
    // Safety check: authenticate middleware must have run first
    if (!req.user || !req.user.id) {
      throw new ApiError(401, 'Unauthorized - User not authenticated');
    }

    // Check if this user already has a profile
    const profile = await prisma.profile.findUnique({
      where: { userId: req.user.id },
    });

    if (profile) {
      // Block the request — a profile already exists for this user
      return res.status(403).json({
        success: false,
        code: 'PROFILE_ALREADY_EXISTS',
        message: 'You already have a profile. Use the update endpoint instead.'
      });
    }

    // No profile found — allow the creation request to proceed
    next();
  } catch (error) {
    next(error);
  }
};
