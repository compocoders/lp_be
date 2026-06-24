import * as submissionService from '../services/submission.service.js';

// ─── Submission endpoints ──────────────────────────────────────────────────────

export const submitActivity = async (req, res, next) => {
  try {
    const { activityId } = req.params;
    const { answers } = req.body;
    const submission = await submissionService.submitActivity(activityId, req.user.id, answers);
    res.status(201).json(submission);
  } catch (err) {
    next(err);
  }
};

export const getMySubmission = async (req, res, next) => {
  try {
    const submission = await submissionService.getMySubmission(req.params.activityId, req.user.id);
    res.status(200).json(submission);
  } catch (err) {
    next(err);
  }
};

export const getAllSubmissions = async (req, res, next) => {
  try {
    const { activityId } = req.params;
    const { page, limit } = req.query;
    const result = await submissionService.getAllSubmissions(activityId, req.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const gradeSubmission = async (req, res, next) => {
  try {
    const { submissionId } = req.params;
    const result = await submissionService.gradeSubmission(submissionId, req.user.id, req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

// ─── Gradebook endpoints ───────────────────────────────────────────────────────

export const getClassroomGradebook = async (req, res, next) => {
  try {
    const gradebook = await submissionService.getClassroomGradebook(req.params.classroomId, req.user.id);
    res.status(200).json(gradebook);
  } catch (err) {
    next(err);
  }
};

export const getStudentGrades = async (req, res, next) => {
  try {
    const grades = await submissionService.getStudentGrades(req.user.id);
    res.status(200).json(grades);
  } catch (err) {
    next(err);
  }
};
