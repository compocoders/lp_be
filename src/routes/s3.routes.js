import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import { uploadProfilePicture, uploadFile } from '../controllers/s3.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();

// Add file filter to only allow images
const fileFilter = (req, file, cb) => {
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
    const ext = file.originalname ? path.extname(file.originalname).toLowerCase() : '';
    
    if (file.mimetype.startsWith('image/') || allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Not an image! Please upload an image.'), false);
    }
};

const upload = multer({ 
    storage, 
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const genericUpload = multer({ 
    storage, 
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit for docs/files
});

router.post('/profile-picture', authenticate, upload.single('image'), uploadProfilePicture);
router.post('/upload', authenticate, genericUpload.single('file'), uploadFile);

export default router;
