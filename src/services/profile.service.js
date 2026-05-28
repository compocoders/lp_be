import { prisma } from '../config/db.js';

const checkProfileExists = async (userId) => {
  const profile = await prisma.profile.findUnique({
    where: { userId },
  });
  return !!profile;
};

const createProfile = async (userId, data) => {
    return checkProfileExists(userId).then(exists => {
        if (exists) {
            throw new Error('Profile already exists for this user');
        }
        return prisma.profile.create({
            data: {
                userId,
                ...data
            }
        });
    });
};

const updateProfile = async (userId, data) => {
    return checkProfileExists(userId).then(exists => {
        if (!exists) {
            throw new Error('Profile does not exist for this user');
        }
        return prisma.profile.update({
            where: { userId },
            data,
        });
    });
};

const getProfile = async (userId) => {
    return prisma.profile.findUnique({
        where: { userId },
    });
};

const getProfileById = async (profileId) => {
    return prisma.profile.findUnique({
        where: { id: profileId },
    });
};


export {
    createProfile,
    updateProfile,
    getProfile,
    getProfileById,
    checkProfileExists,
};