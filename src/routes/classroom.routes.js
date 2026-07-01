/**
 * ─── Classroom Routes ─────────────────────────────────────────────────────────
 *
 * Handles all classroom management endpoints.
 *
 * ─── IMPORTANT: Route Ordering ───────────────────────────────────────────────
 * Express matches routes in the ORDER they are registered. Static path segments
 * (like `/my-rooms`) MUST be defined BEFORE dynamic parameters (like `/:code`).
 *
 * If `GET /:code` were registered first, Express would match the literal strings
 * "my-rooms" and "joined-rooms" as values of the `:code` parameter, making those
 * specific routes permanently unreachable. They are therefore placed first below.
 *
 * Endpoints:
 *  GET    /classrooms/my-rooms          — Get classrooms owned by the current user
 *  GET    /classrooms/joined-rooms      — Get classrooms the current user has joined
 *  GET    /classrooms/:code             — Look up a classroom by its room code (auth required)
 *  POST   /classrooms/                  — Create a new classroom
 *  PUT    /classrooms/:id              — Update a classroom (owner only, enforced in service)
 *  DELETE /classrooms/:id              — Soft-delete a classroom (owner only, enforced in service)
 *  POST   /classrooms/:id/invite       — Generate a 24-hour invite link (owner only)
 *  POST   /classrooms/join/:token      — Join a classroom via invite link or room code
 *  DELETE /classrooms/:id/leave        — Leave a classroom (non-owners only)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Router } from 'express';
import { z } from 'zod';
import * as classroomController from '../controllers/classroom.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { authenticate } from '../middlewares/auth.middleware.js';

const router = Router();

// ─── Validation Schemas ───────────────────────────────────────────────────────

/**
 * Schema for creating a classroom.
 * Private rooms must have a password; public rooms must not.
 * (This business rule is also enforced in the service layer as a second check.)
 */
const createRoomSchema = z.object({
  body: z.object({
    name:         z.string().min(1, 'Classroom name is required'),
    description:  z.string().optional(),
    private:      z.boolean(),
    roomPassword: z.string().optional(),
  }),
});

/**
 * Schema for updating a classroom.
 * All fields are optional (PATCH-style update).
 * oldPassword is required if changing an existing password.
 */
const updateRoomSchema = z.object({
  body: z.object({
    name:         z.string().min(1).optional(),
    description:  z.string().optional(),
    status:       z.enum(['ACTIVE', 'INACTIVE']).optional(),
    private:      z.boolean().optional(),
    roomPassword: z.string().optional(),
    oldPassword:  z.string().optional(),
  }),
});

// ─── Routes ───────────────────────────────────────────────────────────────────
// NOTE: Static named routes (/my-rooms, /joined-rooms) MUST come before /:code
// to prevent Express from treating them as room code parameter values.

// Static named routes — registered FIRST to avoid being shadowed by /:code
router.get('/my-rooms',     authenticate, classroomController.getRoomsbyUserId);
router.get('/joined-rooms', authenticate, classroomController.getRoomsbyUserJoined);

// Dynamic code route — registered AFTER static routes
// Requires auth to prevent unauthenticated enumeration of classrooms and their member lists
router.get('/:code', authenticate, classroomController.getRoomsbyCode);

// CRUD operations
router.post('/',             authenticate, validate(createRoomSchema), classroomController.createRooms);
router.put('/:id',           authenticate, validate(updateRoomSchema), classroomController.updateRooms);
router.delete('/:id',        authenticate, classroomController.deleteRooms);

// Invite & join flows
router.post('/:id/invite',   authenticate, classroomController.generateInviteLink);
router.post('/join/:token',  authenticate, classroomController.joinRoomViaInvite);

// Leave a classroom
router.delete('/:id/leave',  authenticate, classroomController.leaveRoom);

// Remove a member (Owner only)
router.delete('/:id/members/:userId', authenticate, classroomController.removeMember);

export default router;