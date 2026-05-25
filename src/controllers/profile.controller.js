import profileService from '../services/profile.service.js';

export const createProfile = async (req, res, next) => {
    try {
        const result = await profileService.createProfile(req.user.id, req.body);
        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
};

export const updateProfile = async (req, res, next) => {
    try {
        const result = await profileService.updateProfile(req.user.id, req.body);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

export const getProfile = async (req, res, next) => {
    try {
        const result = await profileService.getProfile(req.user.id);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

export const getProfileById = async (req, res, next) => {
    try {
        const result = await profileService.getProfileById(req.params.id);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};