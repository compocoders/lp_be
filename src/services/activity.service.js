/**
 * ─── Activity Service ────────────────────────────────────────────────────────
 *
 * This service handles the core business logic for activities (quizzes, coding
 * problems, etc.) including creation, fetching, updating, and auto-grading.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { prisma } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';

// ─── Allowed values (kept in one place so validation and logic stay in sync) ──
export const ACTIVITY_TYPES = ['QUIZ', 'CODING', 'FRONTEND', 'SPREADSHEET', 'ESSAY', 'PROBLEM_SET', 'PRESENTATION', 'CASE_STUDY'];
export const QUESTION_TYPES = [
  'multiple_choice',
  'checkbox',
  'short_answer',
  'essay',
  'coding_problem',
  'frontend_problem',
  'spreadsheet_problem',
  'file_upload',
  'case_study_problem',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Verify that the requesting user is a member of the classroom.
 * Returns the classroomUser record (includes .role).
 */
export const assertClassroomMember = async (classroomId, userId) => {
  const member = await prisma.classroomUser.findUnique({
    where: { classroomId_userId: { classroomId, userId } },
  });
  if (!member) throw new ApiError(403, 'You are not a member of this classroom');
  return member;
};

/**
 * Verify that the requesting user is the OWNER of the classroom.
 * Note: Used internally by this service.
 * @param {string} classroomId
 * @param {string} userId
 * @returns {Promise<Object>} The classroom user member object
 */
const assertClassroomOwner = async (classroomId, userId) => {
  const member = await assertClassroomMember(classroomId, userId);
  if (member.role !== 'OWNER') throw new ApiError(403, 'Only the classroom owner can perform this action');
  return member;
};

/**
 * Verify that the requesting user created the activity (or is classroom owner).
 * Returns the activity.
 * Note: Used internally by this service.
 * @param {string} activityId
 * @param {string} userId
 * @returns {Promise<Object>} The activity object
 */
const assertActivityEditor = async (activityId, userId) => {
  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) throw new ApiError(404, 'Activity not found');

  if (activity.createdBy !== userId) {
    // Also allow classroom owner to manage any activity
    await assertClassroomOwner(activity.classroomId, userId);
  }
  return activity;
};

// ─── Auto-grading ─────────────────────────────────────────────────────────────

/**
 * Auto-grades a single answer against its question definition.
 * Returns { score, isAutoGraded }.
 * Returns null score for types that require manual grading (essay, file_upload, etc.)
 */
export const autoGradeAnswer = (question, answerContent) => {
  const { questionType, correctAnswer, points } = question;

  if (questionType === 'multiple_choice') {
    // correctAnswer is a single option id string
    const isCorrect = answerContent?.selectedId === correctAnswer;
    return { score: isCorrect ? points : 0, isAutoGraded: true };
  }

  if (questionType === 'checkbox') {
    // correctAnswer is a sorted array of option ids
    const correct = Array.isArray(correctAnswer) ? [...correctAnswer].sort() : [];
    const given = Array.isArray(answerContent?.selectedIds) ? [...answerContent.selectedIds].sort() : [];
    const isCorrect = JSON.stringify(correct) === JSON.stringify(given);
    return { score: isCorrect ? points : 0, isAutoGraded: true };
  }

  if (questionType === 'short_answer') {
    // Case-insensitive trim comparison
    if (!correctAnswer) return { score: null, isAutoGraded: false }; // no key defined, manual grade
    const isCorrect = (answerContent?.text ?? '').trim().toLowerCase() === correctAnswer.trim().toLowerCase();
    return { score: isCorrect ? points : 0, isAutoGraded: true };
  }

  // essay, coding_problem, spreadsheet_problem, file_upload → manual grading
  return { score: null, isAutoGraded: false };
};

/**
 * Recalculates and updates totalScore on a Submission from its answers.
 * Only counts answers where score is not null (i.e., already graded).
 */
export const recalculateTotalScore = async (submissionId) => {
  const answers = await prisma.answer.findMany({
    where: { submissionId },
    select: { score: true },
  });

  const allGraded = answers.every((a) => a.score !== null);
  const totalScore = answers.reduce((sum, a) => sum + (a.score ?? 0), 0);

  const updateData = { totalScore };
  if (allGraded) {
    updateData.status = 'graded';
    updateData.gradedAt = new Date();
  }

  return prisma.submission.update({ where: { id: submissionId }, data: updateData });
};

// ─── Activity CRUD ────────────────────────────────────────────────────────────

/**
 * Create a new activity with nested questions in a single transaction.
 * Only classroom OWNER can create activities.
 */
export const createActivity = async (classroomId, userId, payload) => {
  await assertClassroomOwner(classroomId, userId);

  const { title, description, activityType, deadline, totalPoints, allowLate, maxAttempts, config, status, questions = [] } = payload;

  // Build the ordered questions array, normalising option ids if not provided
  const questionData = questions.map((q, idx) => {
    const options = Array.isArray(q.options)
      ? q.options.map((o, oi) => ({ id: o.id ?? `opt-${idx}-${oi}`, text: o.text }))
      : null;
    return {
      questionType: q.questionType,
      content: q.content,
      options,
      correctAnswer: q.correctAnswer ?? null,
      points: q.points ?? 10,
      order: q.order ?? idx,
      config: q.config ?? null,
    };
  });

  const activity = await prisma.activity.create({
    data: {
      classroomId,
      createdBy: userId,
      title,
      description: description ?? null,
      activityType,
      deadline: deadline ? new Date(deadline) : null,
      totalPoints: totalPoints ?? 100,
      allowLate: allowLate ?? false,
      maxAttempts: maxAttempts ?? 1,
      status: status ?? 'published',
      config: config ?? null,
      questions: { create: questionData },
    },
    include: {
      questions: { orderBy: { order: 'asc' } },
      Creator: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
    },
  });

  return activity;
};

/**
 * Fetch a single activity. Members see the activity without correct answers;
 * the creator/owner sees correct answers too.
 */
export const getActivityById = async (activityId, userId) => {
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: {
      questions: { orderBy: { order: 'asc' } },
      Creator: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
      _count: { select: { submissions: true } },
    },
  });
  if (!activity) throw new ApiError(404, 'Activity not found');

  await assertClassroomMember(activity.classroomId, userId);

  const isEditor = activity.createdBy === userId;
  if (!isEditor) {
    // Check if classroom owner
    const member = await prisma.classroomUser.findUnique({
      where: { classroomId_userId: { classroomId: activity.classroomId, userId } },
    });
    const editorRole = member?.role === 'OWNER';
    if (!editorRole) {
      // Strip answer keys for students
      activity.questions = activity.questions.map((q) => {
        // eslint-disable-next-line no-unused-vars
        const { correctAnswer, ...rest } = q;
        return rest;
      });
    }
  }

  return activity;
};

/**
 * List all activities in a classroom, sorted newest first.
 * Students only see published/closed activities.
 */
export const getActivitiesByClassroom = async (classroomId, userId) => {
  const member = await assertClassroomMember(classroomId, userId);
  const isTeacher = member.role === 'OWNER';

  const where = { classroomId };
  if (!isTeacher) where.status = { in: ['published', 'closed'] };

  const activities = await prisma.activity.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      Creator: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
      _count: { select: { submissions: true, questions: true } },
    },
  });

  return activities;
};

/**
 * Update activity metadata and/or replace its questions.
 * Only the creator / classroom owner can update.
 * Cannot update a 'closed' activity.
 */
export const updateActivity = async (activityId, userId, payload) => {
  const activity = await assertActivityEditor(activityId, userId);
  if (activity.status === 'closed') throw new ApiError(400, 'Cannot edit a closed activity');

  const { title, description, activityType, deadline, totalPoints, allowLate, maxAttempts, config, status, questions } = payload;

  // If questions are provided, delete old ones and recreate (simple, safe approach)
  const updateData = {
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(activityType !== undefined && { activityType }),
    ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
    ...(totalPoints !== undefined && { totalPoints }),
    ...(allowLate !== undefined && { allowLate }),
    ...(maxAttempts !== undefined && { maxAttempts }),
    ...(status !== undefined && { status }),
    ...(config !== undefined && { config }),
  };

  if (questions !== undefined) {
    // Cascade delete is handled by Prisma on the Question model
    await prisma.question.deleteMany({ where: { activityId } });
    updateData.questions = {
      create: questions.map((q, idx) => {
        const options = Array.isArray(q.options)
          ? q.options.map((o, oi) => ({ id: o.id ?? `opt-${idx}-${oi}`, text: o.text }))
          : null;
        return {
          questionType: q.questionType,
          content: q.content,
          options,
          correctAnswer: q.correctAnswer ?? null,
          points: q.points ?? 10,
          order: q.order ?? idx,
          config: q.config ?? null,
        };
      }),
    };
  }

  const updated = await prisma.activity.update({
    where: { id: activityId },
    data: updateData,
    include: { questions: { orderBy: { order: 'asc' } } },
  });

  return updated;
};

/**
 * Publish a draft activity. Once published, students can see and submit it.
 */
export const publishActivity = async (activityId, userId) => {
  const activity = await assertActivityEditor(activityId, userId);
  if (activity.status === 'published') throw new ApiError(400, 'Activity is already published');
  if (activity.status === 'closed') throw new ApiError(400, 'Cannot re-publish a closed activity');

  return prisma.activity.update({
    where: { id: activityId },
    data: { status: 'published' },
  });
};

/**
 * Close an activity — no new submissions accepted.
 */
export const closeActivity = async (activityId, userId) => {
  const activity = await assertActivityEditor(activityId, userId);
  if (activity.status === 'closed') throw new ApiError(400, 'Activity is already closed');

  return prisma.activity.update({
    where: { id: activityId },
    data: { status: 'closed' },
  });
};

/**
 * Delete an activity (hard delete). Cascade removes questions and answers.
 * Only allowed on draft activities or by force (teacher decision).
 */
export const deleteActivity = async (activityId, userId) => {
  await assertActivityEditor(activityId, userId);

  await prisma.activity.delete({ where: { id: activityId } });
  return { message: 'Activity deleted successfully' };
};
