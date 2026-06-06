import {Router} from 'express'
import * as classroomController from '../controllers/classroom.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { z } from 'zod';

const router = Router();

const createRoomSchema = z.object({
    body: z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        private: z.boolean(),
        roomPassword: z.string().optional()
    }),
});

const updateRoomSchema = z.object({
    body: z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
        private: z.boolean().optional(),
        roomPassword: z.string().optional(),
        oldPassword: z.string().optional()
    }),
});

router.get('/:code', classroomController.getRoomsbyCode);
router.post('/', authenticate, validate(createRoomSchema), classroomController.createRooms);
router.get('/my-rooms', authenticate, classroomController.getRoomsbyUserId);
router.get('/joined-rooms', authenticate, classroomController.getRoomsbyUserJoined);
router.put('/:id', authenticate, validate(updateRoomSchema), classroomController.updateRooms);
router.delete('/:id', authenticate, classroomController.deleteRooms);
router.post('/:id/invite', authenticate, classroomController.generateInviteLink);
router.post('/join/:token', authenticate, classroomController.joinRoomViaInvite);
router.delete('/:id/leave', authenticate, classroomController.leaveRoom);

export default router;