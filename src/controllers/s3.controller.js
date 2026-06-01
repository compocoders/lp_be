import * as s3Service from '../services/s3.service.js';
import { prisma } from '../config/db.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

export const uploadProfilePicture = async (req, res, next) => {
    try {
        if (!req.file) {
            throw new ApiError(400, 'No file provided');
        }

        const userId = req.user.id;

        // Upload new picture
        const { fileUrl, key } = await s3Service.uploadProfilePicture(req.file);

        // Fetch current profile to check if there's an old picture
        const profile = await prisma.profile.findUnique({
            where: { userId }
        });

        if (profile?.profilePicture) {
             const oldUrl = profile.profilePicture;
             const publicUrl = env.R2_PUBLIC_URL;
             if (publicUrl && oldUrl.startsWith(publicUrl)) {
                 const oldKey = oldUrl.replace(`${publicUrl}/`, '');
                 await s3Service.deleteFile(oldKey);
             }
        }

        // Update the profile with the new picture URL
        const updatedProfile = await prisma.profile.upsert({
            where: { userId },
            update: { profilePicture: fileUrl },
            create: { userId, profilePicture: fileUrl }
        });

        res.status(200).json({
            message: 'Profile picture uploaded successfully',
            profilePicture: updatedProfile.profilePicture
        });
    } catch (error) {
        next(error);
    }
};
