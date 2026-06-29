/**
 * ─── Authentication Middleware ────────────────────────────────────────────────
 *
 * The `authenticate` middleware verifies that a request has a valid JWT session
 * before allowing it to proceed to the controller.
 *
 * Token lookup order (supports both cookie-based and header-based auth):
 *  1. httpOnly cookie named `token` (preferred — more secure, not accessible to JS)
 *  2. Authorization header with Bearer scheme (fallback — for API clients/Postman)
 *
 * On success, attaches the full user record to `req.user` so downstream
 * middleware and controllers can access `req.user.id`, `req.user.email`, etc.
 *
 * On failure (no token, expired token, deleted user), responds with 401.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { verifyToken } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';
import { prisma } from '../config/db.js';

/**
 * Express middleware that authenticates incoming requests via JWT.
 *
 * Usage: Add as the first middleware on any route that requires a logged-in user.
 * @example router.get('/profile', authenticate, profileController.getProfile);
 */
export const authenticate = async (req, res, next) => {
  try {
    let token;

    // Priority 1: httpOnly cookie (set by login/register — not accessible to JavaScript)
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }
    // Priority 2: Authorization header (for API clients, Postman, server-to-server calls)
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // If no token was found in either location, reject the request
    if (!token) {
      throw new ApiError(401, 'Unauthorized - No token provided');
    }

    // Verify the token signature and expiry using the shared JWT secret
    const decoded = verifyToken(token);

    if (!decoded || !decoded.userId) {
      throw new ApiError(401, 'Unauthorized - Invalid token');
    }

    // Confirm the user still exists in the database
    // (handles the case where a user was deleted after a token was issued)
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      throw new ApiError(401, 'Unauthorized - User not found');
    }

    // Attach the user record to the request for use by downstream handlers
    req.user = user;
    next();
  } catch (error) {
    // Return a generic 401 for all auth failures to avoid leaking information
    // about whether the token is invalid vs. the user doesn't exist
    next(new ApiError(401, 'Unauthorized'));
  }
};
