import {Router} from 'express';
import * as learningMaterialController from '../controllers/learningMaterial.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import {z} from 'zod';
import multer from 'multer';

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

const createLearningMaterialSchema = z.object({
    body: z.object({
        title: z.string().min(1),
        description: z.string().optional(),
    }),
    params: z.object({
        classroomId: z.string().min(1),
    }),
});

const updateLearningMaterialSchema = z.object({
    body: z.object({
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        fileUrl: z.string().min(1).optional(),
    }),
    params: z.object({
        classroomId: z.string().min(1),
        learningMaterialId: z.string().min(1),
    }),
});

router.post('/:classroomId', authenticate, upload.single('file'), validate(createLearningMaterialSchema), learningMaterialController.createLearningMaterial);
router.get('/:classroomId', authenticate, learningMaterialController.getLearningMaterial);
router.get('/:classroomId/:learningMaterialId', authenticate, learningMaterialController.getLearningMaterialById);
router.put('/:classroomId/:learningMaterialId', authenticate, upload.single('file'), validate(updateLearningMaterialSchema), learningMaterialController.updateLearningMaterial);
router.delete('/:classroomId/:learningMaterialId', authenticate, learningMaterialController.deleteLearningMaterial);

export default router;
