import { Router } from 'express';
import authRoutes from './auth.routes.js';
import profileRoutes from './profile.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import s3Routes from './s3.routes.js';
import classroomRoutes from './classroom.routes.js';
import learningMaterialRoutes from './learningMaterials.routes.js';
import activityRoutes from './activity.routes.js';
import compilerRoutes from './compiler.routes.js';
import aiRoutes from './ai.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/s3', s3Routes);
router.use('/learning-materials', learningMaterialRoutes);

// Dashboard & Classrooms
router.use('/dashboard', dashboardRoutes);
router.use('/classrooms', classroomRoutes);

// Activities, Submissions & Gradebook
router.use('/', activityRoutes);

// Code Execution (Judge0 proxy)
router.use('/compiler', compilerRoutes);

import aiStudioRoutes from './aiStudio.routes.js';

// AI Features
router.use('/ai', aiRoutes);
router.use('/studio', aiStudioRoutes);

export default router;

