import { Router } from 'express';
import authRoutes from './auth.routes.js';
import profileRoutes from './profile.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import s3Routes from './s3.routes.js';
import classroomRoutes from './classroom.routes.js';
import learningMaterialRoutes from './learningMaterials.routes.js';
const router = Router();

router.use('/auth', authRoutes);

router.use('/profile', profileRoutes);

router.use('/s3', s3Routes);

router.use('/learning-materials', learningMaterialRoutes);

//dashboard
router.use('/dashboard', dashboardRoutes);
router.use('/classrooms', classroomRoutes);

export default router;
