import { ApiError } from '../utils/ApiError.js';
import { prisma } from '../config/db.js';

export const requiredProfile = async (req, res, next) => {
    try {
        // 1. Safety check to prevent server crashes
        if (!req.user || !req.user.id) {
            throw new ApiError(401, 'Unauthorized - User not authenticated');
        }

        // 2. Query the database
        const profile = await prisma.profile.findUnique({
            where: { userId: req.user.id },
        });

        if (!profile) {
            // 3. Make sure the frontend gets a specific code to trigger the redirect
            // If ApiError doesn't support custom codes, you might want to return res.status(403) directly here.
            return res.status(403).json({
                success: false,
                code: 'PROFILE_INCOMPLETE',
                message: 'You must complete your profile first.'
            });
        }
        
        // Optional: Attach the profile to the request so downstream controllers can use it!
        req.profile = profile; 

        next();
    } catch (error) {
        next(error);
    }   
};

export const requireNoProfile = async (req, res, next) => {
    try {
        // 1. Safety check
        if (!req.user || !req.user.id) {
            throw new ApiError(401, 'Unauthorized - User not authenticated');
        }

        // 2. Query the database
        const profile = await prisma.profile.findUnique({
            where: { userId: req.user.id },
        });

        // 3. THE REVERSE LOGIC: If a profile EXISTS, block them!
        if (profile) {
            return res.status(403).json({
                success: false,
                code: 'PROFILE_ALREADY_EXISTS',
                message: 'You already have a profile. You do not need to create a new one.'
            });
        }
        
        // 4. If no profile exists, let them pass to the creation controller!
        next();
    } catch (error) {
        next(error);
    }   
};
