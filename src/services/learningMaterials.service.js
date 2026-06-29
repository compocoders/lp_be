/**
 * ─── Learning Materials Service ───────────────────────────────────────────────
 *
 * This service handles all business logic related to learning materials,
 * including creation, retrieval, updates, and deletion. It also ensures
 * that users can only modify or delete materials they created.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { prisma } from '../config/db.js';


/**
 * Creates a new learning material entry in the database.
 * @param {Object} data - The learning material data
 * @returns {Promise<Object>} The created learning material
 */
export const createLearningMaterial = async (data) => {
    return prisma.learningMaterial.create({
        data: {
            ...data,
            userId: data.userId,
            classroomId: data.classroomId,
        }
    });
}

/**
 * Fetches all learning materials for a specific classroom.
 * @param {string} classroomId - The ID of the classroom
 * @returns {Promise<Array>} List of learning materials
 */
export const getLearningMaterial = async (classroomId) => {
    return prisma.learningMaterial.findMany({
        where: {
            classroomId: classroomId,
        }
    });
}

/**
 * Fetches a single learning material by its ID.
 * @param {string} id - The ID of the learning material
 * @returns {Promise<Object|null>} The learning material object or null
 */
export const getLearningMaterialById = async (id) => {
    return prisma.learningMaterial.findUnique({
        where: { id: id },
    });
}

/**
 * Updates an existing learning material.
 * Ensures that only the creator can update the material.
 * @param {string} id - The ID of the learning material to update
 * @param {Object} data - The update payload
 * @returns {Promise<Object>} The updated learning material
 */
export const updateLearningMaterial = async (id, data) => {
    const learningMaterial = await prisma.learningMaterial.findUnique({
        where: { id: id },
    });
    if(!learningMaterial) {
        throw new Error('Learning material not found');
    }
    if(learningMaterial.userId !== data.userId) {
        throw new Error('Unauthorized');
    }
    return prisma.learningMaterial.update({
        where: { id: id },
        data: {
            ...(data.title && { title: data.title }),
            ...(data.description !== undefined && { description: data.description }),
            ...(data.fileUrl && { fileUrl: data.fileUrl }),
        }
    });
}

/**
 * Deletes a learning material.
 * Ensures that only the creator can delete the material.
 * @param {string} id - The ID of the learning material to delete
 * @param {string} userId - The ID of the user requesting deletion
 * @returns {Promise<Object>} The deleted learning material
 */
export const deleteLearningMaterial = async (id, userId) => {
    const learningMaterial = await prisma.learningMaterial.findUnique({
        where: { id: id },
    });
    if(!learningMaterial) {
        throw new Error('Learning material not found');
    }
    if(learningMaterial.userId !== userId) {
        throw new Error('Unauthorized');
    }
    return prisma.learningMaterial.delete({
        where: { id: id },
    });
}