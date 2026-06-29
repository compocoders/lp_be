/**
 * ─── Profile Routes ───────────────────────────────────────────────────────────────────
 *
 * Handles user profile creation, updates, and retrieval.
 *
 * Endpoints:
 *  POST /profile/              — Create a profile (one per user, enforced by requireNoProfile)
 *  PUT  /profile/me            — Update the current user's own profile
 *  GET  /profile/              — Get the current user's profile
 *  GET  /profile/me            — Same as above (alias for cleaner URLs)
 *  GET  /profile/:id           — Get any user's public profile by profile ID
 *
 * All routes require authentication. Profile mutations are tied to req.user.id
 * server-side, so a user can ONLY modify their own profile regardless of what
 * ID they send in the request.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Router } from 'express';
import * as profileController from '../controllers/profile.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requireNoProfile } from '../middlewares/profile.middleware.js';
import { z } from 'zod';
import multer from 'multer';

const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Not an image! Please upload an image.'), false);
    }
};
const upload = multer({ 
    storage, 
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

// ─── Validation Schema ─────────────────────────────────────────────────────────

/**
 * Profile data schema.
 * All fields are optional so partial updates work on PUT /profile/me.
 * profilePicture is a URL string (the actual upload happens via multer before validation).
 */
const profileSchema = z.object({
    body: z.object({
        firstName:      z.string().max(100).optional(),
        lastName:       z.string().max(100).optional(),
        status:         z.string().max(200).optional(),
        profilePicture: z.string().optional(), // URL — set by the upload handler, not the client
    }),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

const router = Router();

// Create a profile (requireNoProfile blocks duplicate creation)
router.post('/',   authenticate, upload.single('profilePicture'), validate(profileSchema), requireNoProfile, profileController.createProfile);

// Update the current user's profile
// NOTE: This route was previously PUT /:_id — the :_id param was intentionally
// ignored by the controller (it always uses req.user.id). Renamed to /me to
// make the API surface clearer and prevent confusion.
router.put('/me',  authenticate, upload.single('profilePicture'), validate(profileSchema), profileController.updateProfile);

// Get profiles
router.get('/',    authenticate, profileController.getProfile);    // Returns current user's profile
router.get('/me',  authenticate, profileController.getProfile);    // Alias for the above
router.get('/:id', authenticate, profileController.getProfileById); // Returns any user's public profile by ID

export default router;