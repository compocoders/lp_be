import { prisma } from '../config/db.js';


export const createLearningMaterial = async (data) => {
    return prisma.learningMaterial.create({
        data: {
            ...data,
            userId: data.userId,
            classroomId: data.classroomId,
        }
    });
}

export const getLearningMaterial = async (classroomId) => {
    return prisma.learningMaterial.findMany({
        where: {
            classroomId: classroomId,
        }
    });
}

export const getLearningMaterialById = async (id) => {
    return prisma.learningMaterial.findUnique({
        where: { id: id },
    });
}

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