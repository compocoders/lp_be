import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import * as activityController from '../controllers/activity.controller.js';
import * as submissionController from '../controllers/submission.controller.js';
import { ACTIVITY_TYPES, QUESTION_TYPES } from '../services/activity.service.js';

const router = Router();

// ─── Shared question sub-schema ───────────────────────────────────────────────
const questionSchema = z.object({
  questionType: z.enum(QUESTION_TYPES),
  content: z.string().min(1, 'Question content is required'),
  options: z
    .array(z.object({ id: z.string().optional(), text: z.string().min(1) }))
    .optional(),
  correctAnswer: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  points: z.number().int().min(0).default(10),
  order: z.number().int().min(0).optional(),
  config: z.record(z.unknown()).nullable().optional(),
});

// ─── Activity schemas ─────────────────────────────────────────────────────────
const createActivitySchema = z.object({
  params: z.object({ classroomId: z.string().uuid('Invalid classroom ID') }),
  body: z.object({
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().max(2000).optional(),
    activityType: z.enum(ACTIVITY_TYPES, { message: `Must be one of: ${ACTIVITY_TYPES.join(', ')}` }),
    deadline: z.string().datetime({ offset: true }).optional().nullable(),
    totalPoints: z.number().int().min(0).max(10_000).default(100),
    allowLate: z.boolean().default(false),
    maxAttempts: z.number().int().min(1).max(10).default(1),
    status: z.enum(['draft', 'published', 'closed']).optional().default('published'),
    config: z.record(z.unknown()).nullable().optional(),
    questions: z.array(questionSchema).min(0).max(100).default([]),
  }),
});

const updateActivitySchema = z.object({
  params: z.object({ activityId: z.string().uuid('Invalid activity ID') }),
  body: z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    activityType: z.enum(ACTIVITY_TYPES).optional(),
    deadline: z.string().datetime({ offset: true }).nullable().optional(),
    totalPoints: z.number().int().min(0).max(10_000).optional(),
    allowLate: z.boolean().optional(),
    maxAttempts: z.number().int().min(1).max(10).optional(),
    status: z.enum(['draft', 'published', 'closed']).optional(),
    config: z.record(z.unknown()).nullable().optional(),
    questions: z.array(questionSchema).min(0).max(100).optional(),
  }),
});

// ─── Submission schemas ───────────────────────────────────────────────────────

// Flexible answer content — each activity type sends a different shape
const answerContentSchema = z.union([
  // MC / radio
  z.object({ selectedId: z.string() }),
  // Checkbox
  z.object({ selectedIds: z.array(z.string()) }),
  // Short answer / essay
  z.object({ text: z.string() }),
  // Coding problem
  z.object({ code: z.string(), language: z.string(), output: z.string().optional() }),
  // File upload
  z.object({ fileUrl: z.string().url() }),
  // Spreadsheet
  z.object({ spreadsheetData: z.array(z.unknown()) }),
  // Frontend UI problem
  z.object({ 
    html: z.string().optional(), 
    css: z.string().optional(), 
    js: z.string().optional(), 
    cssFramework: z.string().optional() 
  }),
]);

const submitActivitySchema = z.object({
  params: z.object({ activityId: z.string().uuid('Invalid activity ID') }),
  body: z.object({
    answers: z
      .array(
        z.object({
          questionId: z.string().uuid('Invalid question ID'),
          content: answerContentSchema,
        })
      )
      .min(1, 'At least one answer is required'),
  }),
});

const gradeSubmissionSchema = z.object({
  params: z.object({ submissionId: z.string().uuid('Invalid submission ID') }),
  body: z.object({
    feedback: z.string().max(2000).optional(),
    answers: z
      .array(
        z.object({
          answerId: z.string().uuid(),
          score: z.number().int().min(0).optional(),
          feedback: z.string().max(1000).optional(),
        })
      )
      .optional(),
  }),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Classroom-scoped activity routes
router.post(
  '/classrooms/:classroomId/activities',
  authenticate,
  validate(createActivitySchema),
  activityController.createActivity
);

router.get(
  '/classrooms/:classroomId/activities',
  authenticate,
  activityController.listActivities
);

router.get(
  '/classrooms/:classroomId/gradebook',
  authenticate,
  submissionController.getClassroomGradebook
);

// Activity-scoped routes
router.get(
  '/activities/:activityId',
  authenticate,
  activityController.getActivity
);

router.patch(
  '/activities/:activityId',
  authenticate,
  validate(updateActivitySchema),
  activityController.updateActivity
);

router.patch(
  '/activities/:activityId/publish',
  authenticate,
  activityController.publishActivity
);

router.patch(
  '/activities/:activityId/close',
  authenticate,
  activityController.closeActivity
);

router.delete(
  '/activities/:activityId',
  authenticate,
  activityController.deleteActivity
);

// Submission routes
router.post(
  '/activities/:activityId/submit',
  authenticate,
  validate(submitActivitySchema),
  submissionController.submitActivity
);

router.get(
  '/activities/:activityId/submissions',
  authenticate,
  submissionController.getAllSubmissions
);

router.get(
  '/activities/:activityId/my-submission',
  authenticate,
  submissionController.getMySubmission
);

router.patch(
  '/submissions/:submissionId/grade',
  authenticate,
  validate(gradeSubmissionSchema),
  submissionController.gradeSubmission
);

// Student grade summary (across all classes)
router.get(
  '/grades/me',
  authenticate,
  submissionController.getStudentGrades
);

export default router;
