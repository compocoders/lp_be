import { Router } from 'express';
import authRoutes from './auth.routes.js';
import profileRoutes from './profile.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import s3Routes from './s3.routes.js';
const router = Router();

router.use('/auth', authRoutes);

router.use('/profile', profileRoutes);

router.use('/s3', s3Routes);

//dashboard

router.use('/dashboard', dashboardRoutes);
export default router;
