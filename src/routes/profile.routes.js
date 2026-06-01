import Router from 'express';
import * as profileController from '../controllers/profile.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { requiredProfile, requireNoProfile } from '../middlewares/profile.middleware.js';
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

const router = Router();
const profileSchema = z.object({
    body: z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        status: z.string().optional(),
        profilePicture: z.string().optional(),
    }),
});

router.post('/', authenticate, upload.single('image'), validate(profileSchema), requireNoProfile, profileController.createProfile);
router.put('/:_id', authenticate, upload.single('image'), validate(profileSchema), profileController.updateProfile);  
router.get('/', authenticate, profileController.getProfile); // This will return the profile of the currently authenticated user
router.get('/me', authenticate, profileController.getProfile);
router.get('/:id', authenticate, profileController.getProfileById);

export default router;