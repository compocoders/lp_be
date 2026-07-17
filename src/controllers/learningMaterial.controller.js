import * as learningMaterialsService from '../services/learningMaterials.service.js';
import * as s3Service from '../services/s3.service.js';


export const createLearningMaterial = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const classroomId = req.params.classroomId;
        const title = req.body.title;
        const description = req.body.description;

        if (!req.file) {
            return res.status(400).json({ message: 'A file is required to create a learning material.' });
        }

        //upload file to s3
        const { fileUrl, key } = await s3Service.uploadLearningMaterial(req.file);

        //create learning material
        const learningMaterial = await learningMaterialsService.createLearningMaterial({
            userId,
            classroomId,
            title,
            description,
            fileUrl,
        });
        res.status(201).json({
            message: 'Learning material created successfully',
            learningMaterial: learningMaterial
        });
    }
    catch (error) {
        next(error);
    }
}
export const getLearningMaterial = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const classroomId = req.params.classroomId;
        const learningMaterial = await learningMaterialsService.getLearningMaterial(classroomId);
        res.status(200).json({
            message: 'Learning material fetched successfully',
            learningMaterial: learningMaterial
        });
    }
    catch (error) {
        next(error);
    }
}

export const getLearningMaterialById = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const classroomId = req.params.classroomId;
        const learningMaterialId = req.params.learningMaterialId;
        const learningMaterial = await learningMaterialsService.getLearningMaterialById(learningMaterialId);
        res.status(200).json({
            message: 'Learning material fetched successfully',
            learningMaterial: learningMaterial
        });
    }
    catch (error) {
        next(error);
    }
}

export const updateLearningMaterial = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const classroomId = req.params.classroomId;
        const learningMaterialId = req.params.learningMaterialId;
        const title = req.body.title;
        const description = req.body.description;

        let fileUrl;
        if (req.file) {
            // Get existing material to delete old file from S3
            const existing = await learningMaterialsService.getLearningMaterialById(learningMaterialId);
            if (existing && existing.fileUrl) {
                await s3Service.deleteFile(existing.fileUrl);
            }
            // Upload new file
            const uploaded = await s3Service.uploadLearningMaterial(req.file);
            fileUrl = uploaded.fileUrl;
        }

        //update learning material
        const learningMaterial = await learningMaterialsService.updateLearningMaterial(learningMaterialId, {
            userId,
            classroomId,
            title,
            description,
            ...(fileUrl && { fileUrl }),
        });
        res.status(200).json({
            message: 'Learning material updated successfully',
            learningMaterial: learningMaterial
        });
    }
    catch (error) {
        next(error);
    }
}
export const deleteLearningMaterial = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const classroomId = req.params.classroomId;
        const learningMaterialId = req.params.learningMaterialId;

        //delete learning material
        const deletedMaterial = await learningMaterialsService.deleteLearningMaterial(learningMaterialId, userId);
        
        //delete file from s3
        if (deletedMaterial.fileUrl) {
            await s3Service.deleteFile(deletedMaterial.fileUrl);
        }

        res.status(200).json({
            message: 'Learning material deleted successfully',
            learningMaterial: deletedMaterial
        });
    }
    catch (error) {
        next(error);
    }
}