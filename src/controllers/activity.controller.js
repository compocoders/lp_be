import * as activityService from '../services/activity.service.js';

// ─── Activity CRUD ─────────────────────────────────────────────────────────────

export const createActivity = async (req, res, next) => {
  try {
    const { classroomId } = req.params;
    const activity = await activityService.createActivity(classroomId, req.user.id, req.body);
    res.status(201).json(activity);
  } catch (err) {
    next(err);
  }
};

export const getActivity = async (req, res, next) => {
  try {
    const activity = await activityService.getActivityById(req.params.activityId, req.user.id);
    res.status(200).json(activity);
  } catch (err) {
    next(err);
  }
};

export const listActivities = async (req, res, next) => {
  try {
    const activities = await activityService.getActivitiesByClassroom(req.params.classroomId, req.user.id);
    res.status(200).json(activities);
  } catch (err) {
    next(err);
  }
};

export const updateActivity = async (req, res, next) => {
  try {
    const activity = await activityService.updateActivity(req.params.activityId, req.user.id, req.body);
    res.status(200).json(activity);
  } catch (err) {
    next(err);
  }
};

export const publishActivity = async (req, res, next) => {
  try {
    const activity = await activityService.publishActivity(req.params.activityId, req.user.id);
    res.status(200).json(activity);
  } catch (err) {
    next(err);
  }
};

export const closeActivity = async (req, res, next) => {
  try {
    const activity = await activityService.closeActivity(req.params.activityId, req.user.id);
    res.status(200).json(activity);
  } catch (err) {
    next(err);
  }
};

export const deleteActivity = async (req, res, next) => {
  try {
    const result = await activityService.deleteActivity(req.params.activityId, req.user.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
