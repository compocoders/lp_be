import Router from 'express';
import * as profileController from '../controllers/profile.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { z } from 'zod';

const router = Router();
const profileSchema = z.object({
    body: z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        status: z.string().optional(),
        profilePicture: z.string().optional(),
    }),
});

router.post('/', authenticate, validate(profileSchema), profileController.createProfile);
router.put('/:_id', authenticate, validate(profileSchema), profileController.updateProfile);    
router.get('/me', authenticate, profileController.getProfile);
router.get('/:id', authenticate, profileController.getProfileById);

export default router;