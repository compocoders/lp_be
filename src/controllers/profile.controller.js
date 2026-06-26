import * as profileService from '../services/profile.service.js';
import * as s3Service from '../services/s3.service.js';

export const createProfile = async (req, res, next) => {
    try {
        let fileUrl = null;
        if (req.file) {
            const uploadResult = await s3Service.uploadProfilePicture(req.file);
            fileUrl = uploadResult.fileUrl;
        }

        const profileData = { ...req.body };
        if (fileUrl) profileData.profilePicture = fileUrl;

        const result = await profileService.createProfile(req.user.id, profileData);
        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
};

export const updateProfile = async (req, res, next) => {
    try {
        let fileUrl = null;
        let oldFileUrl = null;

        // Fetch existing profile to get the old profilePicture URL
        const existingProfile = await profileService.getProfile(req.user.id);
        if (existingProfile) {
            oldFileUrl = existingProfile.profilePicture;
        }

        if (req.file) {
            const uploadResult = await s3Service.uploadProfilePicture(req.file);
            fileUrl = uploadResult.fileUrl;
            
            // Delete the old profile picture if a new one is successfully uploaded
            if (oldFileUrl) {
                await s3Service.deleteFile(oldFileUrl);
            }
        }

        const profileData = { ...req.body };
        if (fileUrl) profileData.profilePicture = fileUrl;

        const result = await profileService.updateProfile(req.user.id, profileData);
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