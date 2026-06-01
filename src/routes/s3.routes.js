import { Router } from 'express';
import multer from 'multer';
import { uploadProfilePicture } from '../controllers/s3.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();

// Add file filter to only allow images
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
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

router.post('/profile-picture', authenticate, upload.single('image'), uploadProfilePicture);

export default router;
