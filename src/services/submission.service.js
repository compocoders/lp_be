import { prisma } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import {
  assertClassroomMember,
  autoGradeAnswer,
  recalculateTotalScore,
} from './activity.service.js';

// ─── Submission creation ──────────────────────────────────────────────────────

/**
 * Submit answers for an activity.
 *
 * Rules enforced:
 *  - Activity must be published (or allowLate + closed).
 *  - Student must be a classroom member.
 *  - Student cannot exceed maxAttempts.
 *  - Each answer content is validated to have a corresponding question.
 *  - MC and checkbox answers are auto-graded immediately.
 *  - Total score and status are computed and persisted atomically.
 */
export const submitActivity = async (activityId, studentId, answersPayload) => {
  // 1. Load activity + questions in one query
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: { questions: true },
  });
  if (!activity) throw new ApiError(404, 'Activity not found');

  // 2. Membership check
  await assertClassroomMember(activity.classroomId, studentId);

  // 3. Status guard
  const isLateAllowed = activity.allowLate && activity.status === 'closed';
  if (activity.status === 'draft') throw new ApiError(400, 'This activity is not yet published');
  if (activity.status === 'closed' && !isLateAllowed) {
    throw new ApiError(400, 'This activity is closed and no longer accepting submissions');
  }

  // 4. Deadline check (if set)
  if (activity.deadline && new Date() > new Date(activity.deadline) && !activity.allowLate) {
    throw new ApiError(400, 'The deadline for this activity has passed');
  }

  // 5. Attempt count guard
  const existingAttempts = await prisma.submission.count({
    where: { activityId, studentId },
  });
  if (existingAttempts >= activity.maxAttempts) {
    throw new ApiError(400, `You have reached the maximum number of attempts (${activity.maxAttempts}) for this activity`);
  }

  const attemptNumber = existingAttempts + 1;
  const isLate = activity.deadline && new Date() > new Date(activity.deadline);

  // 6. Build question map for fast lookup
  const questionMap = new Map(activity.questions.map((q) => [q.id, q]));

  // 7. Validate that all submitted answers reference valid questions
  for (const ans of answersPayload) {
    if (!questionMap.has(ans.questionId)) {
      throw new ApiError(400, `Invalid questionId: ${ans.questionId}`);
    }
  }

  // 8. Build answer records with auto-grading
  let computedTotal = 0;
  let allAutoGraded = true;

  const answerRecords = answersPayload.map((ans) => {
    const question = questionMap.get(ans.questionId);
    const { score, isAutoGraded } = autoGradeAnswer(question, ans.content);

    if (score !== null) computedTotal += score;
    else allAutoGraded = false;

    return {
      questionId: ans.questionId,
      content: ans.content,
      score,
      isAutoGraded,
    };
  });

  // 9. Persist submission + answers atomically
  const submission = await prisma.$transaction(async (tx) => {
    const sub = await tx.submission.create({
      data: {
        activityId,
        studentId,
        attemptNumber,
        status: isLate ? 'late' : 'submitted',
        maxScore: activity.totalPoints,
        totalScore: allAutoGraded ? computedTotal : null,
        gradedAt: allAutoGraded ? new Date() : null,
        ...(allAutoGraded && { status: 'graded' }),
        answers: { create: answerRecords },
      },
      include: { answers: true },
    });
    return sub;
  });

  return submission;
};

// ─── Retrieval ────────────────────────────────────────────────────────────────

/**
 * Student: get their own submission for an activity.
 */
export const getMySubmission = async (activityId, studentId) => {
  const submission = await prisma.submission.findFirst({
    where: { activityId, studentId },
    orderBy: { attemptNumber: 'desc' },
    include: {
      answers: {
        include: {
          Question: {
            select: { id: true, content: true, questionType: true, points: true, order: true },
          },
        },
        orderBy: { Question: { order: 'asc' } },
      },
    },
  });
  if (!submission) return null;
  return submission;
};

/**
 * Teacher: get all submissions for an activity with student info.
 * Supports optional pagination via { page, limit }.
 */
export const getAllSubmissions = async (activityId, teacherId, { page = 1, limit = 50 } = {}) => {
  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) throw new ApiError(404, 'Activity not found');

  // Only creator or classroom owner can view all submissions
  if (activity.createdBy !== teacherId) {
    const member = await prisma.classroomUser.findUnique({
      where: { classroomId_userId: { classroomId: activity.classroomId, userId: teacherId } },
    });
    if (!member || member.role !== 'OWNER') {
      throw new ApiError(403, 'Only the activity creator or classroom owner can view all submissions');
    }
  }

  const skip = (page - 1) * limit;
  const [submissions, total] = await Promise.all([
    prisma.submission.findMany({
      where: { activityId },
      orderBy: { submittedAt: 'desc' },
      skip,
      take: limit,
      include: {
        Student: {
          select: {
            id: true,
            email: true,
            profile: { select: { firstName: true, lastName: true, profilePicture: true } },
          },
        },
        answers: {
          include: {
            Question: { select: { id: true, content: true, questionType: true, points: true, order: true } },
          },
          orderBy: { Question: { order: 'asc' } },
        },
      },
    }),
    prisma.submission.count({ where: { activityId } }),
  ]);

  return { submissions, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Teacher: grade a specific submission (or update grades).
 * Accepts an array of { answerId, score, feedback } plus optional overall feedback.
 * After saving, recalculates the totalScore.
 */
export const gradeSubmission = async (submissionId, teacherId, { answers: gradedAnswers, feedback }) => {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { Activity: true },
  });
  if (!submission) throw new ApiError(404, 'Submission not found');

  const activity = submission.Activity;

  // Auth: creator or classroom owner
  if (activity.createdBy !== teacherId) {
    const member = await prisma.classroomUser.findUnique({
      where: { classroomId_userId: { classroomId: activity.classroomId, userId: teacherId } },
    });
    if (!member || member.role !== 'OWNER') {
      throw new ApiError(403, 'Only the activity creator or classroom owner can grade submissions');
    }
  }

  // Update each answer score/feedback
  if (Array.isArray(gradedAnswers) && gradedAnswers.length > 0) {
    await prisma.$transaction(
      gradedAnswers.map(({ answerId, score, feedback: answerFeedback }) =>
        prisma.answer.update({
          where: { id: answerId },
          data: {
            ...(score !== undefined && { score }),
            ...(answerFeedback !== undefined && { feedback: answerFeedback }),
            isAutoGraded: false,
          },
        })
      )
    );
  }

  // Update overall feedback if provided
  if (feedback !== undefined) {
    await prisma.submission.update({ where: { id: submissionId }, data: { feedback } });
  }

  // Recalculate total score (may mark as 'graded' if all answers now have scores)
  await recalculateTotalScore(submissionId);

  // Return the fully populated submission for the frontend
  return prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      Student: {
        select: {
          id: true,
          email: true,
          profile: { select: { firstName: true, lastName: true, profilePicture: true } },
        },
      },
      answers: {
        include: {
          Question: { select: { id: true, content: true, questionType: true, points: true, order: true } },
        },
        orderBy: { Question: { order: 'asc' } },
      },
    },
  });
};

// ─── Gradebook ────────────────────────────────────────────────────────────────

/**
 * Returns a gradebook summary for a classroom:
 * all activities + each student's submission status and score.
 * Only accessible by classroom owner.
 */
export const getClassroomGradebook = async (classroomId, teacherId) => {
  const member = await prisma.classroomUser.findUnique({
    where: { classroomId_userId: { classroomId, userId: teacherId } },
  });
  if (!member || member.role !== 'OWNER') {
    throw new ApiError(403, 'Only the classroom owner can access the gradebook');
  }

  // Get all users in the classroom (including teachers who might have submitted tests)
  const students = await prisma.classroomUser.findMany({
    where: { classroomId },
    include: {
      User: {
        select: {
          id: true,
          profile: { select: { firstName: true, lastName: true, profilePicture: true } },
        },
      },
    },
  });

  // Get all activities (excluding drafts for gradebook purposes)
  const activities = await prisma.activity.findMany({
    where: { classroomId, status: { in: ['published', 'closed'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true, totalPoints: true, activityType: true, deadline: true },
  });

  // Get all submissions for these activities
  const activityIds = activities.map((a) => a.id);
  const submissions = await prisma.submission.findMany({
    where: { activityId: { in: activityIds } },
    select: { activityId: true, studentId: true, totalScore: true, maxScore: true, status: true, submittedAt: true },
  });

  // Build a nested map: submissionMap[studentId][activityId] = submission
  const submissionMap = {};
  for (const sub of submissions) {
    if (!submissionMap[sub.studentId]) submissionMap[sub.studentId] = {};
    submissionMap[sub.studentId][sub.activityId] = sub;
  }

  // Assemble gradebook rows
  const rows = students.map(({ User }) => ({
    student: User,
    grades: activities.map((activity) => {
      const sub = submissionMap[User.id]?.[activity.id] ?? null;
      return {
        activityId: activity.id,
        activityTitle: activity.title,
        totalPoints: activity.totalPoints,
        submission: sub,
      };
    }),
  }));

  return { activities, students: rows };
};

/**
 * Student: get a summary of their grades across ALL classrooms they belong to.
 */
export const getStudentGrades = async (studentId) => {
  const memberships = await prisma.classroomUser.findMany({
    where: { userId: studentId },
    include: {
      Classroom: {
        select: { id: true, name: true, roomCode: true },
      },
    },
  });

  const results = await Promise.all(
    memberships.map(async ({ Classroom }) => {
      const activities = await prisma.activity.findMany({
        where: { classroomId: Classroom.id, status: { in: ['published', 'closed'] } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, title: true, totalPoints: true, activityType: true, deadline: true },
      });

      const submissions = await prisma.submission.findMany({
        where: {
          studentId,
          activityId: { in: activities.map((a) => a.id) },
        },
        select: { activityId: true, totalScore: true, maxScore: true, status: true, submittedAt: true },
      });

      const subMap = Object.fromEntries(submissions.map((s) => [s.activityId, s]));

      return {
        classroom: Classroom,
        activities: activities.map((a) => ({
          ...a,
          submission: subMap[a.id] ?? null,
        })),
      };
    })
  );

  return results;
};
